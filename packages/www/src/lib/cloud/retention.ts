import 'server-only';

import { del, list } from '@vercel/blob';
import { z } from 'zod';
import { cloudDatabase } from './database';
import { digest } from './saveRepository';

function reportStorageToken() {
  const token = process.env.MORPHEUS_REPORTS_READ_WRITE_TOKEN;
  if (!token) throw new Error('Private report storage is not configured');
  return token;
}

/** Cascades revoke access atomically. Daily orphan cleanup removes private attachments. */
export async function eraseCloudPlayer(playerId: string) {
  const sql = cloudDatabase();
  await sql`DELETE FROM morpheus_players WHERE id = ${playerId} OR associated_player_id = ${playerId}`;
}

export async function eraseClerkAccount(userId: string) {
  const sql = cloudDatabase();
  const userHash = digest(userId);
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${userHash}, 0))`,
    sql`INSERT INTO morpheus_deleted_accounts(clerk_user_hash) VALUES (${userHash})
      ON CONFLICT (clerk_user_hash) DO NOTHING`,
    sql`DELETE FROM morpheus_players WHERE clerk_user_id = ${userId}
      OR associated_player_id IN (SELECT id FROM morpheus_players WHERE clerk_user_id = ${userId})`,
  ]);
}

export async function maintainCloudData() {
  const token = reportStorageToken();
  const sql = cloudDatabase();
  const results = await sql.transaction([
    sql`DELETE FROM morpheus_bug_reports WHERE created_at < now() - interval '90 days' RETURNING attachment_path`,
    sql`DELETE FROM morpheus_players WHERE clerk_user_id IS NULL AND last_seen_at < now() - interval '90 days' RETURNING id`,
    sql`DELETE FROM morpheus_sessions WHERE last_seen_at < now() - interval '30 days' RETURNING session_id`,
    sql`DELETE FROM morpheus_save_mutations WHERE created_at < now() - interval '30 days'`,
    sql`DELETE FROM morpheus_rate_limits WHERE expires_at < now()`,
    sql`DELETE FROM morpheus_deleted_accounts WHERE deleted_at < now() - interval '30 days'`,
  ]);
  const reportRows = z
    .array(z.object({ attachment_path: z.string().nullable() }))
    .parse(results[0]);
  const paths = reportRows.flatMap((row) =>
    row.attachment_path ? [row.attachment_path] : [],
  );
  for (let offset = 0; offset < paths.length; offset += 1000)
    await del(paths.slice(offset, offset + 1000), { token });

  let orphanCount = 0;
  let cursor: string | undefined;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  do {
    const page = await list({ token, prefix: 'reports/', limit: 1000, cursor });
    const candidates = page.blobs
      .filter((blob) => blob.uploadedAt.getTime() < cutoff)
      .map((blob) => blob.pathname);
    if (candidates.length) {
      const rows =
        await sql`SELECT attachment_path FROM morpheus_bug_reports WHERE attachment_path IN (
        SELECT jsonb_array_elements_text(${JSON.stringify(candidates)}::jsonb)
      )`;
      const linked = new Set(
        z
          .array(z.object({ attachment_path: z.string() }))
          .parse(rows)
          .map((row) => row.attachment_path),
      );
      const orphans = candidates.filter((path) => !linked.has(path));
      if (orphans.length) await del(orphans, { token });
      orphanCount += orphans.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return {
    expiredReports: reportRows.length,
    expiredPlayers: results[1].length,
    expiredSessions: results[2].length,
    orphanAttachments: orphanCount,
  };
}
