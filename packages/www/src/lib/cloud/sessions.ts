import 'server-only';

import { z } from 'zod';
import { cloudDatabase } from './database';

export const cloudSessionSchema = z
  .object({
    deviceId: z.uuid(),
    sessionId: z.uuid(),
    platform: z.enum(['web', 'ios', 'macos']),
    appVersion: z.string().min(1).max(80),
    activeRunId: z.uuid().nullable().optional(),
    activeSceneId: z
      .number()
      .int()
      .positive()
      .max(2147483647)
      .nullable()
      .optional(),
  })
  .strict();

export async function recordCloudSession(
  playerId: string,
  session: z.infer<typeof cloudSessionSchema>,
) {
  const sql = cloudDatabase();
  await sql`INSERT INTO morpheus_sessions(player_id, session_id, device_id, platform, app_version, active_run_id, active_scene_id)
    VALUES (${playerId}, ${session.sessionId}, ${session.deviceId}, ${session.platform}, ${session.appVersion},
      ${session.activeRunId ?? null}, ${session.activeSceneId ?? null})
    ON CONFLICT (player_id, session_id) DO UPDATE SET
      last_seen_at = now(), active_run_id = EXCLUDED.active_run_id,
      active_scene_id = EXCLUDED.active_scene_id, app_version = EXCLUDED.app_version`;
  await sql`UPDATE morpheus_players SET last_seen_at = now(),
    expires_at = CASE WHEN anonymous_secret_hash IS NOT NULL THEN now() + interval '90 days' ELSE NULL END
    WHERE id = ${playerId}`;
}
