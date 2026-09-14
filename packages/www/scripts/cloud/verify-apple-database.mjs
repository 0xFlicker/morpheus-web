import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';

// Run only against an isolated development database. No Apple/Clerk API is called.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const users = [];
const ids = [];
const grantIds = [];
function fixture() {
  const user = `verify_apple_${randomUUID()}`;
  const id = randomUUID();
  const token = randomUUID();
  users.push(user);
  ids.push(id);
  return { user, id, token, userHash: hash(user) };
}
async function begin(f, id = f.id) {
  return (
    await pool.query(
      'SELECT morpheus_begin_account_deletion($1,$2,$3,$4,$5) AS result',
      [id, hash(f.token), f.user, f.userHash, 'test-only-encrypted-target'],
    )
  ).rows[0].result;
}
async function reserve(f, code = randomUUID()) {
  const id = randomUUID();
  grantIds.push(id);
  return (
    await pool.query(
      'SELECT morpheus_reserve_apple_grant($1,$2,$3) AS result',
      [id, f.userHash, hash(code)],
    )
  ).rows[0].result;
}
async function complete(f, id) {
  return (
    await pool.query(
      'SELECT morpheus_complete_apple_grant($1,$2,$3) AS stored',
      [id, f.userHash, 'test-only-encrypted-token'],
    )
  ).rows[0].stored;
}
async function grant(f) {
  const reservation = await reserve(f);
  if (reservation.status === 'deleted') return false;
  assert.equal(reservation.status, 'reserved');
  return complete(f, reservation.id);
}
async function receipt(id) {
  return (
    await pool.query(
      'SELECT * FROM morpheus_account_deletions WHERE deletion_id = $1',
      [id],
    )
  ).rows[0];
}

try {
  const f = fixture();
  const playerId = randomUUID();
  const guestId = randomUUID();
  await pool.query(
    'INSERT INTO morpheus_players(id,clerk_user_id) VALUES ($1,$2)',
    [playerId, f.user],
  );
  await pool.query(
    'INSERT INTO morpheus_players(id,anonymous_secret_hash,associated_player_id) VALUES ($1,$2,$3)',
    [guestId, hash(randomUUID()), playerId],
  );
  assert.equal(await grant(f), true);
  assert.equal(await grant(f), true);
  const late = await reserve(f, 'late-code');
  const lateSecond = await reserve(f, 'another-late-code');
  assert.equal(late.status, 'reserved');
  assert.equal((await reserve(f, 'late-code')).status, 'pending');
  assert.equal(await begin(f), 'accepted');
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM morpheus_players WHERE id = ANY($1::uuid[])',
        [[playerId, guestId]],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM morpheus_apple_grants WHERE clerk_user_hash = $1',
        [f.userHash],
      )
    ).rowCount,
    0,
  );
  assert.equal((await receipt(f.id)).apple_status, 'queued');
  assert.equal(await begin(f), 'existing');
  assert.equal(await begin({ ...f, token: 'wrong' }), 'denied');
  const competingId = randomUUID();
  ids.push(competingId);
  assert.equal(await begin(f, competingId), 'already_requested');
  assert.equal(await receipt(competingId), undefined);
  assert.equal(await grant(f), false);
  await pool.query('SELECT morpheus_apple_erase_account($1,$2,true)', [
    f.user,
    f.userHash,
  ]);
  const completed = await receipt(f.id);
  assert.equal(completed.status, 'deleted');
  for (const name of [
    'target_hash',
    'encrypted_target',
    'hosted_checked',
    'attempts',
    'next_attempt_at',
    'lease_id',
    'lease_until',
  ])
    assert.equal(completed[name], null, `${name} retained after completion`);
  assert.ok(completed.completed_at);
  assert.equal(
    (
      await pool.query(
        'SELECT deletion_id FROM morpheus_account_deletions WHERE deletion_id=$1 AND recovery_token_hash=$2',
        [f.id, hash(f.token)],
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await pool.query(
        'SELECT deletion_id FROM morpheus_account_deletions WHERE deletion_id=$1 AND recovery_token_hash=$2',
        [f.id, hash('wrong')],
      )
    ).rowCount,
    0,
  );
  assert.equal(await begin(f), 'existing');

  // Already-confirmed Clerk deletion must remain queued while an admitted Apple
  // exchange has not returned. Revoking an existing token cannot finalize it.
  const known = (
    await pool.query(
      'UPDATE morpheus_apple_revocations SET lease_id=$2 WHERE deletion_id=$1 AND encrypted_token IS NOT NULL RETURNING id,lease_id',
      [f.id, randomUUID()],
    )
  ).rows;
  await Promise.all(
    known.map((job) =>
      pool.query('SELECT morpheus_finish_apple_revocation($1,$2,true)', [
        job.id,
        job.lease_id,
      ]),
    ),
  );
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM morpheus_apple_revocations WHERE deletion_id=$1 AND encrypted_token IS NOT NULL',
        [f.id],
      )
    ).rowCount,
    0,
  );
  assert.equal((await receipt(f.id)).apple_status, 'queued');
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM morpheus_apple_revocations WHERE id=$1 AND encrypted_token IS NULL',
        [late.id],
      )
    ).rowCount,
    1,
  );
  assert.equal(await complete(f, late.id), false);
  assert.equal(await complete(f, lateSecond.id), false);
  assert.equal(
    (
      await pool.query(
        'SELECT deletion_id FROM morpheus_apple_revocations WHERE id=$1',
        [late.id],
      )
    ).rows[0].deletion_id,
    f.id,
  );
  assert.equal((await receipt(f.id)).apple_status, 'queued');

  // Two token completions serialize their aggregate receipt status.
  const jobs = (
    await pool.query(
      'UPDATE morpheus_apple_revocations SET lease_id=$2, attempts=1 WHERE deletion_id=$1 RETURNING id',
      [f.id, randomUUID()],
    )
  ).rows;
  assert.equal(jobs.length, 2);
  await Promise.all(
    jobs.map(async ({ id }) => {
      const lease = (
        await pool.query(
          'SELECT lease_id FROM morpheus_apple_revocations WHERE id=$1',
          [id],
        )
      ).rows[0].lease_id;
      await pool.query('SELECT morpheus_finish_apple_revocation($1,$2,true)', [
        id,
        lease,
      ]);
    }),
  );
  assert.equal((await receipt(f.id)).apple_status, 'revoked');

  const concurrent = fixture();
  const secondId = randomUUID();
  ids.push(secondId);
  assert.deepEqual(
    (
      await Promise.all([begin(concurrent), begin(concurrent, secondId)])
    ).sort(),
    ['accepted', 'already_requested'],
  );
  assert.equal(
    (
      await pool.query(
        'SELECT deletion_id FROM morpheus_account_deletions WHERE target_hash=$1',
        [concurrent.userHash],
      )
    ).rowCount,
    1,
  );

  const racing = fixture();
  const racedReservation = await reserve(racing);
  await Promise.all([complete(racing, racedReservation.id), begin(racing)]);
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM morpheus_apple_grants WHERE clerk_user_hash=$1',
        [racing.userHash],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM morpheus_apple_revocations WHERE deletion_id=$1',
        [racing.id],
      )
    ).rowCount,
    1,
  );
  const expired = (
    await pool.query(
      "UPDATE morpheus_apple_revocations SET lease_id=$2, expires_at=now()-interval '1 second' WHERE deletion_id=$1 RETURNING id,lease_id",
      [racing.id, randomUUID()],
    )
  ).rows[0];
  await pool.query('SELECT morpheus_finish_apple_revocation($1,$2,false)', [
    expired.id,
    expired.lease_id,
  ]);
  assert.equal((await receipt(racing.id)).apple_status, 'manual_required');
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM morpheus_apple_revocations WHERE id=$1',
        [expired.id],
      )
    ).rowCount,
    0,
  );
  assert.equal((await receipt(racing.id)).status, 'pending');
  await pool.query('SELECT morpheus_apple_erase_account($1,$2,true)', [
    racing.user,
    racing.userHash,
  ]);
  assert.equal((await receipt(racing.id)).status, 'deleted');
  assert.equal((await receipt(racing.id)).apple_status, 'manual_required');

  const lateFailure = fixture();
  const lateFailedGrant = await reserve(lateFailure);
  await begin(lateFailure);
  await pool.query('SELECT morpheus_apple_erase_account($1,$2,true)', [
    lateFailure.user,
    lateFailure.userHash,
  ]);
  assert.equal((await receipt(lateFailure.id)).target_hash, null);
  assert.equal((await receipt(lateFailure.id)).apple_status, 'queued');
  assert.equal(await complete(lateFailure, lateFailedGrant.id), false);
  const exhausted = (
    await pool.query(
      'UPDATE morpheus_apple_revocations SET attempts=30, lease_id=$2 WHERE id=$1 RETURNING lease_id,deletion_id',
      [lateFailedGrant.id, randomUUID()],
    )
  ).rows[0];
  assert.equal(exhausted.deletion_id, lateFailure.id);
  await pool.query('SELECT morpheus_finish_apple_revocation($1,$2,false)', [
    lateFailedGrant.id,
    exhausted.lease_id,
  ]);
  assert.equal((await receipt(lateFailure.id)).apple_status, 'manual_required');

  const abandoned = fixture();
  const unresolved = await reserve(abandoned, 'abandoned-code');
  await pool.query(
    "UPDATE morpheus_apple_grants SET reservation_deadline=now()-interval '1 second' WHERE id=$1",
    [unresolved.id],
  );
  assert.equal(
    (await reserve(abandoned, 'abandoned-code')).status,
    'uncertain',
  );
  // Active uncertainty is retained until account deletion, even after its deadline.
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM morpheus_apple_grants WHERE id=$1 AND encrypted_token IS NULL',
        [unresolved.id],
      )
    ).rowCount,
    1,
  );
  await grant(abandoned);
  await begin(abandoned);
  await pool.query('SELECT morpheus_apple_erase_account($1,$2,true)', [
    abandoned.user,
    abandoned.userHash,
  ]);
  const finished = (
    await pool.query(
      'UPDATE morpheus_apple_revocations SET lease_id=$2 WHERE deletion_id=$1 AND encrypted_token IS NOT NULL RETURNING id,lease_id',
      [abandoned.id, randomUUID()],
    )
  ).rows[0];
  await pool.query('SELECT morpheus_finish_apple_revocation($1,$2,true)', [
    finished.id,
    finished.lease_id,
  ]);
  assert.equal((await receipt(abandoned.id)).apple_status, 'queued');
  await pool.query(
    "WITH expired AS (DELETE FROM morpheus_apple_revocations WHERE expires_at <= now() RETURNING deletion_id) UPDATE morpheus_account_deletions SET apple_status='manual_required', updated_at=now() WHERE deletion_id IN (SELECT deletion_id FROM expired)",
  );
  assert.equal((await receipt(abandoned.id)).apple_status, 'manual_required');
  assert.equal(await complete(abandoned, unresolved.id), false);
  assert.equal(
    (
      await pool.query(
        'SELECT id FROM morpheus_apple_grants WHERE clerk_user_hash=$1',
        [abandoned.userHash],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query(
        'SELECT deletion_id FROM morpheus_apple_revocations WHERE id=$1',
        [unresolved.id],
      )
    ).rows[0].deletion_id,
    null,
  );
  assert.equal((await receipt(abandoned.id)).apple_status, 'manual_required');

  const external = fixture();
  await begin(external);
  await pool.query('SELECT morpheus_apple_erase_account($1,$2,true)', [
    external.user,
    external.userHash,
  ]);
  assert.equal((await receipt(external.id)).status, 'deleted');
  assert.equal((await receipt(external.id)).apple_status, 'manual_required');

  console.log(
    'Apple database verification passed: atomic erasure, capability recovery, minimal completion receipts, concurrent acceptance/grant arrival/revocation completion, bounded token expiry.',
  );
} finally {
  // Delete only this script’s generated fixtures, including normally permanent receipts.
  await pool.query(
    'DELETE FROM morpheus_apple_revocations WHERE deletion_id=ANY($1::uuid[]) OR id=ANY($2::uuid[])',
    [ids, grantIds],
  );
  await pool.query(
    'DELETE FROM morpheus_apple_grants WHERE clerk_user_hash=ANY($1::text[])',
    [users.map(hash)],
  );
  await pool.query(
    'DELETE FROM morpheus_account_deletions WHERE deletion_id=ANY($1::uuid[])',
    [ids],
  );
  await pool.query(
    'DELETE FROM morpheus_players WHERE clerk_user_id=ANY($1::text[]) OR associated_player_id IN (SELECT id FROM morpheus_players WHERE clerk_user_id=ANY($1::text[]))',
    [users],
  );
  await pool.query(
    'DELETE FROM morpheus_deleted_accounts WHERE clerk_user_hash=ANY($1::text[])',
    [users.map(hash)],
  );
  await pool.end();
}
