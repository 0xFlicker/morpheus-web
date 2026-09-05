import 'server-only';

import { z } from 'zod';
import {
  calculateDiscovery,
  evaluateAchievements,
  findDiscoveryLocation,
  listDiscoveryLocations,
  MINIMUM_DISCOVERY_COMPARISON_PLAYERS,
} from '@/lib/discovery';
import { cloudDatabase } from './database';
import type { CloudSave } from './protocol';

const cohortSchema = z.object({
  players: z.coerce.number().int().nonnegative(),
  average: z.coerce.number().nonnegative().nullable(),
});

export async function discoverySummary(
  playerId: string,
  save: CloudSave | null,
) {
  const visits = save?.discoveredSceneIds ?? [];
  const discovery = calculateDiscovery(visits);
  const achievements = evaluateAchievements(visits, save?.source ?? 'played');
  if (!discovery.completed || !save || save.source === 'imported') {
    return {
      discovery,
      achievements,
      comparison: {
        status: 'unavailable',
        reason: save?.source === 'imported' ? 'imported' : 'not-completed',
      },
    };
  }
  const mapping = Object.fromEntries(
    listDiscoveryLocations().flatMap((location) =>
      location.sceneIds.map((sceneId) => [String(sceneId), location.id]),
    ),
  );
  const endingLocation = findDiscoveryLocation(895065);
  if (!endingLocation)
    throw new Error(
      'The authored ending is missing from the discovery catalog',
    );
  const sql = cloudDatabase();
  // Aggregate in Postgres: no other player's identity, envelope or visit list
  // leaves the database. Linked guests count as the same player as their account.
  const rows = await sql`WITH locations AS (
    SELECT key AS scene_id, value AS location_id FROM jsonb_each_text(${JSON.stringify(mapping)}::jsonb)
  ), current_identity AS (
    SELECT coalesce(associated_player_id, id) AS id FROM morpheus_players WHERE id = ${playerId}
  ), progress AS (
    SELECT coalesce(p.associated_player_id, p.id) AS player_id, s.slot_id,
      count(DISTINCT l.location_id) AS discovered,
      bool_or(l.location_id = ${endingLocation.id}) AS completed
    FROM morpheus_saves s JOIN morpheus_players p ON p.id = s.player_id
    CROSS JOIN LATERAL jsonb_array_elements_text(s.payload->'discoveredSceneIds') AS v(scene_id)
    JOIN locations l ON l.scene_id = v.scene_id
    WHERE s.payload->>'source' = 'played'
      AND (p.expires_at IS NULL OR p.expires_at > now())
      AND coalesce(p.associated_player_id, p.id) <> (SELECT id FROM current_identity)
    GROUP BY coalesce(p.associated_player_id, p.id), s.player_id, s.slot_id
  ), best AS (
    SELECT player_id, max(discovered) AS discovered FROM progress WHERE completed GROUP BY player_id
  ) SELECT count(*) AS players, avg(discovered) AS average FROM best`;
  const cohort = cohortSchema.parse(rows[0]);
  if (
    cohort.players < MINIMUM_DISCOVERY_COMPARISON_PLAYERS ||
    cohort.average === null
  ) {
    return {
      discovery,
      achievements,
      comparison: { status: 'unavailable', reason: 'small-cohort' },
    };
  }
  return {
    discovery,
    achievements,
    comparison: {
      status: 'available',
      cohortLabel: 'Other players’ best currently saved completed playthroughs',
      otherPlayerCount: cohort.players,
      playerPercent: discovery.overall.percent,
      averagePercent:
        Math.floor((cohort.average * 1000) / discovery.overall.total) / 10,
      verified: false,
    },
  };
}
