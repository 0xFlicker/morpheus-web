import { describe, expect, it } from 'vitest';
import { fetchInitial } from '@soapbubble/morpheus-client/service/gameState';

import {
  cloudSaveSchema,
  isUnplayedCloudSave,
  cloudProgressKey,
  cloudWriteSchema,
  reconcileCloudSlot,
  type CloudSave,
  type CloudSlot,
} from './protocol';

const save: CloudSave = {
  runId: 'aabe5147-a9f8-46bb-a86c-0dbcb56001f7',
  envelope: {
    format: 'morpheus-living-save-session',
    schemaVersion: 1,
    gameDataVersion: 1,
    resumePointId: 'checkpoint',
    savedAt: 1000,
    gamestateValues: { 1: 0 },
    activeSceneId: 2000,
    returnSceneId: null,
    rotation: { yaw3600: 1500, pitch: 0 },
  },
  discoveredSceneIds: [2000],
  source: 'played',
};
const slot = (value: CloudSave | null, revision = 1): CloudSlot => ({
  slotId: 'slot-1',
  revision,
  save: value,
  updatedAt: '2026-09-05T00:00:00.000Z',
});
const progressed = {
  ...save,
  envelope: { ...save.envelope, activeSceneId: 2010 },
  discoveredSceneIds: [2000, 2010],
};

describe('cloud save reconciliation', () => {
  it('downloads onto a fresh device and uploads an existing local game to a new cloud slot', () => {
    expect(
      reconcileCloudSlot({
        local: null,
        acknowledgedProgress: null,
        acknowledgedRevision: null,
        remote: slot(save),
      }),
    ).toBe('download');
    expect(
      reconcileCloudSlot({
        local: save,
        acknowledgedProgress: null,
        acknowledgedRevision: null,
        remote: slot(null, 0),
      }),
    ).toBe('upload');
  });

  it('quietly adopts remote progress if this device has not progressed', () => {
    expect(
      reconcileCloudSlot({
        local: save,
        acknowledgedProgress: cloudProgressKey(save),
        acknowledgedRevision: 1,
        remote: slot(progressed, 2),
      }),
    ).toBe('download');
  });

  it('uploads offline progress when the cloud has not changed', () => {
    expect(
      reconcileCloudSlot({
        local: progressed,
        acknowledgedProgress: cloudProgressKey(save),
        acknowledgedRevision: 1,
        remote: slot(save),
      }),
    ).toBe('upload');
  });

  it('preserves competing offline progress even when one clock claims a later time', () => {
    const other = {
      ...progressed,
      envelope: {
        ...progressed.envelope,
        activeSceneId: 2020,
        savedAt: 9999999,
      },
    };
    expect(
      reconcileCloudSlot({
        local: progressed,
        acknowledgedProgress: cloudProgressKey(save),
        acknowledgedRevision: 1,
        remote: slot(other, 2),
      }),
    ).toBe('conflict');
  });

  it('ignores camera movement, checkpoint IDs, clocks and duplicate discovery order', () => {
    const equivalent = {
      ...save,
      discoveredSceneIds: [2000, 2000],
      envelope: {
        ...save.envelope,
        savedAt: 8888,
        resumePointId: 'another',
        rotation: { yaw3600: 30, pitch: 1 },
      },
    };
    expect(cloudProgressKey(equivalent)).toBe(cloudProgressKey(save));
    expect(cloudProgressKey({ ...save, runId: save.runId.toUpperCase() })).toBe(
      cloudProgressKey(save),
    );
    expect(
      reconcileCloudSlot({
        local: equivalent,
        acknowledgedProgress: null,
        acknowledgedRevision: null,
        remote: slot(save),
      }),
    ).toBe('unchanged');
  });

  it('propagates deletions only with an acknowledgment, and conflicts with offline updates', () => {
    expect(
      reconcileCloudSlot({
        local: null,
        acknowledgedProgress: cloudProgressKey(save),
        acknowledgedRevision: 1,
        remote: slot(save),
      }),
    ).toBe('upload');
    expect(
      reconcileCloudSlot({
        local: progressed,
        acknowledgedProgress: cloudProgressKey(save),
        acknowledgedRevision: 1,
        remote: slot(null, 2),
      }),
    ).toBe('conflict');
    expect(
      reconcileCloudSlot({
        local: save,
        acknowledgedProgress: null,
        acknowledgedRevision: null,
        remote: slot(null, 2),
      }),
    ).toBe('conflict');
  });

  it('does not silently combine different playthroughs or imported evidence', () => {
    expect(cloudProgressKey({ ...save, source: 'imported' })).not.toBe(
      cloudProgressKey(save),
    );
    expect(
      reconcileCloudSlot({
        local: save,
        acknowledgedProgress: null,
        acknowledgedRevision: null,
        remote: slot(progressed),
      }),
    ).toBe('conflict');
  });

  it('adopts actual cloud progress when a blank slot was created before the first download', () => {
    const blank = {
      ...save,
      envelope: {
        ...save.envelope,
        gamestateValues: Object.fromEntries(
          fetchInitial().map((state) => [state.stateId, state.value]),
        ),
      },
    };
    expect(
      reconcileCloudSlot({
        local: blank,
        acknowledgedProgress: null,
        acknowledgedRevision: null,
        remote: slot(progressed),
      }),
    ).toBe('download');
    expect(
      reconcileCloudSlot({
        local: progressed,
        acknowledgedProgress: null,
        acknowledgedRevision: null,
        remote: slot(blank),
      }),
    ).toBe('upload');
    expect(
      reconcileCloudSlot({
        local: { ...blank, source: 'imported' },
        acknowledgedProgress: null,
        acknowledgedRevision: null,
        remote: slot(progressed),
      }),
    ).toBe('conflict');
  });
});

describe('cloud wire validation', () => {
  const request = {
    protocolVersion: 1,
    slotId: 'slot-1',
    expectedRevision: 0,
    mutationId: '90c9ecf8-1b09-4509-a1d1-c5c78c7cc938',
    deviceId: '8a314456-a9ea-4c66-9b99-67dcad43b7a4',
    save,
  };
  it('accepts the existing Swift/web envelope and rejects client ownership or scores', () => {
    expect(cloudWriteSchema.safeParse(request).success).toBe(true);
    expect(
      cloudWriteSchema.safeParse({ ...request, playerId: 'someone-else' })
        .success,
    ).toBe(false);
    expect(
      cloudWriteSchema.safeParse({
        ...request,
        save: { ...save, completion: 100 },
      }).success,
    ).toBe(false);
  });
  it('rejects unsafe revisions and malformed saves', () => {
    expect(
      cloudWriteSchema.safeParse({ ...request, expectedRevision: 2 ** 53 })
        .success,
    ).toBe(false);
    expect(
      cloudWriteSchema.safeParse({
        ...request,
        save: { ...save, envelope: {} },
      }).success,
    ).toBe(false);
  });
});

describe('discovery evidence persistence', () => {
  it('preserves old raw evidence without inventing visibility observations', () => {
    const parsed = cloudSaveSchema.parse(save);
    expect(parsed.discoveredSceneIds).toEqual([2000]);
    expect(parsed.observedDiscoveryIds).toBeUndefined();
    expect(cloudProgressKey(parsed)).toBe(
      cloudProgressKey({ ...parsed, observedDiscoveryIds: [] }),
    );
    // Existing acknowledged progress keys must not change merely by installing the new catalog.
    expect(JSON.parse(cloudProgressKey(parsed))).not.toHaveProperty(
      'observedDiscoveryIds',
    );
  });
  it('round trips and normalizes observations while keeping journey identity and raw evidence', () => {
    const parsed = cloudSaveSchema.parse({
      ...save,
      observedDiscoveryIds: ['view-8000', 'view-2000', 'view-8000'],
    });
    expect(parsed.observedDiscoveryIds).toEqual(['view-2000', 'view-8000']);
    expect(cloudSaveSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(
      parsed,
    );
    expect(parsed.runId).toBe(save.runId);
    expect(parsed.discoveredSceneIds).toEqual(save.discoveredSceneIds);
    expect(cloudProgressKey(parsed)).not.toBe(cloudProgressKey(save));
    expect(
      cloudSaveSchema.safeParse({ ...save, observedDiscoveryIds: ['invented'] })
        .success,
    ).toBe(false);
  });
  it('does not treat a journey with additional discovered content as an unplayed slot', () => {
    const blank = {
      ...save,
      envelope: {
        ...save.envelope,
        gamestateValues: Object.fromEntries(
          fetchInitial().map((state) => [state.stateId, state.value]),
        ),
      },
    };
    expect(
      isUnplayedCloudSave({ ...blank, observedDiscoveryIds: ['view-2000'] }),
    ).toBe(true);
    expect(
      isUnplayedCloudSave({ ...blank, observedDiscoveryIds: ['view-8000'] }),
    ).toBe(false);
  });
});
