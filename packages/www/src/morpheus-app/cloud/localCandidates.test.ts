import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateLivingSaveSlot,
  createLivingSaveSlot,
  deleteLivingSaveSlot,
  LIVING_SAVE_DATABASE_NAME,
  readLivingSaveCatalog,
  setLivingSaveIdentityFence,
  writeLivingSaveCheckpoint,
} from '@/morpheus-app/storage/livingSaveStorage';
import type {
  LivingSaveCatalog,
  LivingSaveResult,
  LivingSaveSessionEnvelope,
} from '@/morpheus-app/storage/livingSaveTypes';
import {
  applyCloudDownload,
  bindCloudPlayer,
  readCloudLocalSnapshot,
  resolveLocalSaveCandidate,
  switchCloudLocalIdentity,
} from './cloudStorage';
import {
  CLOUD_LOCAL_METADATA_KEY,
  MAX_LOCAL_SAVE_CANDIDATES,
} from './localMetadata';
import { localCloudConflicts } from './cloudClient';

const playerId = '10000000-0000-4000-8000-000000000001';
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
async function start(writers: string[]) {
  await switchCloudLocalIdentity('anonymous');
  await bindCloudPlayer('anonymous', playerId);
  const catalog = value(
    await createLivingSaveSlot({
      slotId: 'slot-1',
      envelope: envelope(),
      activate: true,
      expectedCatalogRevision: value(await readLivingSaveCatalog()).revision,
      writerId: writers[0],
    }),
  );
  for (const writerId of writers.slice(1))
    value(
      await activateLivingSaveSlot({
        slotId: 'slot-1',
        writerId,
        expectedCatalogRevision: catalog.revision,
        expectedSlotRevision: catalog.slots['slot-1'].revision,
      }),
    );
  return catalog;
}
const checkpoint = (writerId: string, base: LivingSaveCatalog, scene: number) =>
  writeLivingSaveCheckpoint({
    writerId,
    slotId: 'slot-1',
    envelope: envelope(scene),
    expectedCatalogRevision: base.revision,
    expectedSlotRevision: base.slots['slot-1'].revision,
  });
beforeEach(clear);
afterEach(async () => {
  setLivingSaveIdentityFence(undefined);
  await clear();
});

describe('competing local tab checkpoints', () => {
  it('rebases a slot checkpoint after another tab activates a different slot', async () => {
    const writer = crypto.randomUUID();
    const base = await start([writer]);
    const second = value(
      await createLivingSaveSlot({
        slotId: 'slot-2',
        envelope: envelope(3010),
        activate: true,
        expectedCatalogRevision: base.revision,
        writerId: crypto.randomUUID(),
      }),
    );
    const saved = value(await checkpoint(writer, base, 2010));
    expect(saved.activeSlotId).toBe('slot-2');
    expect(saved.slots['slot-2']).toEqual(second.slots['slot-2']);
    expect(localCloudConflicts(await readCloudLocalSnapshot())).toEqual([]);
    expect(saved.slots['slot-1']).toMatchObject({
      envelope: { activeSceneId: 2010 },
    });
  });

  it('keeps losing progress durable after refresh and does not mistake fresh summaries for a loaded runtime', async () => {
    const [first, second] = [crypto.randomUUID(), crypto.randomUUID()];
    const base = await start([first, second]);
    const winning = value(await checkpoint(first, base, 2010));
    // The losing runtime's UI may already have received this newer catalog revision.
    expect(await checkpoint(second, winning, 3010)).toMatchObject({
      ok: false,
      code: 'conflict',
    });
    const reloaded = await readCloudLocalSnapshot();
    expect(reloaded.metadata.slots['slot-1'].save?.envelope.activeSceneId).toBe(
      2010,
    );
    expect(reloaded.metadata.slots['slot-1'].localCandidates).toMatchObject([
      {
        writerId: second,
        save: {
          envelope: { activeSceneId: 3010 },
          discoveredSceneIds: [1010, 3010],
        },
      },
    ]);
    expect(
      await activateLivingSaveSlot({
        slotId: 'slot-1',
        writerId: crypto.randomUUID(),
        expectedCatalogRevision: reloaded.catalog.revision,
        expectedSlotRevision: reloaded.catalog.slots['slot-1'].revision,
      }),
    ).toMatchObject({ ok: false, code: 'conflict' });
    expect(
      await applyCloudDownload({
        identityKey: 'anonymous',
        playerId,
        localRevision: reloaded.catalog.slots['slot-1'].revision,
        remote: { slotId: 'slot-1', revision: 2, save: null, updatedAt: null },
      }),
    ).toBeNull();
  });

  it('preserves third-tab branches, rejects changed candidate choices, and fences every resolution', async () => {
    const writers = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    const base = await start(writers);
    value(await checkpoint(writers[0], base, 2010));
    await checkpoint(writers[1], base, 3010);
    await checkpoint(writers[2], base, 4010);
    const shown = await readCloudLocalSnapshot();
    const candidate = shown.metadata.slots['slot-1'].localCandidates[0];
    await checkpoint(writers[1], base, 5010);
    const choice = {
      identityKey: 'anonymous',
      slotId: 'slot-1' as const,
      localRevision: shown.catalog.slots['slot-1'].revision,
      candidateId: candidate.candidateId,
      keepCandidate: true,
    };
    expect(await resolveLocalSaveCandidate(choice)).toBeNull();
    const current = await readCloudLocalSnapshot();
    const updated = current.metadata.slots['slot-1'].localCandidates.find(
      (entry) => entry.writerId === writers[1],
    );
    if (!updated) throw new Error('Lost updated branch');
    const resolved = await resolveLocalSaveCandidate({
      ...choice,
      candidateId: updated.candidateId,
    });
    expect(
      resolved?.metadata.slots['slot-1'].save?.envelope.activeSceneId,
    ).toBe(5010);
    expect(resolved?.metadata.slots['slot-1'].localCandidates).toMatchObject([
      { writerId: writers[2], save: { envelope: { activeSceneId: 4010 } } },
    ]);
    const third = current.metadata.slots['slot-1'].localCandidates.find(
      (entry) => entry.writerId === writers[2],
    );
    if (!resolved || !third) throw new Error('Lost third branch');
    expect(
      await resolveLocalSaveCandidate({
        ...choice,
        candidateId: third.candidateId,
      }),
    ).toBeNull();
    const kept = await resolveLocalSaveCandidate({
      ...choice,
      localRevision: resolved.catalog.slots['slot-1'].revision,
      candidateId: third.candidateId,
      keepCandidate: false,
    });
    expect(kept?.catalog.revision).toBeGreaterThan(resolved.catalog.revision);
    expect(kept?.metadata.slots['slot-1'].localCandidates).toEqual([]);
    expect(kept?.metadata.slots['slot-1'].save?.envelope.activeSceneId).toBe(
      5010,
    );
  });

  it('does not prompt when the losing tab made no game progress', async () => {
    const writers = [crypto.randomUUID(), crypto.randomUUID()];
    const base = await start(writers);
    value(await checkpoint(writers[0], base, 2010));
    expect(await checkpoint(writers[1], base, 1010)).toMatchObject({
      ok: false,
      code: 'conflict',
    });
    expect(localCloudConflicts(await readCloudLocalSnapshot())).toEqual([]);
  });

  it('keeps a progressed tab recoverable when another tab deletes its slot', async () => {
    const writer = crypto.randomUUID();
    const base = await start([writer]);
    value(
      await deleteLivingSaveSlot({
        slotId: 'slot-1',
        expectedCatalogRevision: base.revision,
        expectedSlotRevision: base.slots['slot-1'].revision,
      }),
    );
    expect(await checkpoint(writer, base, 2010)).toMatchObject({
      ok: false,
      code: 'conflict',
    });
    const snapshot = await readCloudLocalSnapshot();
    expect(snapshot.catalog.slots['slot-1'].kind).toBe('empty');
    expect(
      snapshot.metadata.slots['slot-1'].localCandidates[0].save.envelope
        .activeSceneId,
    ).toBe(2010);
  });

  it('bounds storage without replacing another writer when the limit is reached', async () => {
    const writers = Array.from({ length: MAX_LOCAL_SAVE_CANDIDATES + 2 }, () =>
      crypto.randomUUID(),
    );
    const base = await start(writers);
    value(await checkpoint(writers[0], base, 2010));
    for (const [index, writer] of writers.slice(1, -1).entries())
      await checkpoint(writer, base, 3000 + index);
    const before = await readCloudLocalSnapshot();
    expect(before.metadata.slots['slot-1'].localCandidates).toHaveLength(
      MAX_LOCAL_SAVE_CANDIDATES,
    );
    expect(await checkpoint(writers.at(-1)!, base, 9000)).toMatchObject({
      ok: false,
      code: 'unavailable-storage',
    });
    expect(
      (await readCloudLocalSnapshot()).metadata.slots['slot-1'].localCandidates,
    ).toEqual(before.metadata.slots['slot-1'].localCandidates);
  });
  it('does not claim a durable conflict if the candidate transaction aborts', async () => {
    const writers = [crypto.randomUUID(), crypto.randomUUID()];
    const base = await start(writers);
    value(await checkpoint(writers[0], base, 2010));
    const originalPut = IDBObjectStore.prototype.put;
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore['put']>
      ) {
        const request = originalPut.apply(this, args);
        if (args[1] === CLOUD_LOCAL_METADATA_KEY) {
          // Simulate a transaction-level failure after the write was queued.
          request.addEventListener('success', () => this.transaction.abort());
        }
        return request;
      });
    try {
      expect(await checkpoint(writers[1], base, 3010)).toMatchObject({
        ok: false,
        code: 'unavailable-storage',
      });
    } finally {
      put.mockRestore();
    }
    const snapshot = await readCloudLocalSnapshot();
    expect(snapshot.metadata.slots['slot-1'].localCandidates).toEqual([]);
    expect(snapshot.metadata.slots['slot-1'].save?.envelope.activeSceneId).toBe(
      2010,
    );
  });

  it('moves all retained guest versions into the associated account without replacing its saved journey', async () => {
    const writers = [crypto.randomUUID(), crypto.randomUUID()];
    const base = await start(writers);
    value(await checkpoint(writers[0], base, 2010));
    await checkpoint(writers[1], base, 3010);
    const account = await switchCloudLocalIdentity('user-a');
    value(
      await createLivingSaveSlot({
        slotId: 'slot-1',
        envelope: envelope(6010),
        expectedCatalogRevision: account.catalog.revision,
        activate: true,
        writerId: crypto.randomUUID(),
      }),
    );
    await bindCloudPlayer(
      'user-a',
      '10000000-0000-4000-8000-000000000002',
      playerId,
    );
    const associated = await readCloudLocalSnapshot();
    const slot = associated.metadata.slots['slot-1'];
    expect(slot.save?.envelope.activeSceneId).toBe(6010);
    expect(slot.guestSave?.envelope.activeSceneId).toBe(2010);
    expect(slot.localCandidates).toMatchObject([
      { writerId: writers[1], save: { envelope: { activeSceneId: 3010 } } },
    ]);
    const resolved = await resolveLocalSaveCandidate({
      identityKey: 'user-a',
      slotId: 'slot-1',
      localRevision: associated.catalog.slots['slot-1'].revision,
      candidateId: slot.localCandidates[0].candidateId,
      keepCandidate: false,
    });
    if (!resolved) throw new Error('Expected retained guest choice');
    expect(localCloudConflicts(resolved)).toMatchObject([
      { kind: 'guest', guest: { envelope: { activeSceneId: 2010 } } },
    ]);
    const guestArchive = await switchCloudLocalIdentity('anonymous');
    expect(guestArchive.metadata.slots['slot-1'].localCandidates).toEqual([]);
    expect(guestArchive.catalog.slots['slot-1'].kind).toBe('empty');
  });
  it('updates the retained candidate camera without creating or replacing its progress choice', async () => {
    const writers = [crypto.randomUUID(), crypto.randomUUID()];
    const base = await start(writers);
    value(await checkpoint(writers[0], base, 2010));
    await checkpoint(writers[1], base, 3010);
    const before = await readCloudLocalSnapshot();
    const candidate = before.metadata.slots['slot-1'].localCandidates[0];
    expect(
      await writeLivingSaveCheckpoint({
        slotId: 'slot-1',
        writerId: writers[1],
        envelope: {
          ...candidate.save.envelope,
          rotation: { yaw3600: 950, pitch: 20 },
        },
        expectedCatalogRevision: base.revision,
        expectedSlotRevision: base.slots['slot-1'].revision,
      }),
    ).toMatchObject({ ok: false, code: 'conflict', checkpointRetained: true });
    const after = await readCloudLocalSnapshot();
    expect(after.metadata.slots['slot-1'].localCandidates).toHaveLength(1);
    expect(after.metadata.slots['slot-1'].localCandidates[0].candidateId).toBe(
      candidate.candidateId,
    );
    expect(
      after.metadata.slots['slot-1'].localCandidates[0].save.envelope.rotation,
    ).toEqual({ yaw3600: 950, pitch: 20 });
  });
});
