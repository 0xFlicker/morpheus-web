import { z } from 'zod';

import {
  cloudProgressKey,
  cloudSaveSchema,
  cloudWriteSchema,
  type CloudSave,
} from '@/lib/cloud/protocol';
import { parseLivingSaveSessionEnvelope } from '@/morpheus-app/storage/livingSaveSchema';
import {
  LIVING_SAVE_SLOT_IDS,
  type RawLivingSaveCatalog,
} from '@/morpheus-app/storage/livingSaveTypes';

export const CLOUD_LOCAL_METADATA_KEY = 'cloud-metadata';
export const CLOUD_LOCAL_CHANGE_EVENT = 'morpheus-local-save';

/** View changes synchronize quietly and never create competing game progress. */
export function cloudViewKey(save: CloudSave | null): string {
  if (save === null) return 'deleted';
  return JSON.stringify([
    cloudProgressKey(save),
    save.envelope.rotation.yaw3600,
    save.envelope.rotation.pitch,
  ]);
}

export const MAX_LOCAL_SAVE_CANDIDATES = 8;
export const localCloudCandidateSchema = z.object({
  writerId: z.uuid(),
  candidateId: z.uuid(),
  save: cloudSaveSchema,
  baseProgress: z.string(),
  baseSlotRevision: z.number().int().nonnegative(),
});
export type LocalCloudCandidate = z.infer<typeof localCloudCandidateSchema>;

const slotMetadataSchema = z.object({
  save: cloudSaveSchema.nullable(),
  deletedSave: cloudSaveSchema.nullable(),
  guestSave: cloudSaveSchema.nullable(),
  localCandidates: z
    .array(localCloudCandidateSchema)
    .max(MAX_LOCAL_SAVE_CANDIDATES),
  acknowledgedRevision: z.number().int().nonnegative().nullable(),
  acknowledgedProgress: z.string().nullable(),
  acknowledgedView: z.string().nullable(),
  pending: cloudWriteSchema.nullable(),
});
export const cloudLocalMetadataSchema = z.object({
  identityKey: z.string().nullable(),
  noticeAcknowledgedAt: z.number().nullable(),
  onlineServicesEnabled: z.boolean(),
  playerId: z.uuid().nullable(),
  deviceId: z.uuid(),
  slots: z.object({
    'slot-1': slotMetadataSchema,
    'slot-2': slotMetadataSchema,
    'slot-3': slotMetadataSchema,
  }),
});
export type CloudLocalMetadata = z.infer<typeof cloudLocalMetadataSchema>;

export function createCloudLocalMetadata(): CloudLocalMetadata {
  const empty = () => ({
    save: null,
    deletedSave: null,
    guestSave: null,
    localCandidates: [],
    acknowledgedRevision: null,
    acknowledgedProgress: null,
    acknowledgedView: null,
    pending: null,
  });
  return {
    identityKey: null,
    noticeAcknowledgedAt: null,
    onlineServicesEnabled: false,
    playerId: null,
    deviceId: crypto.randomUUID(),
    slots: {
      'slot-1': empty(),
      'slot-2': empty(),
      'slot-3': empty(),
    },
  };
}

/** Called inside the checkpoint's IndexedDB transaction, before it acknowledges success. */
export function updateCloudLocalMetadata(
  metadata: CloudLocalMetadata,
  before: RawLivingSaveCatalog,
  after: RawLivingSaveCatalog,
  source: 'played' | 'imported' | 'undo',
): CloudLocalMetadata {
  const slots = { ...metadata.slots };
  let changed = false;
  for (const slotId of LIVING_SAVE_SLOT_IDS) {
    const slot = after.slots[slotId];
    const previous = slots[slotId];
    if (
      slot.revision === before.slots[slotId].revision &&
      (slot.payload === null || previous.save !== null)
    )
      continue;
    if (slot.payload === null) {
      changed = true;
      slots[slotId] = {
        ...previous,
        save: null,
        deletedSave: previous.save ?? previous.deletedSave,
      };
      continue;
    }
    const parsed = parseLivingSaveSessionEnvelope(slot.payload);
    // Preserve unloadable local saves for export; never upload guessed data.
    if (!parsed.success) continue;
    changed = true;
    const undone = before.tombstones[slotId]?.slot.payload;
    const restored =
      source === 'undo' &&
      undone !== undefined &&
      before.slots[slotId].payload === null
        ? previous.deletedSave
        : null;
    const previousSave =
      before.slots[slotId].payload === null ? restored : previous.save;
    slots[slotId] = {
      ...previous,
      deletedSave: null,
      save: {
        runId: previousSave?.runId ?? crypto.randomUUID(),
        envelope: parsed.data,
        discoveredSceneIds: [
          ...new Set([
            ...(previousSave?.discoveredSceneIds ?? []),
            parsed.data.activeSceneId,
          ]),
        ].slice(-4096),
        source:
          previousSave?.source ??
          (source === 'imported' ? 'imported' : 'played'),
      },
    };
  }
  return changed ? { ...metadata, slots } : metadata;
}
