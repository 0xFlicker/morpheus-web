import { z } from 'zod';
import { cloudProgressKey, type CloudSave } from '@/lib/cloud/protocol';

import {
  MAX_LOCAL_SAVE_CANDIDATES,
  cloudViewKey,
  type CloudLocalMetadata,
  CLOUD_LOCAL_CHANGE_EVENT,
  CLOUD_LOCAL_METADATA_KEY,
  cloudLocalMetadataSchema,
  createCloudLocalMetadata,
  updateCloudLocalMetadata,
} from '@/morpheus-app/cloud/localMetadata';

import { parseLivingSaveSessionEnvelope } from './livingSaveSchema';
import {
  LIVING_SAVE_CATALOG_FORMAT,
  LIVING_SAVE_CATALOG_SCHEMA_VERSION,
  LIVING_SAVE_GAME_DATA_VERSION,
  LIVING_SAVE_SLOT_IDS,
  LIVING_SAVE_UNDO_WINDOW_MS,
} from './livingSaveTypes';
import type {
  LivingSaveCatalog,
  LivingSaveResult,
  LivingSaveSessionEnvelope,
  LivingSaveSlot,
  LivingSaveSlotId,
  RawLivingSaveCatalog,
  RawLivingSaveSlotRecord,
  RawLivingSaveTombstone,
} from './livingSaveTypes';

export const LIVING_SAVE_DATABASE_NAME = 'morpheus_living_saves';
export const LIVING_SAVE_DATABASE_VERSION = 1;
export const LIVING_SAVE_STORE_NAME = 'catalog';
export const LIVING_SAVE_CATALOG_KEY = 'living-save-catalog';

// Each browser tab fences its own runtime's writes against the shared catalog owner.
let browserIdentityFence: string | null | undefined;
export function setLivingSaveIdentityFence(
  identityKey: string | null | undefined,
): void {
  browserIdentityFence = identityKey;
}

type WriterBase = {
  identityKey: string | null;
  revision: number;
  save: CloudSave;
};
const writerBases = new Map<string, WriterBase>();
let browserWriterId: string | undefined;
export function getLivingSaveWriterId(): string {
  // A new page gets a new writer: duplicating a tab can clone sessionStorage.
  browserWriterId ??= crypto.randomUUID();
  return browserWriterId;
}

const writerKey = (writerId: string, slotId: LivingSaveSlotId) =>
  `${writerId}:${slotId}`;
type WriterTransaction = {
  writerId: string;
  slotId: LivingSaveSlotId;
  checkpoint?: {
    envelope: LivingSaveSessionEnvelope;
    expectedSlotRevision: number;
  };
};

const slotIdSchema = z.enum(LIVING_SAVE_SLOT_IDS);
const rawSlotSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    payload: z.unknown().nullable(),
  })
  .strict();
const rawTombstoneSchema = z
  .object({
    slot: rawSlotSchema,
    deletedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
    wasActive: z.boolean(),
  })
  .strict();
const rawCatalogSchema = z
  .object({
    format: z.literal(LIVING_SAVE_CATALOG_FORMAT),
    schemaVersion: z.literal(LIVING_SAVE_CATALOG_SCHEMA_VERSION),
    revision: z.number().int().nonnegative(),
    activeSlotId: slotIdSchema.nullable(),
    slots: z
      .object({
        'slot-1': rawSlotSchema,
        'slot-2': rawSlotSchema,
        'slot-3': rawSlotSchema,
      })
      .strict(),
    tombstones: z
      .object({
        'slot-1': rawTombstoneSchema.optional(),
        'slot-2': rawTombstoneSchema.optional(),
        'slot-3': rawTombstoneSchema.optional(),
      })
      .strict(),
  })
  .strict();

type CatalogMutation =
  | { ok: true; catalog: RawLivingSaveCatalog }
  | {
      ok: false;
      code: Exclude<LivingSaveResult<never>, { ok: true }>['code'];
      reason?: string;
      checkpointRetained?: true;
    };

export function createEmptyRawCatalog(): RawLivingSaveCatalog {
  return {
    format: LIVING_SAVE_CATALOG_FORMAT,
    schemaVersion: LIVING_SAVE_CATALOG_SCHEMA_VERSION,
    revision: 0,
    activeSlotId: null,
    slots: {
      'slot-1': { revision: 0, payload: null },
      'slot-2': { revision: 0, payload: null },
      'slot-3': { revision: 0, payload: null },
    },
    tombstones: {},
  };
}

export function openLivingSaveDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(
      LIVING_SAVE_DATABASE_NAME,
      LIVING_SAVE_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LIVING_SAVE_STORE_NAME)) {
        database.createObjectStore(LIVING_SAVE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open living-save storage'));
  });
}

export function parseRawCatalog(value: unknown): RawLivingSaveCatalog | null {
  const parsed = rawCatalogSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function classifySlot(
  slotId: LivingSaveSlotId,
  rawSlot: RawLivingSaveSlotRecord,
): LivingSaveSlot {
  if (rawSlot.payload === null) {
    return { kind: 'empty', slotId, revision: rawSlot.revision };
  }
  const parsed = parseLivingSaveSessionEnvelope(rawSlot.payload);
  if (!parsed.success) {
    return {
      kind: 'unloadable',
      slotId,
      revision: rawSlot.revision,
      reason: parsed.issues.some((issue) => issue.startsWith('Unsupported'))
        ? 'unsupported-version'
        : 'invalid-data',
    };
  }
  if (parsed.data.gameDataVersion !== LIVING_SAVE_GAME_DATA_VERSION) {
    return {
      kind: 'unloadable',
      slotId,
      revision: rawSlot.revision,
      reason: 'unsupported-version',
    };
  }
  return {
    kind: 'occupied',
    slotId,
    revision: rawSlot.revision,
    envelope: parsed.data,
  };
}

export function classifyCatalog(raw: RawLivingSaveCatalog): LivingSaveCatalog {
  const slots = {
    'slot-1': classifySlot('slot-1', raw.slots['slot-1']),
    'slot-2': classifySlot('slot-2', raw.slots['slot-2']),
    'slot-3': classifySlot('slot-3', raw.slots['slot-3']),
  };
  const tombstones: LivingSaveCatalog['tombstones'] = {};
  for (const slotId of LIVING_SAVE_SLOT_IDS) {
    const tombstone = raw.tombstones[slotId];
    if (tombstone) {
      tombstones[slotId] = {
        slotId,
        deletedAt: tombstone.deletedAt,
        expiresAt: tombstone.expiresAt,
        wasActive: tombstone.wasActive,
      };
    }
  }
  return {
    format: raw.format,
    schemaVersion: raw.schemaVersion,
    revision: raw.revision,
    activeSlotId: raw.activeSlotId,
    slots,
    tombstones,
  };
}

function prepareLocalCheckpoint(
  catalog: RawLivingSaveCatalog,
  metadata: CloudLocalMetadata,
  writer: WriterTransaction,
  base: WriterBase | undefined,
): {
  mutation: CatalogMutation;
  metadata: CloudLocalMetadata;
  notify?: boolean;
} {
  const checkpoint = writer.checkpoint;
  if (!checkpoint) throw new Error('A checkpoint envelope is required.');
  const currentSlot = catalog.slots[writer.slotId];
  const current = metadata.slots[writer.slotId];
  const prior = current.localCandidates.find(
    (candidate) => candidate.writerId === writer.writerId,
  );
  const validBase =
    base?.identityKey === metadata.identityKey ? base : undefined;
  const seed = validBase
    ? validBase.save
    : currentSlot.revision === checkpoint.expectedSlotRevision
      ? current.save
      : null;
  if (!seed)
    return {
      mutation: {
        ok: false,
        code: 'unavailable-storage',
        reason: 'The journey baseline is unavailable.',
      },
      metadata,
    };
  const save: CloudSave = {
    ...seed,
    envelope: checkpoint.envelope,
    discoveredSceneIds: [
      ...new Set([
        ...(prior?.save.discoveredSceneIds ?? seed.discoveredSceneIds),
        checkpoint.envelope.activeSceneId,
      ]),
    ].slice(-4096),
  };
  const progress = cloudProgressKey(save);
  const storedProgress = cloudProgressKey(current.save);
  const baseProgress = prior?.baseProgress ?? cloudProgressKey(seed);
  const baseRevision = validBase?.revision ?? checkpoint.expectedSlotRevision;
  if (
    !prior &&
    (currentSlot.revision === baseRevision ||
      storedProgress === baseProgress ||
      storedProgress === progress)
  ) {
    if (currentSlot.payload === null)
      return { mutation: { ok: false, code: 'empty-target' }, metadata };
    const next = updatedCatalog(catalog, {
      slots: {
        ...catalog.slots,
        [writer.slotId]: {
          revision: currentSlot.revision + 1,
          payload: checkpoint.envelope,
        },
      },
    });
    return {
      mutation: { ok: true, catalog: next },
      metadata: {
        ...metadata,
        slots: { ...metadata.slots, [writer.slotId]: { ...current, save } },
      },
    };
  }
  // Camera/timestamp-only activity cannot compete with another tab's actual moves.
  if (!prior && progress === baseProgress)
    return {
      mutation: { ok: false, code: 'conflict', checkpointRetained: true },
      metadata,
      notify: true,
    };
  if (!prior && current.localCandidates.length >= MAX_LOCAL_SAVE_CANDIDATES)
    return {
      mutation: {
        ok: false,
        code: 'unavailable-storage',
        reason:
          'Choose between the existing journey versions before continuing in another tab.',
      },
      metadata,
    };
  if (prior && cloudProgressKey(prior.save) === progress) {
    const updated = cloudViewKey(prior.save) !== cloudViewKey(save);
    return {
      mutation: { ok: false, code: 'conflict', checkpointRetained: true },
      metadata: updated
        ? {
            ...metadata,
            slots: {
              ...metadata.slots,
              [writer.slotId]: {
                ...current,
                localCandidates: current.localCandidates.map((candidate) =>
                  candidate.candidateId === prior.candidateId
                    ? { ...candidate, save }
                    : candidate,
                ),
              },
            },
          }
        : metadata,
      notify: true,
    };
  }
  const candidate = {
    writerId: writer.writerId,
    candidateId: crypto.randomUUID(),
    save,
    baseProgress,
    baseSlotRevision:
      prior?.baseSlotRevision ??
      base?.revision ??
      checkpoint.expectedSlotRevision,
  };
  return {
    mutation: { ok: false, code: 'conflict', checkpointRetained: true },
    metadata: {
      ...metadata,
      slots: {
        ...metadata.slots,
        [writer.slotId]: {
          ...current,
          localCandidates: [
            ...current.localCandidates.filter(
              (value) => value.writerId !== writer.writerId,
            ),
            candidate,
          ],
        },
      },
    },
    notify: true,
  };
}

async function runRawCatalogTransaction<T>(
  mode: IDBTransactionMode,
  mutate: (catalog: RawLivingSaveCatalog) => CatalogMutation,
  select: (catalog: RawLivingSaveCatalog) => T,
  source: 'played' | 'imported' | 'undo' = 'played',
  writer?: WriterTransaction,
): Promise<LivingSaveResult<T>> {
  const expectedIdentity = browserIdentityFence;
  const base = writer
    ? writerBases.get(writerKey(writer.writerId, writer.slotId))
    : undefined;
  let database: IDBDatabase;
  try {
    database = await openLivingSaveDatabase();
  } catch (error) {
    return {
      ok: false,
      code: 'unavailable-storage',
      reason:
        error instanceof Error ? error.message : 'IndexedDB is unavailable',
    };
  }
  return new Promise((resolve) => {
    const transaction = database.transaction(LIVING_SAVE_STORE_NAME, mode);
    const store = transaction.objectStore(LIVING_SAVE_STORE_NAME);
    const request = store.get(LIVING_SAVE_CATALOG_KEY);
    let result: LivingSaveResult<T> | null = null;
    let changed = false;
    let installedBase: WriterBase | undefined;
    request.onsuccess = () => {
      const raw =
        request.result === undefined
          ? createEmptyRawCatalog()
          : parseRawCatalog(request.result);
      if (!raw) {
        result = {
          ok: false,
          code: 'invalid-data',
          reason: 'The living-save catalog is malformed.',
        };
        return;
      }
      const initialMutation = mutate(raw);
      if (!initialMutation.ok) {
        result = initialMutation;
        return;
      }
      if (
        mode !== 'readwrite' ||
        (!writer &&
          initialMutation.catalog === raw &&
          request.result !== undefined)
      ) {
        result = { ok: true, value: select(initialMutation.catalog) };
        return;
      }
      const metadataRequest = store.get(CLOUD_LOCAL_METADATA_KEY);
      metadataRequest.onsuccess = () => {
        try {
          const parsed = cloudLocalMetadataSchema.safeParse(
            metadataRequest.result,
          );
          if (metadataRequest.result !== undefined && !parsed.success)
            throw new Error('The local save connection data is malformed.');
          const existingMetadata = parsed.success
            ? parsed.data
            : createCloudLocalMetadata();
          if (
            expectedIdentity !== undefined &&
            existingMetadata.identityKey !== expectedIdentity
          ) {
            result = {
              ok: false,
              code: 'conflict',
              reason: 'The account on this device changed.',
            };
            return;
          }
          let metadata = updateCloudLocalMetadata(
            existingMetadata,
            raw,
            raw,
            'imported',
          );
          let mutation: CatalogMutation = initialMutation;
          if (writer?.checkpoint) {
            const prepared = prepareLocalCheckpoint(
              raw,
              metadata,
              writer,
              base,
            );
            metadata = prepared.metadata;
            mutation = prepared.mutation;
            changed = prepared.notify ?? false;
          } else if (
            writer &&
            metadata.slots[writer.slotId].localCandidates.length > 0
          ) {
            result = {
              ok: false,
              code: 'conflict',
              reason: 'Choose which journey version to keep.',
            };
            return;
          } else {
            metadata = updateCloudLocalMetadata(
              metadata,
              raw,
              initialMutation.catalog,
              source,
            );
          }
          if (mutation.ok) {
            result = { ok: true, value: select(mutation.catalog) };
            if (mutation.catalog !== raw || request.result === undefined) {
              store.put(mutation.catalog, LIVING_SAVE_CATALOG_KEY);
              changed = true;
            }
            const save = writer ? metadata.slots[writer.slotId].save : null;
            if (writer && save)
              installedBase = {
                identityKey: metadata.identityKey,
                revision: mutation.catalog.slots[writer.slotId].revision,
                save,
              };
          } else result = mutation;
          if (
            metadata !== existingMetadata ||
            metadataRequest.result === undefined
          ) {
            store.put(metadata, CLOUD_LOCAL_METADATA_KEY);
            changed = true;
          }
        } catch (error) {
          result = {
            ok: false,
            code: 'unavailable-storage',
            reason:
              error instanceof Error
                ? error.message
                : 'Local save metadata is unavailable.',
          };
          transaction.abort();
        }
      };
      metadataRequest.onerror = () => transaction.abort();
    };
    request.onerror = () => transaction.abort();
    transaction.oncomplete = () => {
      database.close();
      if (writer && installedBase)
        writerBases.set(
          writerKey(writer.writerId, writer.slotId),
          installedBase,
        );
      if (changed && typeof window !== 'undefined')
        window.dispatchEvent(new Event(CLOUD_LOCAL_CHANGE_EVENT));
      resolve(
        result ?? {
          ok: false,
          code: 'unavailable-storage',
          reason: 'Living-save transaction completed without a result.',
        },
      );
    };
    transaction.onerror = transaction.onabort = () => {
      database.close();
      resolve(
        result && !result.ok && result.code === 'unavailable-storage'
          ? result
          : {
              ok: false,
              code: 'unavailable-storage',
              reason:
                transaction.error?.message ??
                'Living-save transaction was aborted.',
            },
      );
    };
  });
}

function runCatalogTransaction(
  mutate: (catalog: RawLivingSaveCatalog) => CatalogMutation,
  source: 'played' | 'imported' | 'undo' = 'played',
  writer?: WriterTransaction,
): Promise<LivingSaveResult<LivingSaveCatalog>> {
  return runRawCatalogTransaction(
    'readwrite',
    mutate,
    classifyCatalog,
    source,
    writer,
  );
}

function conflict(): CatalogMutation {
  return { ok: false, code: 'conflict' };
}

function withCatalogRevision(
  catalog: RawLivingSaveCatalog,
  expectedCatalogRevision: number,
): CatalogMutation | null {
  return catalog.revision === expectedCatalogRevision ? null : conflict();
}

function updatedCatalog(
  catalog: RawLivingSaveCatalog,
  changes: Partial<RawLivingSaveCatalog>,
): RawLivingSaveCatalog {
  return { ...catalog, ...changes, revision: catalog.revision + 1 };
}

export function readLivingSaveCatalog(): Promise<
  LivingSaveResult<LivingSaveCatalog>
> {
  return runCatalogTransaction((catalog) => ({ ok: true, catalog }));
}

export async function readLivingSaveRawPayload(
  slotId: LivingSaveSlotId,
): Promise<LivingSaveResult<unknown>> {
  const result = await runRawCatalogTransaction(
    'readonly',
    (catalog) => ({ ok: true, catalog }),
    (catalog) => catalog.slots[slotId].payload,
  );
  if (!result.ok) {
    return result;
  }
  if (result.value === null) {
    return { ok: false, code: 'empty-target' };
  }
  return result;
}

export function createLivingSaveSlot(params: {
  slotId: LivingSaveSlotId;
  writerId?: string;
  envelope: LivingSaveSessionEnvelope;
  expectedCatalogRevision: number;
  activate: boolean;
}): Promise<LivingSaveResult<LivingSaveCatalog>> {
  return runCatalogTransaction(
    (catalog) => {
      const revisionConflict = withCatalogRevision(
        catalog,
        params.expectedCatalogRevision,
      );
      if (revisionConflict) return revisionConflict;
      const currentSlot = catalog.slots[params.slotId];
      if (currentSlot.payload !== null) {
        return { ok: false, code: 'occupied-target' };
      }
      const slots = {
        ...catalog.slots,
        [params.slotId]: {
          revision: currentSlot.revision + 1,
          payload: params.envelope,
        },
      };
      return {
        ok: true,
        catalog: updatedCatalog(catalog, {
          slots,
          activeSlotId: params.activate ? params.slotId : catalog.activeSlotId,
          tombstones: {
            ...catalog.tombstones,
            [params.slotId]: undefined,
          },
        }),
      };
    },
    'played',
    params.activate
      ? {
          slotId: params.slotId,
          writerId: params.writerId ?? getLivingSaveWriterId(),
        }
      : undefined,
  );
}

export function activateLivingSaveSlot(params: {
  slotId: LivingSaveSlotId;
  writerId?: string;
  expectedCatalogRevision: number;
  expectedSlotRevision: number;
}): Promise<LivingSaveResult<LivingSaveCatalog>> {
  return runCatalogTransaction(
    (catalog) => {
      const revisionConflict = withCatalogRevision(
        catalog,
        params.expectedCatalogRevision,
      );
      if (
        revisionConflict ||
        catalog.slots[params.slotId].revision !== params.expectedSlotRevision
      ) {
        return conflict();
      }
      if (catalog.slots[params.slotId].payload === null) {
        return { ok: false, code: 'empty-target' };
      }
      if (catalog.activeSlotId === params.slotId) {
        return { ok: true, catalog };
      }
      return {
        ok: true,
        catalog: updatedCatalog(catalog, { activeSlotId: params.slotId }),
      };
    },
    'played',
    {
      slotId: params.slotId,
      writerId: params.writerId ?? getLivingSaveWriterId(),
    },
  );
}

export function writeLivingSaveCheckpoint(params: {
  slotId: LivingSaveSlotId;
  envelope: LivingSaveSessionEnvelope;
  expectedCatalogRevision: number;
  expectedSlotRevision: number;
  writerId?: string;
}): Promise<LivingSaveResult<LivingSaveCatalog>> {
  // The slot revision is the ownership check. Another slot's activity can rebase.
  return runCatalogTransaction((catalog) => ({ ok: true, catalog }), 'played', {
    slotId: params.slotId,
    writerId: params.writerId ?? getLivingSaveWriterId(),
    checkpoint: {
      envelope: params.envelope,
      expectedSlotRevision: params.expectedSlotRevision,
    },
  });
}

export function deleteLivingSaveSlot(params: {
  slotId: LivingSaveSlotId;
  expectedCatalogRevision: number;
  expectedSlotRevision: number;
  now?: number;
}): Promise<LivingSaveResult<LivingSaveCatalog>> {
  return runCatalogTransaction((catalog) => {
    const slot = catalog.slots[params.slotId];
    const revisionConflict = withCatalogRevision(
      catalog,
      params.expectedCatalogRevision,
    );
    if (revisionConflict || slot.revision !== params.expectedSlotRevision) {
      return conflict();
    }
    if (slot.payload === null) {
      return { ok: false, code: 'empty-target' };
    }
    const deletedAt = params.now ?? Date.now();
    const tombstone: RawLivingSaveTombstone = {
      slot,
      deletedAt,
      expiresAt: deletedAt + LIVING_SAVE_UNDO_WINDOW_MS,
      wasActive: catalog.activeSlotId === params.slotId,
    };
    return {
      ok: true,
      catalog: updatedCatalog(catalog, {
        activeSlotId:
          catalog.activeSlotId === params.slotId ? null : catalog.activeSlotId,
        slots: {
          ...catalog.slots,
          [params.slotId]: {
            revision: slot.revision + 1,
            payload: null,
          },
        },
        tombstones: {
          ...catalog.tombstones,
          [params.slotId]: tombstone,
        },
      }),
    };
  });
}

export function undoLivingSaveDeletion(params: {
  slotId: LivingSaveSlotId;
  expectedCatalogRevision: number;
  expectedSlotRevision: number;
  now?: number;
}): Promise<LivingSaveResult<LivingSaveCatalog>> {
  return runCatalogTransaction((catalog) => {
    const slot = catalog.slots[params.slotId];
    const revisionConflict = withCatalogRevision(
      catalog,
      params.expectedCatalogRevision,
    );
    if (revisionConflict || slot.revision !== params.expectedSlotRevision) {
      return conflict();
    }
    const tombstone = catalog.tombstones[params.slotId];
    if (!tombstone) {
      return { ok: false, code: 'undo-unavailable' };
    }
    const now = params.now ?? Date.now();
    if (now > tombstone.expiresAt) {
      return { ok: false, code: 'undo-expired' };
    }
    if (slot.payload !== null) {
      return { ok: false, code: 'occupied-target' };
    }
    return {
      ok: true,
      catalog: updatedCatalog(catalog, {
        activeSlotId: tombstone.wasActive
          ? params.slotId
          : catalog.activeSlotId,
        slots: {
          ...catalog.slots,
          [params.slotId]: { ...tombstone.slot, revision: slot.revision + 1 },
        },
        tombstones: {
          ...catalog.tombstones,
          [params.slotId]: undefined,
        },
      }),
    };
  }, 'undo');
}

export function importLivingSaveSlot(params: {
  slotId: LivingSaveSlotId;
  envelope: LivingSaveSessionEnvelope;
  expectedCatalogRevision: number;
  expectedSlotRevision: number;
}): Promise<LivingSaveResult<LivingSaveCatalog>> {
  return runCatalogTransaction((catalog) => {
    const slot = catalog.slots[params.slotId];
    const revisionConflict = withCatalogRevision(
      catalog,
      params.expectedCatalogRevision,
    );
    if (revisionConflict || slot.revision !== params.expectedSlotRevision) {
      return conflict();
    }
    if (slot.payload !== null) {
      return { ok: false, code: 'occupied-target' };
    }
    return {
      ok: true,
      catalog: updatedCatalog(catalog, {
        slots: {
          ...catalog.slots,
          [params.slotId]: {
            revision: slot.revision + 1,
            payload: params.envelope,
          },
        },
        tombstones: {
          ...catalog.tombstones,
          [params.slotId]: undefined,
        },
      }),
    };
  }, 'imported');
}

export async function readLivingSaveEnvelope(
  slotId: LivingSaveSlotId,
): Promise<LivingSaveResult<LivingSaveSessionEnvelope>> {
  const catalogResult = await readLivingSaveCatalog();
  if (!catalogResult.ok) return catalogResult;
  const slot = catalogResult.value.slots[slotId];
  if (slot.kind === 'empty') {
    return { ok: false, code: 'empty-target' };
  }
  if (slot.kind === 'unloadable') {
    return { ok: false, code: 'invalid-data' };
  }
  return { ok: true, value: slot.envelope };
}
