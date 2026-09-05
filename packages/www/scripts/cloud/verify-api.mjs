import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { get, del } from '@vercel/blob';
import { crc32, deflateSync } from 'node:zlib';

const origin = process.env.MORPHEUS_TEST_ORIGIN ?? 'http://localhost:3105';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
  throw new Error(
    'Use a local API connected to the isolated development database',
  );
if (!process.env.DATABASE_URL || process.env.VERCEL_ENV === 'production')
  throw new Error('Use the development database');
const sql = neon(process.env.DATABASE_URL);
const players = [];
const attachmentPaths = [];
function screenshot() {
  const chunk = (kind, bytes) => {
    const result = Buffer.alloc(bytes.length + 12);
    result.writeUInt32BE(bytes.length);
    result.write(kind, 4);
    bytes.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('tEXt', Buffer.from('Comment\0private metadata')),
    chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}
const createPlayer = async () => {
  const response = await fetch(`${origin}/api/cloud/player`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-morpheus-identity': 'anonymous',
    },
    body: JSON.stringify({
      platform: 'ios',
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      appVersion: 'cloud-api-verification',
    }),
  });
  const player = await response.json();
  assert.equal(response.status, 200, JSON.stringify(player));
  assert.equal(player.authenticated, false);
  assert.equal(typeof player.anonymousToken, 'string');
  players.push(player.playerId);
  return { id: player.playerId, token: player.anonymousToken };
};
const call = async (player, path, method = 'GET', body, extraHeaders = {}) => {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-morpheus-player-id': player.id,
      'x-morpheus-anonymous-token': player.token,
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};

try {
  const first = await createPlayer();
  const second = await createPlayer();
  const map = JSON.parse(
    await readFile(
      new URL(
        '../../../morpheus/client/js/service/morpheus.map.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const save = {
    runId: randomUUID(),
    source: 'played',
    discoveredSceneIds: [2000],
    envelope: {
      format: 'morpheus-living-save-session',
      schemaVersion: 1,
      gameDataVersion: 1,
      resumePointId: randomUUID(),
      savedAt: Date.now(),
      activeSceneId: 2000,
      returnSceneId: null,
      rotation: { yaw3600: 1500, pitch: 0 },
      gamestateValues: Object.fromEntries(
        map
          .filter((entry) => entry.type === 'GameState')
          .map((entry) => [entry.data.stateId, entry.data.value]),
      ),
    },
  };
  const write = {
    protocolVersion: 1,
    slotId: 'slot-1',
    expectedRevision: 0,
    mutationId: randomUUID(),
    deviceId: randomUUID(),
    save,
  };
  assert.equal((await call(first, '/api/cloud/saves')).body.slots.length, 3);
  const accepted = await call(first, '/api/cloud/saves', 'PUT', write);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.slot.revision, 1);
  assert.deepEqual(
    (await call(first, '/api/cloud/saves', 'PUT', write)).body,
    accepted.body,
  );
  const independent = await call(second, '/api/cloud/saves');
  assert.ok(independent.body.slots.every((slot) => slot.save === null));
  const forged = await call(second, '/api/cloud/saves', 'GET', undefined, {
    'x-morpheus-player-id': first.id,
  });
  assert.equal(forged.status, 409);
  const invalidToken = await call(
    { ...first, token: 'z'.repeat(43) },
    '/api/cloud/saves',
  );
  assert.equal(invalidToken.status, 401);
  const csrf = await call(first, '/api/cloud/saves', 'PUT', write, {
    origin: 'https://attacker.example',
  });
  assert.equal(csrf.status, 403);
  const illegal = {
    ...write,
    mutationId: randomUUID(),
    expectedRevision: 1,
    save: {
      ...save,
      envelope: { ...save.envelope, gamestateValues: { 123: 1 } },
    },
  };
  assert.equal(
    (await call(first, '/api/cloud/saves', 'PUT', illegal)).status,
    400,
  );
  const reportRequest = {
    protocolVersion: 1,
    requestId: randomUUID(),
    platform: 'ios',
    appVersion: 'cloud-api-verification',
    description: 'Synthetic integration report; remove after verification.',
    sceneId: 2000,
    screenshotPNGBase64: screenshot(),
  };
  const report = await call(first, '/api/cloud/reports', 'POST', reportRequest);
  assert.equal(report.status, 201, JSON.stringify(report.body));
  assert.equal(
    (await call(first, '/api/cloud/reports', 'POST', reportRequest)).body
      .reportId,
    report.body.reportId,
  );
  const [{ attachment_path: attachmentPath }] =
    await sql`SELECT attachment_path FROM morpheus_bug_reports WHERE id = ${report.body.reportId}`;
  attachmentPaths.push(attachmentPath);
  const attachment = await get(attachmentPath, {
    access: 'private',
    token: process.env.MORPHEUS_REPORTS_READ_WRITE_TOKEN,
  });
  assert.ok(attachment?.statusCode === 200);
  const content = JSON.parse(await new Response(attachment.stream).text());
  assert.ok(content.screenshotPNGBase64);
  assert.ok(
    !Buffer.from(content.screenshotPNGBase64, 'base64').includes(
      Buffer.from('private metadata'),
    ),
  );
  for (const path of [
    '/api/cloud/admin/reports',
    '/api/cloud/admin/sessions',
    '/api/cloud/admin/saves',
    `/api/cloud/admin/reports/${report.body.reportId}/attachment`,
  ]) {
    assert.equal((await call(first, path)).status, 401);
  }
  const removed = await call(first, '/api/cloud/saves', 'PUT', {
    ...write,
    expectedRevision: 1,
    mutationId: randomUUID(),
    save: null,
  });
  assert.equal(removed.body.slot.revision, 2);
  const stale = await call(first, '/api/cloud/saves', 'PUT', {
    ...write,
    expectedRevision: 1,
    mutationId: randomUUID(),
  });
  assert.equal(stale.status, 409);
  const completed = { ...save, discoveredSceneIds: [1050, 895065] };
  const completion = await call(first, '/api/cloud/saves', 'PUT', {
    ...write,
    expectedRevision: 2,
    mutationId: randomUUID(),
    save: completed,
  });
  assert.equal(completion.status, 200);
  const summary = () => call(first, '/api/cloud/discovery?slotId=slot-1');
  assert.equal(
    (await summary()).body.comparison.reason,
    'small-cohort',
    'Use an isolated database without completed player fixtures',
  );
  const seed = async (
    source,
    visits,
    associatedPlayerId = null,
    expired = false,
  ) => {
    const id = randomUUID();
    players.push(id);
    await sql`INSERT INTO morpheus_players(id, anonymous_secret_hash, associated_player_id, expires_at)
      VALUES (${id}, ${randomUUID()}, ${associatedPlayerId}, now() + ${expired ? -1 : 1} * interval '1 day')`;
    const payload = {
      ...completed,
      source,
      runId: randomUUID(),
      discoveredSceneIds: visits,
    };
    await sql`INSERT INTO morpheus_saves(player_id, slot_id, revision, payload, progress_hash, device_id)
      VALUES (${id}, 'slot-1', 1, ${JSON.stringify(payload)}::jsonb, ${randomUUID()}, ${randomUUID()})`;
    return id;
  };
  const cohort = [];
  for (let index = 0; index < 19; index++)
    cohort.push(await seed('played', [1050, 895065]));
  await seed('imported', [1050, 895065]);
  await seed('played', [1050]);
  await seed('played', [1050, 895065], null, true);
  await seed('played', [1050, 895065], first.id);
  await seed('played', [1050, 895065], cohort[0]);
  assert.equal(
    (await summary()).body.comparison.reason,
    'small-cohort',
    'Excluded and linked players must not inflate the cohort',
  );
  await seed('played', [1050, 895065]);
  const comparison = (await summary()).body.comparison;
  assert.equal(comparison.status, 'available');
  assert.equal(comparison.otherPlayerCount, 20);
  assert.equal(comparison.averagePercent, 0.8);
  assert.equal(comparison.verified, false);
  assert.ok(!JSON.stringify(comparison).includes(cohort[0]));
  assert.equal((await call(first, '/api/cloud/erase', 'DELETE')).status, 200);
  assert.equal((await call(first, '/api/cloud/saves')).status, 401);
  const erased =
    await sql`SELECT id FROM morpheus_bug_reports WHERE player_id = ${first.id}`;
  assert.equal(erased.length, 0);
  console.log(
    'Passed real local API + Neon + private Blob: save ownership/concurrency/retry, report upload and metadata stripping, admin denial, aggregate cohort filtering and online-data erasure.',
  );
} finally {
  for (const id of players)
    await sql`DELETE FROM morpheus_players WHERE id = ${id}`;
  if (attachmentPaths.length)
    await del(attachmentPaths, {
      token: process.env.MORPHEUS_REPORTS_READ_WRITE_TOKEN,
    });
}
