import 'server-only';

import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { auth, currentUser } from '@clerk/nextjs/server';
import { z } from 'zod';

import { getAdminAccess, getAdminSessionAccess } from '@/app/admin/adminAccess';
import { cloudDatabase } from './database';
import { CloudHttpError } from './http';
import { CLOUD_ANONYMOUS_COOKIE, CLOUD_ANONYMOUS_HEADER } from './protocol';
import { digest } from './saveRepository';

const playerRowSchema = z.object({
  id: z.uuid(),
  clerk_user_id: z.string().nullable(),
});
export type CloudPlayer = { id: string; authenticated: boolean };

export function anonymousCredential(request: Request): string | null {
  const header = request.headers.get(CLOUD_ANONYMOUS_HEADER);
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CLOUD_ANONYMOUS_COOKIE}=`))
    ?.slice(CLOUD_ANONYMOUS_COOKIE.length + 1);
  const value = header ?? cookie;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

async function findAnonymousPlayer(
  request: Request,
): Promise<CloudPlayer | null> {
  const token = anonymousCredential(request);
  if (!token) return null;
  const sql = cloudDatabase();
  const rows = await sql`SELECT id, clerk_user_id FROM morpheus_players
    WHERE anonymous_secret_hash = ${digest(token)} AND expires_at > now()`;
  if (!rows[0]) return null;
  const row = playerRowSchema.parse(rows[0]);
  return { id: row.id, authenticated: false };
}

async function authenticatedPlayer(userId: string): Promise<CloudPlayer> {
  const sql = cloudDatabase();
  const userHash = digest(userId);
  // Creation and deletion take the same transaction lock, including an absent player.
  const results = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${userHash}, 0))`,
    sql`INSERT INTO morpheus_players(id, clerk_user_id)
      SELECT ${randomUUID()}::uuid, ${userId} WHERE NOT EXISTS (
        SELECT 1 FROM morpheus_deleted_accounts WHERE clerk_user_hash = ${userHash}
      ) ON CONFLICT (clerk_user_id) DO UPDATE SET last_seen_at = now()
      RETURNING id, clerk_user_id`,
  ]);
  if (!results[1][0])
    throw new CloudHttpError(401, 'This account has been deleted.');
  return { id: playerRowSchema.parse(results[1][0]).id, authenticated: true };
}

export async function requireCloudPlayer(
  request: Request,
): Promise<CloudPlayer> {
  const expected = z
    .uuid()
    .safeParse(request.headers.get('x-morpheus-player-id'));
  if (!expected.success)
    throw new CloudHttpError(
      400,
      'Reconnect this device before using cloud storage.',
    );
  const { userId } = await auth();
  const player = userId
    ? await authenticatedPlayer(userId)
    : await findAnonymousPlayer(request);
  // An invalid Clerk bearer must never silently become an anonymous request.
  if (!userId && request.headers.has('authorization'))
    throw new CloudHttpError(401, 'Sign in again to connect this device.');
  if (!player)
    throw new CloudHttpError(401, 'This device needs a new anonymous session.');
  // This is a consistency assertion, never proof of ownership. Clerk/the opaque
  // anonymous credential remains the authority. It fences cookie account races.
  if (player.id !== expected.data.toLowerCase())
    throw new CloudHttpError(
      409,
      'The account on this device changed. Reconnect before syncing.',
    );
  return player;
}

export async function initializeCloudPlayer(
  request: Request,
  expectedIdentity?: string,
): Promise<{
  player: CloudPlayer;
  anonymousToken?: string;
  associatedAnonymousPlayerId?: string;
}> {
  const { userId } = await auth();
  if (
    expectedIdentity !== undefined &&
    expectedIdentity !== (userId ?? 'anonymous')
  ) {
    throw new CloudHttpError(
      409,
      'The account on this device changed. Reconnect before syncing.',
    );
  }
  if (userId) {
    const player = await authenticatedPlayer(userId);
    // Only a game client that asserted its identity may link existing guest progress.
    // Report-only preflight has no local journey identity to associate.
    const anonymous =
      expectedIdentity === undefined
        ? null
        : await findAnonymousPlayer(request);
    if (anonymous) {
      const sql = cloudDatabase();
      // Associate diagnostics once. The old credential NEVER gains access to
      // authenticated saves; the client reconciles local saves separately.
      const linked =
        await sql`UPDATE morpheus_players SET associated_player_id = ${player.id}
        WHERE id = ${anonymous.id} AND (associated_player_id IS NULL OR associated_player_id = ${player.id})
        RETURNING id`;
      if (linked.length > 0)
        return { player, associatedAnonymousPlayerId: anonymous.id };
    }
    return { player };
  }
  if (request.headers.has('authorization'))
    throw new CloudHttpError(401, 'Sign in again to connect this device.');
  const existing = await findAnonymousPlayer(request);
  if (existing) {
    const sql = cloudDatabase();
    await sql`UPDATE morpheus_players SET last_seen_at = now(), expires_at = now() + interval '90 days'
      WHERE id = ${existing.id}`;
    return { player: existing };
  }
  await rateLimitAnonymousIssuance(request);
  const anonymousToken = randomBytes(32).toString('base64url');
  const id = randomUUID();
  const sql = cloudDatabase();
  await sql`INSERT INTO morpheus_players(id, anonymous_secret_hash, expires_at)
    VALUES (${id}, ${digest(anonymousToken)}, now() + interval '90 days')`;
  return { player: { id, authenticated: false }, anonymousToken };
}

export async function rateLimit(
  bucket: string,
  maximum: number,
  windowSeconds: number,
) {
  const sql = cloudDatabase();
  const rows =
    await sql`INSERT INTO morpheus_rate_limits(bucket, hits, expires_at)
    VALUES (${bucket}, 1, now() + ${windowSeconds} * interval '1 second')
    ON CONFLICT (bucket) DO UPDATE SET
      hits = CASE WHEN morpheus_rate_limits.expires_at <= now() THEN 1 ELSE morpheus_rate_limits.hits + 1 END,
      expires_at = CASE WHEN morpheus_rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE morpheus_rate_limits.expires_at END
    RETURNING hits`;
  const { hits } = z.object({ hits: z.number() }).parse(rows[0]);
  if (hits > maximum)
    throw new CloudHttpError(
      429,
      'Please try again shortly. Your progress is saved on this device.',
    );
}

async function rateLimitAnonymousIssuance(request: Request) {
  const secret = process.env.MORPHEUS_RATE_LIMIT_SECRET;
  if (!secret) throw new Error('Morpheus request protection is not configured');
  // Vercel overwrites this header. Do not trust arbitrary forwarding headers.
  const address =
    process.env.VERCEL === '1'
      ? (request.headers.get('x-vercel-forwarded-for') ?? 'unknown')
      : 'local-development';
  const day = new Date().toISOString().slice(0, 10);
  const key = createHmac('sha256', secret)
    .update(`${day}:${address}`)
    .digest('hex');
  await rateLimit(`issuance:${key}`, 20, 3600);
}

export async function requireCloudAdmin(): Promise<void> {
  const { userId } = await auth();
  const session = getAdminSessionAccess({
    userId,
    configuredAdminUserId: process.env.CLERK_ADMIN_USER_ID,
    requireConfiguredAdminUserId: process.env.NODE_ENV === 'production',
  });
  if (session === 'signed-out')
    throw new CloudHttpError(401, 'Sign in to continue.');
  if (
    session === 'rejected' ||
    getAdminAccess(await currentUser()) !== 'authorized'
  ) {
    throw new CloudHttpError(
      403,
      'This account cannot access Morpheus administration.',
    );
  }
}
