import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { cloudProgressKey, type CloudSlot } from '@/lib/cloud/protocol';
import {
  createLivingSaveSlot,
  deleteLivingSaveSlot,
  undoLivingSaveDeletion,
  writeLivingSaveCheckpoint,
  LIVING_SAVE_DATABASE_NAME,
  readLivingSaveCatalog,
  setLivingSaveIdentityFence,
} from '@/morpheus-app/storage/livingSaveStorage';
import type {
  LivingSaveResult,
  LivingSaveSessionEnvelope,
} from '@/morpheus-app/storage/livingSaveTypes';
import {
  acknowledgeCloudSlot,
  applyCloudDownload,
  bindCloudPlayer,
  prepareCloudWrite,
  readCloudLocalSnapshot,
  resolveGuestSave,
  switchCloudLocalIdentity,
} from './cloudStorage';

const playerId = '10000000-0000-4000-8000-000000000001';
const otherPlayerId = '10000000-0000-4000-8000-000000000002';
const envelope = (scene = 1010): LivingSaveSessionEnvelope => ({
  format: 'morpheus-living-save-session',
  schemaVersion: 1,
  gameDataVersion: 1,
  resumePointId: crypto.randomUUID(),
  savedAt: 1700000000000,
  gamestateValues: { 100: 2 },
  activeSceneId: scene,
  returnSceneId: null,
  rotation: { yaw3600: 100, pitch: 0 },
});
const value = <T>(result: LivingSaveResult<T>): T => {
  if (!result.ok) throw new Error(result.code);
  return result.value;
};
const clear = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LIVING_SAVE_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database still open'));
  });
async function create() {
  const catalog = value(await readLivingSaveCatalog());
  return value(
    await createLivingSaveSlot({
      slotId: 'slot-1',
      envelope: envelope(),
      expectedCatalogRevision: catalog.revision,
      activate: true,
    }),
  );
}
async function setup() {
  await switchCloudLocalIdentity('anonymous');
  await bindCloudPlayer('anonymous', playerId);
  return create();
}

describe('durable browser cloud storage', () => {
  beforeEach(clear);
  afterEach(async () => {
    setLivingSaveIdentityFence(undefined);
    await clear();
  });

  it('rejects an old tab writing into a different account even with current catalog revisions', async () => {
    await setup();
    setLivingSaveIdentityFence('anonymous');
    const other = await switchCloudLocalIdentity('user-b');
    const result = await createLivingSaveSlot({
      slotId: 'slot-1',
      envelope: envelope(),
      expectedCatalogRevision: other.catalog.revision,
      activate: true,
    });
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    expect((await readCloudLocalSnapshot()).catalog.slots['slot-1'].kind).toBe(
      'empty',
    );
  });

  it('checkpoints discovery and run identity atomically, and retries the exact persisted mutation', async () => {
    const catalog = await setup();
    const before = await readCloudLocalSnapshot();
    const pending = await prepareCloudWrite({
      identityKey: 'anonymous',
      playerId,
      slotId: 'slot-1',
      localRevision: catalog.slots['slot-1'].revision,
      expectedRevision: 0,
    });
    expect(pending).not.toBeNull();
    const updated = value(
      await writeLivingSaveCheckpoint({
        slotId: 'slot-1',
        envelope: envelope(2010),
        expectedCatalogRevision: catalog.revision,
        expectedSlotRevision: catalog.slots['slot-1'].revision,
      }),
    );
    const retried = await prepareCloudWrite({
      identityKey: 'anonymous',
      playerId,
      slotId: 'slot-1',
      localRevision: updated.slots['slot-1'].revision,
      expectedRevision: 0,
    });
    expect(retried).toEqual(pending);
    const latest = await readCloudLocalSnapshot();
    expect(latest.metadata.slots['slot-1'].save?.runId).toBe(
      before.metadata.slots['slot-1'].save?.runId,
    );
    expect(latest.metadata.slots['slot-1'].save?.discoveredSceneIds).toEqual([
      1010, 2010,
    ]);
    if (!pending) throw new Error('Missing mutation');
    await acknowledgeCloudSlot({
      identityKey: 'anonymous',
      playerId,
      mutationId: pending.mutationId,
      remote: {
        slotId: 'slot-1',
        revision: 1,
        save: pending.save,
        updatedAt: null,
      },
    });
    const acked = await readCloudLocalSnapshot();
    expect(acked.metadata.slots['slot-1'].pending).toBeNull();
    expect(acked.metadata.slots['slot-1'].acknowledgedProgress).not.toBe(
      cloudProgressKey(acked.metadata.slots['slot-1'].save),
    );
  });

  it('rejects a download if local progress changed while the request was running', async () => {
    const catalog = await setup();
    value(
      await writeLivingSaveCheckpoint({
        slotId: 'slot-1',
        envelope: envelope(2010),
        expectedCatalogRevision: catalog.revision,
        expectedSlotRevision: catalog.slots['slot-1'].revision,
      }),
    );
    const applied = await applyCloudDownload({
      identityKey: 'anonymous',
      playerId,
      localRevision: catalog.slots['slot-1'].revision,
      remote: { slotId: 'slot-1', revision: 2, save: null, updatedAt: null },
    });
    expect(applied).toBeNull();
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.envelope
        .activeSceneId,
    ).toBe(2010);
  });

  it('archives account catalogs and rejects old-account responses after switching', async () => {
    const catalog = await setup();
    const old = await readCloudLocalSnapshot();
    await switchCloudLocalIdentity('user-b');
    await bindCloudPlayer('user-b', otherPlayerId);
    expect((await readCloudLocalSnapshot()).catalog.slots['slot-1'].kind).toBe(
      'empty',
    );
    const remote: CloudSlot = {
      slotId: 'slot-1',
      revision: 1,
      save: old.metadata.slots['slot-1'].save,
      updatedAt: null,
    };
    expect(
      await applyCloudDownload({
        identityKey: 'anonymous',
        playerId,
        localRevision: catalog.slots['slot-1'].revision,
        remote,
      }),
    ).toBeNull();
    expect(
      await acknowledgeCloudSlot({
        identityKey: 'anonymous',
        playerId,
        remote,
      }),
    ).toBe(false);
    const restored = await switchCloudLocalIdentity('anonymous');
    expect(restored.metadata.slots['slot-1'].save).toEqual(
      old.metadata.slots['slot-1'].save,
    );
  });

  it('keeps deletion durable and Undo advances revisions while restoring the same run', async () => {
    const catalog = await setup();
    const original = await readCloudLocalSnapshot();
    const deleted = value(
      await deleteLivingSaveSlot({
        slotId: 'slot-1',
        expectedCatalogRevision: catalog.revision,
        expectedSlotRevision: catalog.slots['slot-1'].revision,
        now: 100,
      }),
    );
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save,
    ).toBeNull();
    const restored = value(
      await undoLivingSaveDeletion({
        slotId: 'slot-1',
        expectedCatalogRevision: deleted.revision,
        expectedSlotRevision: deleted.slots['slot-1'].revision,
        now: 101,
      }),
    );
    expect(restored.slots['slot-1'].revision).toBeGreaterThan(
      deleted.slots['slot-1'].revision,
    );
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.runId,
    ).toBe(original.metadata.slots['slot-1'].save?.runId);
  });

  it('adopts associated guest progress once and keeps it out of unrelated accounts', async () => {
    await setup();
    const guest = await readCloudLocalSnapshot();
    await switchCloudLocalIdentity('user-a');
    await bindCloudPlayer('user-a', otherPlayerId, playerId);
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.runId,
    ).toBe(guest.metadata.slots['slot-1'].save?.runId);
    await switchCloudLocalIdentity('user-b');
    await bindCloudPlayer('user-b', crypto.randomUUID());
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save,
    ).toBeNull();
  });

  it('preserves competing account and guest local progress for an explicit choice', async () => {
    await switchCloudLocalIdentity('user-a');
    await bindCloudPlayer('user-a', otherPlayerId);
    await create();
    const account = await readCloudLocalSnapshot();
    await switchCloudLocalIdentity('anonymous');
    await bindCloudPlayer('anonymous', playerId);
    await create();
    const guest = await readCloudLocalSnapshot();
    await switchCloudLocalIdentity('user-a');
    await bindCloudPlayer('user-a', otherPlayerId, playerId);
    const conflicted = await readCloudLocalSnapshot();
    expect(conflicted.metadata.slots['slot-1'].save?.runId).toBe(
      account.metadata.slots['slot-1'].save?.runId,
    );
    expect(conflicted.metadata.slots['slot-1'].guestSave?.runId).toBe(
      guest.metadata.slots['slot-1'].save?.runId,
    );
    await resolveGuestSave({
      identityKey: 'user-a',
      slotId: 'slot-1',
      localRevision: conflicted.catalog.slots['slot-1'].revision,
      keepGuest: true,
    });
    const resolved = await readCloudLocalSnapshot();
    expect(resolved.metadata.slots['slot-1'].save?.runId).toBe(
      guest.metadata.slots['slot-1'].save?.runId,
    );
    expect(resolved.metadata.slots['slot-1'].guestSave).toBeNull();
  });
  it('keeps the canonical view from a stale equivalent ACK without overwriting a later local camera move', async () => {
    const catalog = await setup();
    const pending = await prepareCloudWrite({
      identityKey: 'anonymous',
      playerId,
      slotId: 'slot-1',
      localRevision: catalog.slots['slot-1'].revision,
      expectedRevision: 0,
    });
    if (!pending?.save) throw new Error('Missing pending save');
    const remote: CloudSlot = {
      slotId: 'slot-1',
      revision: 2,
      updatedAt: null,
      save: {
        ...pending.save,
        envelope: {
          ...pending.save.envelope,
          rotation: { yaw3600: 700, pitch: 20 },
        },
      },
    };
    await acknowledgeCloudSlot({
      identityKey: 'anonymous',
      playerId,
      remote,
      mutationId: pending.mutationId,
    });
    const accepted = await readCloudLocalSnapshot();
    expect(accepted.metadata.slots['slot-1'].save?.envelope.rotation).toEqual({
      yaw3600: 700,
      pitch: 20,
    });
    expect(accepted.catalog.slots['slot-1']).toMatchObject({
      envelope: { rotation: { yaw3600: 700, pitch: 20 } },
    });
    const retried = await prepareCloudWrite({
      identityKey: 'anonymous',
      playerId,
      slotId: 'slot-1',
      localRevision: accepted.catalog.slots['slot-1'].revision,
      expectedRevision: 2,
    });
    if (!retried?.save) throw new Error('Missing later write');
    value(
      await writeLivingSaveCheckpoint({
        slotId: 'slot-1',
        envelope: {
          ...retried.save.envelope,
          rotation: { yaw3600: 900, pitch: 10 },
        },
        expectedCatalogRevision: accepted.catalog.revision,
        expectedSlotRevision: accepted.catalog.slots['slot-1'].revision,
      }),
    );
    await acknowledgeCloudSlot({
      identityKey: 'anonymous',
      playerId,
      mutationId: retried.mutationId,
      remote: { ...remote, revision: 3 },
    });
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].save?.envelope
        .rotation,
    ).toEqual({ yaw3600: 900, pitch: 10 });
  });
});
