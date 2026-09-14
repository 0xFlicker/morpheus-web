import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cloudDatabase } from './database';
import { CloudHttpError } from './http';
import { digest } from './saveRepository';
import { deletionReceiptRowSchema } from './appleProtocol';
import {
  encryptAppleSecret,
  encryptAppleToken,
  type AppleRevocableToken,
} from './appleProvider';

export async function findDeletionReceipt(id: string, recoveryToken: string) {
  const sql = cloudDatabase();
  const rows =
    await sql`SELECT deletion_id, status, apple_status FROM morpheus_account_deletions
    WHERE deletion_id = ${id}::uuid AND recovery_token_hash = ${digest(recoveryToken)}`;
  return rows[0] ? deletionReceiptRowSchema.parse(rows[0]) : null;
}

export async function beginAccountDeletion(
  id: string,
  recoveryToken: string,
  userId: string,
) {
  const sql = cloudDatabase();
  const encrypted = encryptAppleSecret(userId, `clerk-deletion:${id}`);
  const rows = await sql`SELECT morpheus_begin_account_deletion(
    ${id}::uuid, ${digest(recoveryToken)}, ${userId}, ${digest(userId)}, ${encrypted}) AS result`;
  const { result } = z
    .object({
      result: z.enum(['accepted', 'existing', 'denied', 'already_requested']),
    })
    .parse(rows[0]);
  if (result === 'denied')
    throw new CloudHttpError(403, 'Invalid account deletion receipt.');
  if (result === 'already_requested')
    throw new CloudHttpError(
      409,
      'Account deletion has already been requested. Use the original deletion receipt to recover.',
    );
}

export async function hasStoredAppleGrant(
  userId: string,
  code: string,
): Promise<boolean> {
  const sql = cloudDatabase();
  const rows =
    await sql`SELECT EXISTS (SELECT 1 FROM morpheus_deleted_accounts WHERE clerk_user_hash = ${digest(userId)}) AS deleted,
    EXISTS (SELECT 1 FROM morpheus_apple_grants WHERE clerk_user_hash = ${digest(userId)} AND code_hash = ${digest(code)} AND encrypted_token IS NOT NULL) AS stored`;
  const row = z
    .object({ deleted: z.boolean(), stored: z.boolean() })
    .parse(rows[0]);
  if (row.deleted)
    throw new CloudHttpError(401, 'This account has been deleted.');
  return row.stored;
}

export async function reserveAppleGrant(
  userId: string,
  code: string,
): Promise<string | null> {
  const sql = cloudDatabase();
  const rows =
    await sql`SELECT morpheus_reserve_apple_grant(${randomUUID()}::uuid, ${digest(userId)}, ${digest(code)}) AS result`;
  const { result } = z
    .object({
      result: z.discriminatedUnion('status', [
        z.object({ status: z.literal('reserved'), id: z.uuid() }),
        z.object({
          status: z.enum([
            'stored',
            'pending',
            'uncertain',
            'deleted',
            'denied',
          ]),
        }),
      ]),
    })
    .parse(rows[0]);
  if (result.status === 'stored') return null;
  if (result.status === 'reserved') return result.id;
  if (result.status === 'uncertain')
    throw new CloudHttpError(
      422,
      'Apple authorization could not be confirmed. Sign in with Apple again.',
    );
  if (result.status === 'deleted')
    throw new CloudHttpError(401, 'This account has been deleted.');
  if (result.status === 'denied')
    throw new CloudHttpError(
      403,
      'Apple authorization does not belong to this account.',
    );
  throw new CloudHttpError(
    503,
    'Apple authorization is still being confirmed. Try again shortly.',
    {
      code: 'apple-authorization-pending',
      retryAfterSeconds: 60,
    },
  );
}

export async function completeAppleGrant(
  userId: string,
  id: string,
  token: AppleRevocableToken,
) {
  const sql = cloudDatabase();
  const encrypted = encryptAppleToken(token, id);
  const rows =
    await sql`SELECT morpheus_complete_apple_grant(${id}::uuid, ${digest(userId)}, ${encrypted}) AS stored`;
  if (!z.object({ stored: z.boolean() }).parse(rows[0]).stored)
    throw new CloudHttpError(
      409,
      'This account was deleted while Apple authorization was completing.',
    );
}

const deletionJobSchema = z.object({
  deletion_id: z.uuid(),
  encrypted_target: z.string(),
  hosted_checked: z.boolean(),
  lease_id: z.uuid(),
});
export async function claimAccountDeletion(id: string) {
  const sql = cloudDatabase();
  const rows =
    await sql`UPDATE morpheus_account_deletions SET lease_id = ${randomUUID()}::uuid,
    lease_until = now() + interval '5 minutes', attempts = attempts + 1, updated_at = now()
    WHERE deletion_id = ${id}::uuid AND status = 'pending' AND next_attempt_at <= now()
      AND (lease_until IS NULL OR lease_until < now())
    RETURNING deletion_id, encrypted_target, hosted_checked, lease_id`;
  return rows[0] ? deletionJobSchema.parse(rows[0]) : null;
}

export async function retryAccountDeletion(id: string, lease: string) {
  const sql = cloudDatabase();
  await sql`UPDATE morpheus_account_deletions SET lease_id = NULL, lease_until = NULL,
    next_attempt_at = now() + interval '1 minute', updated_at = now()
    WHERE deletion_id = ${id}::uuid AND lease_id = ${lease}::uuid AND status = 'pending'`;
}

export async function eraseAppleAccount(userId: string, confirmed: boolean) {
  const sql = cloudDatabase();
  await sql`SELECT morpheus_apple_erase_account(${userId}, ${digest(userId)}, ${confirmed})`;
}

/** Existing grants are queued atomically on acceptance, before a remote user is removed. */
export async function queuedAppleGrants(id: string): Promise<number> {
  const sql = cloudDatabase();
  const rows =
    await sql`SELECT count(*)::integer AS count FROM morpheus_apple_revocations WHERE deletion_id = ${id}::uuid`;
  return z.object({ count: z.number().int().nonnegative() }).parse(rows[0])
    .count;
}

export async function finishHostedAppleCapture(
  id: string,
  tokens: AppleRevocableToken[],
  manualRequired: boolean,
) {
  const sql = cloudDatabase();
  const inserts = tokens.map((token) => {
    const tokenId = randomUUID();
    return sql`INSERT INTO morpheus_apple_revocations(id, deletion_id, encrypted_token)
      VALUES (${tokenId}::uuid, ${id}::uuid, ${encryptAppleToken(token, tokenId)})`;
  });
  await sql.transaction([
    sql`SELECT deletion_id FROM morpheus_account_deletions WHERE deletion_id = ${id}::uuid FOR UPDATE`,
    ...inserts,
    sql`UPDATE morpheus_account_deletions SET hosted_checked = CASE WHEN status = 'pending' THEN true ELSE NULL END,
      apple_status = CASE WHEN ${manualRequired} OR apple_status = 'manual_required' THEN 'manual_required'
        WHEN EXISTS (SELECT 1 FROM morpheus_apple_revocations WHERE deletion_id = ${id}::uuid) THEN 'queued'
        ELSE apple_status END, updated_at = now() WHERE deletion_id = ${id}::uuid`,
  ]);
}

const revocationJobSchema = z.object({
  id: z.uuid(),
  encrypted_token: z.string().nullable(),
  lease_id: z.uuid(),
  expired: z.boolean(),
});
export async function claimAppleRevocations(deletionId?: string) {
  const sql = cloudDatabase();
  const rows =
    await sql`UPDATE morpheus_apple_revocations SET lease_id = ${randomUUID()}::uuid,
    lease_until = now() + interval '5 minutes', attempts = attempts + 1
    WHERE id IN (SELECT id FROM morpheus_apple_revocations
      WHERE (next_attempt_at <= now() OR expires_at <= now()) AND (lease_until IS NULL OR lease_until < now())
        AND (encrypted_token IS NOT NULL OR expires_at <= now())
        AND (${deletionId ?? null}::uuid IS NULL OR deletion_id = ${deletionId ?? null}::uuid)
      ORDER BY next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED)
    RETURNING id, encrypted_token, lease_id, (expires_at <= now() OR attempts > 30) AS expired`;
  return z.array(revocationJobSchema).parse(rows);
}

export async function finishAppleRevocation(
  id: string,
  lease: string,
  success: boolean,
) {
  const sql = cloudDatabase();
  await sql`SELECT morpheus_finish_apple_revocation(${id}::uuid, ${lease}::uuid, ${success})`;
}

export async function pendingAccountDeletionIds(): Promise<string[]> {
  const sql = cloudDatabase();
  // Keep pending targets fenced even when Clerk is unavailable for over 30 days.
  await sql`INSERT INTO morpheus_deleted_accounts(clerk_user_hash)
    SELECT target_hash FROM morpheus_account_deletions WHERE status = 'pending'
    ON CONFLICT (clerk_user_hash) DO UPDATE SET deleted_at = now()`;
  const rows =
    await sql`SELECT deletion_id FROM morpheus_account_deletions WHERE status = 'pending'
    AND next_attempt_at <= now() AND (lease_until IS NULL OR lease_until < now()) ORDER BY next_attempt_at LIMIT 10`;
  return z
    .array(z.object({ deletion_id: z.uuid() }))
    .parse(rows)
    .map((row) => row.deletion_id);
}

export async function expireAppleRevocations() {
  const sql = cloudDatabase();
  await sql`WITH expired AS (
    DELETE FROM morpheus_apple_revocations WHERE expires_at <= now() RETURNING deletion_id
  ) UPDATE morpheus_account_deletions SET apple_status = 'manual_required', updated_at = now()
    WHERE deletion_id IN (SELECT deletion_id FROM expired)`;
}
