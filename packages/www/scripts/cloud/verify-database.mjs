import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (process.env.VERCEL_ENV === 'production')
  throw new Error('Run this against the isolated development database');
const sql = neon(process.env.DATABASE_URL);
const players = [randomUUID(), randomUUID()];
const deviceId = randomUUID();
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const write = async (
  playerId,
  revision,
  payload,
  mutationId = randomUUID(),
  options = {},
) => {
  const slotId = options.slotId ?? 'slot-1';
  const request = { slotId, revision, payload, mutationId, deviceId };
  const rows = await sql`SELECT morpheus_write_save(
    ${playerId}::uuid, ${slotId}, ${revision}::bigint, ${mutationId}::uuid,
    ${deviceId}::uuid, ${payload === null ? null : JSON.stringify(payload)}::jsonb,
    ${options.progressHash ?? digest(payload)}, ${digest(request)}
  ) AS result`;
  return rows[0].result;
};

try {
  for (const player of players) {
    await sql`INSERT INTO morpheus_players(id, anonymous_secret_hash, expires_at)
      VALUES (${player}, ${digest(randomUUID())}, now() + interval '1 hour')`;
  }
  // These synthetic payloads test the database transaction, not authored game legality.
  const competing = await Promise.all([
    write(players[0], 0, { state: 'first-device' }),
    write(players[0], 0, { state: 'second-device' }),
  ]);
  assert.deepEqual(competing.map((result) => result.status).sort(), [
    'conflict',
    'saved',
  ]);
  assert.ok(competing.every((result) => result.slot.revision === 1));
  const original = competing.find((result) => result.status === 'saved').slot
    .save;
  const mutationId = randomUUID();
  const advanced = { state: 'advanced' };
  const accepted = await write(players[0], 1, advanced, mutationId);
  assert.equal(accepted.slot.revision, 2);
  assert.deepEqual(await write(players[0], 1, advanced, mutationId), accepted);
  const [receipt] =
    await sql`SELECT result FROM morpheus_save_mutations WHERE player_id = ${players[0]} AND mutation_id = ${mutationId}`;
  assert.ok(
    !JSON.stringify(receipt.result).includes('advanced'),
    'Receipt must not duplicate the save payload',
  );
  assert.deepEqual(
    await write(players[0], 1, { state: 'tampered' }, mutationId),
    { status: 'mutation-reused' },
  );
  assert.equal((await write(players[0], 1, original)).status, 'conflict');
  assert.equal((await write(players[0], 0, advanced)).slot.revision, 2);
  const independent = await write(players[1], 0, { state: 'another-player' });
  assert.equal(independent.status, 'saved');
  assert.equal(independent.slot.revision, 1);
  const deleted = await write(players[0], 2, null);
  assert.equal(deleted.slot.revision, 3);
  assert.equal(deleted.slot.save, null);
  const staleAfterDelete = await write(players[0], 2, {
    state: 'offline-progress',
  });
  assert.equal(staleAfterDelete.status, 'conflict');
  assert.equal(staleAfterDelete.slot.save, null);
  const rows =
    await sql`SELECT revision FROM morpheus_saves WHERE player_id = ${players[1]}`;
  assert.equal(Number(rows[0].revision), 1);

  // Equivalent progress can have different checkpoint metadata. A stale request
  // acknowledges the stored checkpoint; its retry must retain that exact reply.
  const canonicalCheckpoint = {
    runId: randomUUID(),
    source: 'played',
    discoveredSceneIds: [1050],
    envelope: {
      format: 'morpheus-living-save-session',
      schemaVersion: 1,
      gameDataVersion: 1,
      resumePointId: 'canonical-checkpoint',
      savedAt: 1700000000000,
      activeSceneId: 1050,
      returnSceneId: null,
      gamestateValues: { 1: 0 },
      rotation: { yaw3600: 100, pitch: 10 },
    },
  };
  const sameProgress = {
    slotId: 'slot-2',
    progressHash: digest(canonicalCheckpoint),
  };
  const initialCheckpoint = await write(
    players[0],
    0,
    canonicalCheckpoint,
    randomUUID(),
    sameProgress,
  );
  const staleCheckpoint = {
    ...canonicalCheckpoint,
    envelope: {
      ...canonicalCheckpoint.envelope,
      resumePointId: 'stale-device-checkpoint',
      savedAt: 1700000001000,
      rotation: { yaw3600: 200, pitch: -10 },
    },
  };
  const staleCheckpointId = randomUUID();
  const acceptedStaleCheckpoint = await write(
    players[0],
    0,
    staleCheckpoint,
    staleCheckpointId,
    sameProgress,
  );
  assert.deepEqual(
    acceptedStaleCheckpoint,
    initialCheckpoint,
    'Stale equivalent progress must acknowledge canonical checkpoint metadata',
  );
  const newerCheckpoint = {
    ...canonicalCheckpoint,
    envelope: {
      ...canonicalCheckpoint.envelope,
      resumePointId: 'newer-camera-checkpoint',
      savedAt: 1700000002000,
      rotation: { yaw3600: 300, pitch: 20 },
    },
  };
  const updatedCheckpoint = await write(
    players[0],
    1,
    newerCheckpoint,
    randomUUID(),
    sameProgress,
  );
  assert.equal(updatedCheckpoint.status, 'saved');
  assert.equal(
    updatedCheckpoint.slot.revision,
    1,
    'Camera-only changes must not advance progress revision',
  );
  assert.deepEqual(updatedCheckpoint.slot.save, newerCheckpoint);
  assert.deepEqual(
    await write(
      players[0],
      0,
      staleCheckpoint,
      staleCheckpointId,
      sameProgress,
    ),
    acceptedStaleCheckpoint,
    'A stale equivalent-progress retry must reproduce its accepted metadata after a newer checkpoint',
  );
  const [persistedCheckpoint] =
    await sql`SELECT payload FROM morpheus_saves WHERE player_id = ${players[0]} AND slot_id = 'slot-2'`;
  assert.deepEqual(
    persistedCheckpoint.payload,
    newerCheckpoint,
    'Retrying the old receipt must not replace the current checkpoint',
  );
  const nextProgress = { ...newerCheckpoint, discoveredSceneIds: [1050, 1060] };
  const advancedCheckpoint = await write(
    players[0],
    1,
    nextProgress,
    randomUUID(),
    { slotId: 'slot-2' },
  );
  assert.equal(advancedCheckpoint.slot.revision, 2);
  assert.deepEqual(
    await write(
      players[0],
      0,
      staleCheckpoint,
      staleCheckpointId,
      sameProgress,
    ),
    acceptedStaleCheckpoint,
    'Receipt reconstruction must also preserve its accepted revision after later progress',
  );

  const acceptedRetryId = randomUUID();
  const acceptedBeforeQuota = await write(
    players[1],
    1,
    { state: 'before-budget' },
    acceptedRetryId,
  );
  await sql`INSERT INTO morpheus_save_mutations(player_id, mutation_id, request_hash, result)
    SELECT ${players[1]}::uuid, gen_random_uuid(), 'budget-test', '{"status":"conflict"}'::jsonb FROM generate_series(1, 25000)`;
  const rejected = await write(players[1], 2, { state: 'over-budget' });
  assert.equal(rejected.status, 'quota-exceeded');
  assert.ok(rejected.retryAfterSeconds > 0);
  assert.deepEqual(
    await write(players[1], 1, { state: 'before-budget' }, acceptedRetryId),
    acceptedBeforeQuota,
  );
  const [unchanged] =
    await sql`SELECT revision, payload FROM morpheus_saves WHERE player_id = ${players[1]}`;
  assert.equal(Number(unchanged.revision), 2);
  assert.deepEqual(unchanged.payload, { state: 'before-budget' });
  console.log(
    'Passed real Postgres: concurrent writes/conflicts, compact retry receipts with canonical checkpoint metadata, mutation reuse, equivalent progress and camera updates, player isolation, deletion/offline update and serialized quota without blocking accepted retries.',
  );
} finally {
  for (const player of players)
    await sql`DELETE FROM morpheus_players WHERE id = ${player}`;
}
