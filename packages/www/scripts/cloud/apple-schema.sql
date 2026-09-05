-- Apple grants and durable account deletion. Apply after schema.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS morpheus_account_deletions (
  deletion_id uuid PRIMARY KEY,
  recovery_token_hash text NOT NULL CHECK (length(recovery_token_hash) = 64),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deleted')),
  apple_status text NOT NULL DEFAULT 'not_required'
    CHECK (apple_status IN ('not_required', 'queued', 'revoked', 'manual_required')),
  target_hash text UNIQUE,
  encrypted_target text,
  hosted_checked boolean DEFAULT false,
  attempts integer DEFAULT 0,
  next_attempt_at timestamptz DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((status = 'pending' AND target_hash IS NOT NULL AND encrypted_target IS NOT NULL)
    OR (status = 'deleted' AND target_hash IS NULL AND encrypted_target IS NULL
      AND hosted_checked IS NULL AND attempts IS NULL AND next_attempt_at IS NULL
      AND lease_id IS NULL AND lease_until IS NULL AND completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS morpheus_account_deletions_pending
  ON morpheus_account_deletions(next_attempt_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS morpheus_apple_grants (
  id uuid PRIMARY KEY,
  clerk_user_hash text NOT NULL,
  code_hash text NOT NULL UNIQUE,
  encrypted_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reservation_deadline timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS morpheus_apple_grants_owner ON morpheus_apple_grants(clerk_user_hash);

-- Once queued, no Clerk/Apple subject, email, profile, game or report linkage remains.
-- The receipt ID only updates a capability-protected status; token ciphertext is erased
-- on success, or after 30 days / 30 attempts with manual_required status.
CREATE TABLE IF NOT EXISTS morpheus_apple_revocations (
  id uuid PRIMARY KEY,
  deletion_id uuid REFERENCES morpheus_account_deletions(deletion_id),
  encrypted_token text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS morpheus_apple_revocations_due ON morpheus_apple_revocations(next_attempt_at);

-- This lock is also used by foundation player registration and Clerk erasure.
CREATE OR REPLACE FUNCTION morpheus_apple_erase_account(p_user_id text, p_user_hash text, p_confirmed boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_hash, 0));
  SELECT deletion_id INTO v_id FROM morpheus_account_deletions WHERE target_hash = p_user_hash;
  INSERT INTO morpheus_deleted_accounts(clerk_user_hash) VALUES (p_user_hash)
    ON CONFLICT (clerk_user_hash) DO UPDATE SET deleted_at = now();
  DELETE FROM morpheus_players WHERE clerk_user_id = p_user_id OR associated_player_id IN (
    SELECT id FROM morpheus_players WHERE clerk_user_id = p_user_id
  );
  WITH grants AS (DELETE FROM morpheus_apple_grants WHERE clerk_user_hash = p_user_hash RETURNING *)
    INSERT INTO morpheus_apple_revocations(id, deletion_id, encrypted_token, expires_at)
      SELECT id, v_id, encrypted_token, CASE WHEN encrypted_token IS NULL THEN reservation_deadline
        ELSE now() + interval '30 days' END FROM grants ON CONFLICT (id) DO NOTHING;
  UPDATE morpheus_account_deletions SET apple_status = 'queued', updated_at = now()
    WHERE deletion_id = v_id AND apple_status != 'manual_required' AND EXISTS (
      SELECT 1 FROM morpheus_apple_revocations WHERE deletion_id = v_id
    );
  IF p_confirmed THEN
    UPDATE morpheus_account_deletions SET status = 'deleted', target_hash = NULL,
      apple_status = CASE WHEN hosted_checked = false AND apple_status = 'not_required'
        THEN 'manual_required' ELSE apple_status END,
      encrypted_target = NULL, hosted_checked = NULL, attempts = NULL, next_attempt_at = NULL,
      lease_id = NULL, lease_until = NULL, updated_at = now(), completed_at = now()
      WHERE deletion_id = v_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION morpheus_begin_account_deletion(
  p_id uuid, p_token_hash text, p_user_id text, p_user_hash text, p_encrypted_target text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_existing morpheus_account_deletions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_hash, 0));
  SELECT * INTO v_existing FROM morpheus_account_deletions WHERE deletion_id = p_id;
  IF FOUND THEN
    IF v_existing.recovery_token_hash = p_token_hash THEN RETURN 'existing'; END IF;
    RETURN 'denied';
  END IF;
  IF EXISTS (SELECT 1 FROM morpheus_account_deletions WHERE target_hash = p_user_hash)
    OR EXISTS (SELECT 1 FROM morpheus_deleted_accounts WHERE clerk_user_hash = p_user_hash)
    THEN RETURN 'already_requested';
  END IF;
  INSERT INTO morpheus_account_deletions(deletion_id, recovery_token_hash, target_hash, encrypted_target)
    VALUES (p_id, p_token_hash, p_user_hash, p_encrypted_target) ON CONFLICT (deletion_id) DO NOTHING;
  IF NOT FOUND THEN RETURN 'denied'; END IF;
  PERFORM morpheus_apple_erase_account(p_user_id, p_user_hash, false);
  RETURN 'accepted';
END;
$$;

-- Admission precedes Apple I/O. Deletion moves the exact reservation UUID, so late
-- completion needs no retained user-to-receipt mapping and cannot bypass its status.
CREATE OR REPLACE FUNCTION morpheus_reserve_apple_grant(p_id uuid, p_user_hash text, p_code_hash text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_grant morpheus_apple_grants%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_hash, 0));
  IF EXISTS (SELECT 1 FROM morpheus_deleted_accounts WHERE clerk_user_hash = p_user_hash) THEN
    RETURN jsonb_build_object('status', 'deleted');
  END IF;
  SELECT * INTO v_grant FROM morpheus_apple_grants WHERE code_hash = p_code_hash;
  IF FOUND THEN
    IF v_grant.clerk_user_hash != p_user_hash THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    RETURN jsonb_build_object('status', CASE WHEN v_grant.encrypted_token IS NOT NULL THEN 'stored'
      WHEN v_grant.reservation_deadline <= now() THEN 'uncertain' ELSE 'pending' END);
  END IF;
  INSERT INTO morpheus_apple_grants(id, clerk_user_hash, code_hash, encrypted_token)
    VALUES (p_id, p_user_hash, p_code_hash, NULL) ON CONFLICT (code_hash) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'pending'); END IF;
  RETURN jsonb_build_object('status', 'reserved', 'id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION morpheus_complete_apple_grant(p_id uuid, p_user_hash text, p_encrypted_token text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_hash, 0));
  UPDATE morpheus_apple_grants SET encrypted_token = COALESCE(encrypted_token, p_encrypted_token)
    WHERE id = p_id AND clerk_user_hash = p_user_hash AND NOT EXISTS (
      SELECT 1 FROM morpheus_deleted_accounts WHERE clerk_user_hash = p_user_hash
    );
  IF FOUND THEN RETURN true; END IF;
  UPDATE morpheus_apple_revocations SET
    expires_at = CASE WHEN encrypted_token IS NULL THEN now() + interval '30 days' ELSE expires_at END,
    encrypted_token = COALESCE(encrypted_token, p_encrypted_token)
    WHERE id = p_id;
  IF FOUND THEN RETURN false; END IF;
  -- An expired deletion reservation already made its receipt manual_required. A
  -- very late provider/DB completion may revoke, but must never recreate active data.
  INSERT INTO morpheus_apple_revocations(id, encrypted_token) VALUES (p_id, p_encrypted_token)
    ON CONFLICT (id) DO NOTHING;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION morpheus_finish_apple_revocation(p_id uuid, p_lease uuid, p_success boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_job morpheus_apple_revocations%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM morpheus_apple_revocations WHERE id = p_id AND lease_id = p_lease FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_success AND v_job.encrypted_token IS NULL THEN
    RAISE EXCEPTION 'An unresolved Apple reservation cannot be revoked';
  END IF;
  -- Serialize completion of different tokens for the same receipt before counting them.
  PERFORM 1 FROM morpheus_account_deletions WHERE deletion_id = v_job.deletion_id FOR UPDATE;
  IF p_success OR v_job.expires_at <= now() OR v_job.attempts >= 30 THEN
    DELETE FROM morpheus_apple_revocations WHERE id = p_id;
    IF NOT p_success THEN
      UPDATE morpheus_account_deletions SET apple_status = 'manual_required', updated_at = now()
        WHERE deletion_id = v_job.deletion_id;
    ELSIF NOT EXISTS (SELECT 1 FROM morpheus_apple_revocations WHERE deletion_id = v_job.deletion_id) THEN
      UPDATE morpheus_account_deletions SET apple_status = 'revoked', updated_at = now()
        WHERE deletion_id = v_job.deletion_id AND apple_status = 'queued';
    END IF;
  ELSE
    UPDATE morpheus_apple_revocations SET lease_id = NULL, lease_until = NULL,
      next_attempt_at = now() + interval '1 day' WHERE id = p_id;
  END IF;
END;
$$;

COMMIT;
