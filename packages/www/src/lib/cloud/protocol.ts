import { z } from 'zod';
import { fetchInitial } from '@soapbubble/morpheus-client/service/gameState';

import { parseLivingSaveSessionEnvelope } from '@/morpheus-app/storage/livingSaveSchema';
import { MORPHEUS_INITIAL_SCENE_ID } from '@/morpheus-app/storage/livingSaveIdentity';
import {
  LIVING_SAVE_GAME_DATA_VERSION,
  LIVING_SAVE_SLOT_IDS,
} from '@/morpheus-app/storage/livingSaveTypes';

export const CLOUD_PROTOCOL_VERSION = 1;
export const CLOUD_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
export const CLOUD_ANONYMOUS_COOKIE = 'morpheus-player';
export const CLOUD_ANONYMOUS_HEADER = 'x-morpheus-anonymous-token';

const envelopeSchema = z.unknown().transform((value, context) => {
  const parsed = parseLivingSaveSessionEnvelope(value);
  if (!parsed.success) {
    context.addIssue({ code: 'custom', message: parsed.issues[0] });
    return z.NEVER;
  }
  return parsed.data;
});

const uuidSchema = z.uuid().transform((id) => id.toLowerCase());

export const cloudSaveSchema = z
  .object({
    runId: uuidSchema,
    envelope: envelopeSchema,
    discoveredSceneIds: z
      .array(z.number().int().positive().safe())
      .max(4096)
      .transform((ids) => [...new Set(ids)].sort((a, b) => a - b)),
    source: z.enum(['played', 'imported']),
  })
  .strict();

export type CloudSave = z.infer<typeof cloudSaveSchema>;

export const cloudWriteSchema = z
  .object({
    protocolVersion: z.literal(CLOUD_PROTOCOL_VERSION),
    slotId: z.enum(LIVING_SAVE_SLOT_IDS),
    expectedRevision: z.number().int().nonnegative().safe(),
    mutationId: uuidSchema,
    deviceId: uuidSchema,
    save: cloudSaveSchema.nullable(),
  })
  .strict();

export type CloudWrite = z.infer<typeof cloudWriteSchema>;

export const cloudSlotSchema = z
  .object({
    slotId: z.enum(LIVING_SAVE_SLOT_IDS),
    revision: z.number().int().nonnegative().safe(),
    save: cloudSaveSchema.nullable(),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export type CloudSlot = z.infer<typeof cloudSlotSchema>;

export const cloudWriteResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('saved'), slot: cloudSlotSchema }).strict(),
  z.object({ status: z.literal('conflict'), slot: cloudSlotSchema }).strict(),
  z.object({ status: z.literal('mutation-reused') }).strict(),
]);

export type CloudWriteResult = z.infer<typeof cloudWriteResultSchema>;

export const cloudCatalogSchema = z
  .object({
    protocolVersion: z.literal(CLOUD_PROTOCOL_VERSION),
    playerId: z.uuid(),
    authenticated: z.boolean(),
    slots: z.array(cloudSlotSchema).length(3),
  })
  .strict()
  .superRefine((catalog, context) => {
    if (new Set(catalog.slots.map((slot) => slot.slotId)).size !== 3) {
      context.addIssue({ code: 'custom', message: 'Duplicate save slots' });
    }
  });

export type CloudCatalog = z.infer<typeof cloudCatalogSchema>;

/** Timestamps and camera movement do not create a competing playthrough. */
export function cloudProgressKey(save: CloudSave | null): string {
  if (save === null) return 'deleted';
  return JSON.stringify({
    runId: save.runId.toLowerCase(),
    gameDataVersion: save.envelope.gameDataVersion,
    activeSceneId: save.envelope.activeSceneId,
    returnSceneId: save.envelope.returnSceneId,
    states: Object.entries(save.envelope.gamestateValues).sort(
      ([a], [b]) => Number(a) - Number(b),
    ),
    discoveredSceneIds: [...new Set(save.discoveredSceneIds)].sort(
      (a, b) => a - b,
    ),
    source: save.source,
  });
}

export type CloudReconciliation =
  | 'unchanged'
  | 'upload'
  | 'download'
  | 'conflict';

/** Creating a slot has not made a move; it must not compete with actual progress. */
export function isUnplayedCloudSave(save: CloudSave): boolean {
  if (
    save.source !== 'played' ||
    save.envelope.activeSceneId !== MORPHEUS_INITIAL_SCENE_ID ||
    save.envelope.returnSceneId !== null ||
    save.envelope.gameDataVersion !== LIVING_SAVE_GAME_DATA_VERSION ||
    save.discoveredSceneIds.some((id) => id !== MORPHEUS_INITIAL_SCENE_ID)
  )
    return false;
  const initial = Object.fromEntries(
    fetchInitial().map((state) => [state.stateId, state.value]),
  );
  return (
    Object.keys(save.envelope.gamestateValues).length ===
      Object.keys(initial).length &&
    Object.entries(initial).every(
      ([stateId, value]) =>
        save.envelope.gamestateValues[Number(stateId)] === value,
    )
  );
}

/** The acknowledged progress is durable and scoped to the current player. */
export function reconcileCloudSlot({
  local,
  acknowledgedProgress,
  remote,
  acknowledgedRevision,
}: {
  local: CloudSave | null;
  acknowledgedProgress: string | null;
  remote: CloudSlot;
  acknowledgedRevision: number | null;
}): CloudReconciliation {
  const localProgress = cloudProgressKey(local);
  const remoteProgress = cloudProgressKey(remote.save);
  if (localProgress === remoteProgress) return 'unchanged';
  // A first connection with an empty device is not a local deletion.
  if (acknowledgedRevision === null) {
    if (local === null) return 'download';
    if (remote.revision === 0 && remote.save === null) return 'upload';
    if (isUnplayedCloudSave(local)) return 'download';
    if (remote.save && isUnplayedCloudSave(remote.save)) return 'upload';
    return 'conflict';
  }
  if (localProgress === acknowledgedProgress) return 'download';
  if (remote.revision === acknowledgedRevision) return 'upload';
  return 'conflict';
}
