import { describe, expect, it, vi } from 'vitest';
import type { Scene } from 'morpheus/casts/types';

import {
  createGenesisLivingSaveEnvelope,
  createLivingSaveCoordinator,
} from './livingSaveCoordinator';
import { createAppStore } from './store';
import {
  createEmptyLivingSaveCatalogFixture,
  createLivingSaveEnvelopeFixture,
  occupyLivingSaveSlot,
} from './testFixtures';
import type {
  LivingSaveCatalog,
  LivingSaveResult,
  LivingSaveSessionEnvelope,
  LivingSaveSlotId,
  LivingSaveValidationResult,
} from '@/morpheus-app/storage/livingSaveTypes';

const scene = (sceneId: number): Scene => ({
  sceneId,
  cdFlags: 0,
  sceneType: 0,
  palette: 0,
  casts: [],
});

const unconfiguredFileParser = async () => ({
  ok: false as const,
  code: 'malformed' as const,
  reason: 'File parsing is not used by this test.',
});

function createHarness(
  catalog: LivingSaveCatalog,
  storage: {
    readEnvelope?: (
      slotId: LivingSaveSlotId,
    ) => Promise<LivingSaveResult<LivingSaveSessionEnvelope>>;
    readRawPayload?: (
      slotId: LivingSaveSlotId,
    ) => Promise<LivingSaveResult<unknown>>;
  } = {},
) {
  const store = createAppStore();
  const validateEnvelope = async (
    envelope: Parameters<
      Parameters<typeof createLivingSaveCoordinator>[0]['validateEnvelope']
    >[0],
  ): Promise<LivingSaveValidationResult> => ({ ok: true, envelope });
  const coordinator = createLivingSaveCoordinator({
    dispatch: store.dispatch,
    getState: store.getState,
    readCatalog: async () => ({ ok: true, value: catalog }),
    activateSlot: async () => ({ ok: true, value: catalog }),
    createSlot: async () => ({ ok: true, value: catalog }),
    ...storage,
    parseFileText: unconfiguredFileParser,
    validateEnvelope: (envelope) => validateEnvelope(envelope),
    fetchScene: async (sceneId) => scene(sceneId),
  });
  return {
    store,
    coordinator,
  };
}

describe('livingSaveCoordinator', () => {
  it('seeds a new game at the cargo hatch heading', () => {
    expect(createGenesisLivingSaveEnvelope().rotation).toEqual({
      yaw3600: 1500,
      pitch: 0,
    });
  });

  it('prepares occupied and unloadable slots for export behind one boundary', async () => {
    const envelope = createLivingSaveEnvelopeFixture({
      resumePointId: 'resume-test',
    });
    const readEnvelope = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: envelope })
      .mockResolvedValueOnce({ ok: false, code: 'invalid-data' });
    const readRawPayload = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { legacy: true } });
    const harness = createHarness(createEmptyLivingSaveCatalogFixture(), {
      readEnvelope,
      readRawPayload,
    });

    await expect(harness.coordinator.readExportFile('slot-1')).resolves.toEqual(
      {
        ok: true,
        value: {
          contents: `${JSON.stringify(envelope, null, 2)}\n`,
          suffix: 'resume-test',
        },
      },
    );
    await expect(harness.coordinator.readExportFile('slot-2')).resolves.toEqual(
      {
        ok: true,
        value: {
          contents: '{\n  "legacy": true\n}\n',
          suffix: 'unavailable',
        },
      },
    );
  });

  it('keeps the title hub visible when an active slot exists', async () => {
    const envelope = createLivingSaveEnvelopeFixture({ activeSceneId: 2000 });
    const catalog = occupyLivingSaveSlot(
      createEmptyLivingSaveCatalogFixture(),
      'slot-1',
      envelope,
    );
    const harness = createHarness(catalog);

    await expect(harness.coordinator.bootstrap()).resolves.toEqual({
      ok: true,
      kind: 'title',
    });

    expect(harness.store.getState().scene.activeSceneId).toBeNull();
    expect(harness.store.getState().livingSaves.activeSlotId).toBe('slot-1');
  });

  it('installs an empty slot only after its durable genesis record is created', async () => {
    const catalog = createEmptyLivingSaveCatalogFixture();
    const createdCatalog = occupyLivingSaveSlot(
      catalog,
      'slot-2',
      createLivingSaveEnvelopeFixture({ activeSceneId: 2000 }),
    );
    const store = createAppStore();
    const creationControl: { resolve: (() => void) | null } = { resolve: null };
    const creation = new Promise<void>((resolve) => {
      creationControl.resolve = resolve;
    });
    const createStartControl: { resolve: (() => void) | null } = {
      resolve: null,
    };
    const createStarted = new Promise<void>((resolve) => {
      createStartControl.resolve = resolve;
    });
    const createSlotCalls: Array<{ slotId: string; activate: boolean }> = [];
    const coordinator = createLivingSaveCoordinator({
      dispatch: store.dispatch,
      getState: store.getState,
      readCatalog: async () => ({ ok: true, value: catalog }),
      activateSlot: async () => ({ ok: true, value: catalog }),
      createSlot: async ({ slotId, activate }) => {
        createSlotCalls.push({ slotId, activate });
        createStartControl.resolve?.();
        await creation;
        return { ok: true, value: createdCatalog };
      },
      parseFileText: unconfiguredFileParser,
      validateEnvelope: async (envelope) => ({ ok: true, envelope }),
      fetchScene: async (sceneId) => scene(sceneId),
    });

    const created = coordinator.createNewSlot('slot-2');

    await createStarted;
    expect(createSlotCalls).toEqual([{ slotId: 'slot-2', activate: true }]);
    expect(store.getState().livingSaves.activeSlotId).toBeNull();

    const resolveCreate = creationControl.resolve;
    if (resolveCreate === null) {
      throw new Error('Expected the durable create operation to be pending');
    }
    resolveCreate();

    await expect(created).resolves.toEqual({ ok: true, kind: 'created' });
    expect(store.getState().livingSaves).toMatchObject({
      activeSlotId: 'slot-2',
      saveHealth: 'saved',
      skipSceneEntryActions: false,
    });
    expect(store.getState().scene.activeSceneId).toBe(2000);
  });

  it('ignores a stale restore completion after a newer operation succeeds', async () => {
    const firstEnvelope = createLivingSaveEnvelopeFixture({
      resumePointId: 'first',
      activeSceneId: 2000,
    });
    const secondEnvelope = createLivingSaveEnvelopeFixture({
      resumePointId: 'second',
      activeSceneId: 1050,
    });
    let catalog = occupyLivingSaveSlot(
      createEmptyLivingSaveCatalogFixture(),
      'slot-1',
      firstEnvelope,
    );
    catalog = {
      ...catalog,
      revision: catalog.revision + 1,
      slots: {
        ...catalog.slots,
        'slot-2': {
          kind: 'occupied',
          slotId: 'slot-2',
          revision: 1,
          envelope: secondEnvelope,
        },
      },
    };
    const store = createAppStore();
    let releaseFirst: () => void = () => undefined;
    const firstValidation = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const coordinator = createLivingSaveCoordinator({
      dispatch: store.dispatch,
      getState: store.getState,
      readCatalog: async () => ({ ok: true, value: catalog }),
      activateSlot: async ({ slotId }) => ({
        ok: true,
        value: { ...catalog, activeSlotId: slotId },
      }),
      createSlot: async () => ({ ok: true, value: catalog }),
      parseFileText: unconfiguredFileParser,
      validateEnvelope: async (envelope) => {
        if (envelope.resumePointId === 'first') await firstValidation;
        return { ok: true, envelope };
      },
      fetchScene: async (sceneId) => scene(sceneId),
    });

    const stale = coordinator.restoreSlot('slot-1');
    await coordinator.restoreSlot('slot-2');
    releaseFirst();
    await stale;

    expect(store.getState().scene.activeSceneId).toBe(1050);
    expect(store.getState().livingSaves.activeSlotId).toBe('slot-2');
  });

  it('deletes only the selected active slot and leaves the running session volatile', async () => {
    const envelope = createLivingSaveEnvelopeFixture();
    const catalog = occupyLivingSaveSlot(
      createEmptyLivingSaveCatalogFixture(),
      'slot-1',
      envelope,
    );
    const deletedCatalog: LivingSaveCatalog = {
      ...catalog,
      revision: catalog.revision + 1,
      activeSlotId: null,
      slots: {
        ...catalog.slots,
        'slot-1': {
          kind: 'empty',
          slotId: 'slot-1',
          revision: catalog.slots['slot-1'].revision + 1,
        },
      },
      tombstones: {
        'slot-1': {
          slotId: 'slot-1',
          deletedAt: 100,
          expiresAt: 10_100,
          wasActive: true,
        },
      },
    };
    const store = createAppStore();
    const deleteSlot = vi.fn(async () => ({
      ok: true as const,
      value: deletedCatalog,
    }));
    const coordinator = createLivingSaveCoordinator({
      dispatch: store.dispatch,
      getState: store.getState,
      readCatalog: async () => ({ ok: true, value: catalog }),
      activateSlot: async () => ({ ok: true, value: catalog }),
      createSlot: async () => ({ ok: true, value: catalog }),
      deleteSlot,
      parseFileText: unconfiguredFileParser,
      validateEnvelope: async (value) => ({ ok: true, envelope: value }),
      fetchScene: async (sceneId) => scene(sceneId),
    });

    await expect(coordinator.deleteSlot('slot-1')).resolves.toEqual({
      ok: true,
      kind: 'managed',
    });

    expect(deleteSlot).toHaveBeenCalledWith({
      slotId: 'slot-1',
      expectedCatalogRevision: catalog.revision,
      expectedSlotRevision: catalog.slots['slot-1'].revision,
    });
    expect(store.getState().livingSaves).toMatchObject({
      activeSlotId: null,
      saveHealth: 'volatile',
    });
    expect(store.getState().livingSaves.slots[0].state).toBe('empty');
  });

  it('rejects an invalid imported file before mutating an empty slot', async () => {
    const catalog = createEmptyLivingSaveCatalogFixture();
    const store = createAppStore();
    const importSlot = vi.fn();
    const coordinator = createLivingSaveCoordinator({
      dispatch: store.dispatch,
      getState: store.getState,
      readCatalog: async () => ({ ok: true, value: catalog }),
      activateSlot: async () => ({ ok: true, value: catalog }),
      createSlot: async () => ({ ok: true, value: catalog }),
      importSlot,
      parseFileText: async () => ({
        ok: false,
        code: 'unsupported-version',
        reason: 'Unsupported version',
      }),
      validateEnvelope: async (value) => ({ ok: true, envelope: value }),
      fetchScene: async (sceneId) => scene(sceneId),
    });

    await expect(
      coordinator.importFileText('slot-2', '{"gameDataVersion":99}'),
    ).resolves.toEqual({
      ok: false,
      reason: 'unsupported-version',
    });
    expect(importSlot).not.toHaveBeenCalled();
    expect(store.getState().livingSaves.slots[1].state).toBe('empty');
  });
});
