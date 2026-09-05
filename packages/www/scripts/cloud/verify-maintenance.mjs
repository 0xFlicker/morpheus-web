import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { put, get, del } from '@vercel/blob';

const origin = process.env.MORPHEUS_TEST_ORIGIN ?? 'http://localhost:3105';
if (
  !['localhost', '127.0.0.1'].includes(new URL(origin).hostname) ||
  process.env.VERCEL_ENV === 'production'
)
  throw new Error('Use the isolated development database and a local API');
for (const key of [
  'DATABASE_URL',
  'CRON_SECRET',
  'CLERK_WEBHOOK_SIGNING_SECRET',
  'MORPHEUS_REPORTS_READ_WRITE_TOKEN',
])
  if (!process.env[key]) throw new Error(`${key} is required`);
const sql = neon(process.env.DATABASE_URL);
const token = process.env.MORPHEUS_REPORTS_READ_WRITE_TOKEN;
const playerId = randomUUID();
const guestId = randomUUID();
const expiredId = randomUUID();
const userId = `user_${randomUUID().replaceAll('-', '')}`;
const userHash = createHash('sha256').update(userId).digest('hex');
const paths = [];
try {
  await sql`INSERT INTO morpheus_players(id, clerk_user_id) VALUES (${playerId}, ${userId})`;
  await sql`INSERT INTO morpheus_players(id, anonymous_secret_hash, associated_player_id, expires_at)
    VALUES (${guestId}, ${randomUUID()}, ${playerId}, now() + interval '90 days')`;
  const body = JSON.stringify({
    type: 'user.deleted',
    object: 'event',
    data: { id: userId, deleted: true, object: 'user' },
  });
  const messageId = `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signingKey = Buffer.from(
    process.env.CLERK_WEBHOOK_SIGNING_SECRET.slice('whsec_'.length),
    'base64',
  );
  const signature = createHmac('sha256', signingKey)
    .update(`${messageId}.${timestamp}.${body}`)
    .digest('base64');
  const sendEvent = (signatureValue) =>
    fetch(`${origin}/api/webhooks/clerk`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'svix-id': messageId,
        'svix-timestamp': timestamp,
        'svix-signature': signatureValue,
      },
    });
  assert.equal((await sendEvent('v1,invalid')).status, 400);
  assert.equal((await sendEvent(`v1,${signature}`)).status, 200);
  assert.equal(
    (await sendEvent(`v1,${signature}`)).status,
    200,
    'Deletion delivery is retryable',
  );
  assert.equal(
    (
      await sql`SELECT id FROM morpheus_players WHERE id IN (${playerId}, ${guestId})`
    ).length,
    0,
  );
  assert.equal(
    (
      await sql`SELECT clerk_user_hash FROM morpheus_deleted_accounts WHERE clerk_user_hash = ${userHash}`
    ).length,
    1,
  );

  await sql`INSERT INTO morpheus_players(id, anonymous_secret_hash, last_seen_at, expires_at)
    VALUES (${expiredId}, ${randomUUID()}, now() - interval '91 days', now() - interval '1 day')`;
  const path = `reports/${expiredId}/${randomUUID()}/maintenance-test.json`;
  paths.push(path);
  await put(path, JSON.stringify({ synthetic: true }), {
    access: 'private',
    addRandomSuffix: false,
    token,
  });
  await sql`INSERT INTO morpheus_bug_reports(id, player_id, request_id, request_hash, platform, description, app_version, attachment_path, created_at)
    VALUES (${randomUUID()}, ${expiredId}, ${randomUUID()}, 'maintenance-verification', 'web', 'Synthetic retention verification', 'test', ${path}, now() - interval '91 days')`;
  assert.equal((await fetch(`${origin}/api/maintenance/morpheus`)).status, 401);
  const response = await fetch(`${origin}/api/maintenance/morpheus`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  assert.equal(response.status, 200);
  const counts = await response.json();
  assert.ok(counts.expiredReports >= 1 && counts.expiredPlayers >= 1);
  assert.equal(
    (await sql`SELECT id FROM morpheus_players WHERE id = ${expiredId}`).length,
    0,
  );
  assert.equal(await get(path, { access: 'private', token }), null);
  console.log(
    'Passed real local Next + Clerk signature verifier + Neon + private Blob: forged-signature denial, account/linked-guest deletion, retry fence, scheduler authorization, expired-data cleanup and physical attachment deletion.',
  );
} finally {
  await sql`DELETE FROM morpheus_players WHERE id IN (${playerId}, ${guestId}, ${expiredId})`;
  await sql`DELETE FROM morpheus_deleted_accounts WHERE clerk_user_hash = ${userHash}`;
  if (paths.length) await del(paths, { token });
}
