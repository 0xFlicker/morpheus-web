-- Morpheus Cloud: initial schema. Apply explicitly with cloud:db:apply.
-- Ownership is resolved by the server; no browser receives database credentials.
BEGIN;

-- A short-lived hash fences retrying tokens after account deletion. No profile is retained.
CREATE TABLE IF NOT EXISTS morpheus_deleted_accounts (
  clerk_user_hash text PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS morpheus_players (
  id uuid PRIMARY KEY,
  clerk_user_id text UNIQUE,
  anonymous_secret_hash text UNIQUE,
  associated_player_id uuid REFERENCES morpheus_players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CHECK ((clerk_user_id IS NULL) <> (anonymous_secret_hash IS NULL))
);

CREATE TABLE IF NOT EXISTS morpheus_saves (
  player_id uuid NOT NULL REFERENCES morpheus_players(id) ON DELETE CASCADE,
  slot_id text NOT NULL CHECK (slot_id IN ('slot-1', 'slot-2', 'slot-3')),
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  payload jsonb,
  progress_hash text NOT NULL,
  device_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, slot_id),
  CHECK (payload IS NULL OR octet_length(payload::text) <= 2097152)
);

CREATE TABLE IF NOT EXISTS morpheus_save_mutations (
  player_id uuid NOT NULL REFERENCES morpheus_players(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, mutation_id)
);
CREATE INDEX IF NOT EXISTS morpheus_save_mutations_age ON morpheus_save_mutations(created_at);
CREATE INDEX IF NOT EXISTS morpheus_save_mutations_player_age ON morpheus_save_mutations(player_id, created_at);

CREATE TABLE IF NOT EXISTS morpheus_sessions (
  player_id uuid NOT NULL REFERENCES morpheus_players(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  device_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'macos')),
  app_version text NOT NULL CHECK (length(app_version) <= 80),
  active_run_id uuid,
  active_scene_id integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, session_id)
);
CREATE INDEX IF NOT EXISTS morpheus_sessions_recent ON morpheus_sessions(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS morpheus_bug_reports (
  id uuid PRIMARY KEY,
  player_id uuid REFERENCES morpheus_players(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'macos')),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 10000),
  scene_id integer,
  app_version text NOT NULL CHECK (length(app_version) <= 80),
  attachment_path text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, request_id)
);
CREATE INDEX IF NOT EXISTS morpheus_bug_reports_recent ON morpheus_bug_reports(created_at DESC);

-- Keys are short-lived keyed hashes, never raw IP addresses.
CREATE TABLE IF NOT EXISTS morpheus_rate_limits (
  bucket text PRIMARY KEY,
  hits integer NOT NULL CHECK (hits > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS morpheus_rate_limits_age ON morpheus_rate_limits(expires_at);

-- Lock the player, not a possibly absent slot. This serializes first writes,
-- concurrent devices, and retry lookup in the same transaction.
CREATE OR REPLACE FUNCTION morpheus_write_save(
  p_player_id uuid, p_slot_id text, p_expected_revision bigint,
  p_mutation_id uuid, p_device_id uuid, p_payload jsonb,
  p_progress_hash text, p_request_hash text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  current_save morpheus_saves%ROWTYPE;
  previous_mutation morpheus_save_mutations%ROWTYPE;
  current_revision bigint;
  result jsonb;
  result_status text;
  receipt jsonb;
  retained_count bigint;
  daily_count bigint;
  oldest_receipt timestamptz;
  retry_after integer;
BEGIN
  PERFORM 1 FROM morpheus_players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player unavailable'; END IF;
  IF p_slot_id NOT IN ('slot-1', 'slot-2', 'slot-3') OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Invalid save write';
  END IF;

  SELECT * INTO current_save FROM morpheus_saves
    WHERE player_id = p_player_id AND slot_id = p_slot_id;
  current_revision := coalesce(current_save.revision, 0);

  SELECT * INTO previous_mutation FROM morpheus_save_mutations
    WHERE player_id = p_player_id AND mutation_id = p_mutation_id;
  IF FOUND THEN
    IF previous_mutation.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('status', 'mutation-reused');
    END IF;
    IF previous_mutation.result->>'status' = 'saved' THEN
      RETURN jsonb_build_object('status', 'saved', 'slot', jsonb_build_object(
        'slotId', p_slot_id, 'revision', previous_mutation.result->'revision',
        'updatedAt', previous_mutation.result->'updatedAt',
        'save', CASE WHEN p_payload IS NULL OR previous_mutation.result->'checkpoint' = 'null'::jsonb
          THEN p_payload ELSE jsonb_set(p_payload, '{envelope}',
            (p_payload->'envelope') || (previous_mutation.result->'checkpoint')) END
      ));
    END IF;
    -- A rejected mutation remains rejected. Its retry describes the current competing version.
    RETURN jsonb_build_object('status', 'conflict', 'slot', jsonb_build_object(
      'slotId', p_slot_id, 'revision', current_revision, 'save', current_save.payload,
      'updatedAt', current_save.updated_at
    ));
  END IF;

  SELECT count(*), count(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
    min(created_at) INTO retained_count, daily_count, oldest_receipt
    FROM morpheus_save_mutations WHERE player_id = p_player_id;
  IF retained_count >= 100000 OR daily_count >= 25000 THEN
    retry_after := greatest(60, ceil(extract(epoch FROM greatest(
      CASE WHEN retained_count >= 100000 THEN oldest_receipt + interval '30 days' ELSE now() END,
      CASE WHEN daily_count >= 25000 THEN (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC' ELSE now() END
    ) - now()))::integer);
    RETURN jsonb_build_object('status', 'quota-exceeded', 'retryAfterSeconds', retry_after);
  END IF;

  IF p_expected_revision <> current_revision AND
     current_save.progress_hash IS DISTINCT FROM p_progress_hash THEN
    result_status := 'conflict';
  ELSE
    result_status := 'saved';
    IF current_save.progress_hash IS DISTINCT FROM p_progress_hash THEN
      INSERT INTO morpheus_saves(player_id, slot_id, revision, payload, progress_hash, device_id)
        VALUES (p_player_id, p_slot_id, current_revision + 1, p_payload, p_progress_hash, p_device_id)
        ON CONFLICT (player_id, slot_id) DO UPDATE SET
          revision = EXCLUDED.revision, payload = EXCLUDED.payload,
          progress_hash = EXCLUDED.progress_hash, device_id = EXCLUDED.device_id,
          updated_at = now()
        RETURNING * INTO current_save;
      current_revision := current_save.revision;
    ELSIF p_expected_revision = current_revision AND current_save.payload IS DISTINCT FROM p_payload THEN
      -- A changed view is durable, but does not advance the gameplay revision or
      -- create a competing journey. Stale equivalent writes never replace it.
      UPDATE morpheus_saves SET payload = p_payload, device_id = p_device_id, updated_at = now()
        WHERE player_id = p_player_id AND slot_id = p_slot_id
        RETURNING * INTO current_save;
    END IF;
  END IF;

  result := jsonb_build_object('status', result_status, 'slot', jsonb_build_object(
    'slotId', p_slot_id, 'revision', current_revision, 'save', current_save.payload,
    'updatedAt', current_save.updated_at
  ));
  -- Receipts retain acceptance metadata, not another full save per request.
  -- All remaining payload fields are covered by the request/progress hashes.
  receipt := jsonb_build_object('status', result_status);
  IF result_status = 'saved' THEN
    receipt := receipt || jsonb_build_object('revision', current_revision, 'updatedAt', current_save.updated_at,
      'checkpoint', CASE WHEN current_save.payload->'envelope' IS NULL THEN NULL ELSE jsonb_build_object(
        'savedAt', current_save.payload->'envelope'->'savedAt',
        'resumePointId', current_save.payload->'envelope'->'resumePointId',
        'rotation', current_save.payload->'envelope'->'rotation'
      ) END);
  END IF;
  IF octet_length(receipt::text) > 2048 THEN RAISE EXCEPTION 'Save receipt exceeds storage budget'; END IF;
  INSERT INTO morpheus_save_mutations(player_id, mutation_id, request_hash, result)
    VALUES (p_player_id, p_mutation_id, p_request_hash, receipt);
  UPDATE morpheus_players SET last_seen_at = now(),
    expires_at = CASE WHEN anonymous_secret_hash IS NOT NULL THEN now() + interval '90 days' ELSE NULL END
    WHERE id = p_player_id;
  RETURN result;
END;
$$;

COMMIT;
