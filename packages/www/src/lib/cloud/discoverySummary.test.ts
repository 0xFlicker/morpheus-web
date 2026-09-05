import { beforeEach, describe, expect, it, vi } from 'vitest';
const sql = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('./database', () => ({ cloudDatabase: () => sql }));
import { discoverySummary } from './discoverySummary';
import type { CloudSave } from './protocol';
const save: CloudSave = {
  source: 'played',
  runId: '11111111-1111-4111-8111-111111111111',
  discoveredSceneIds: [1050, 895065],
  envelope: {
    format: 'morpheus-living-save-session',
    schemaVersion: 1,
    gameDataVersion: 1,
    activeSceneId: 1050,
    returnSceneId: null,
    gamestateValues: {},
    savedAt: 1,
    resumePointId: 'test',
    rotation: { yaw3600: 0, pitch: 0 },
  },
};
beforeEach(() => vi.resetAllMocks());
describe('production discovery summary', () => {
  it('does not query cohorts for incomplete or imported journeys', async () => {
    expect((await discoverySummary('self', null)).comparison).toMatchObject({
      reason: 'not-completed',
    });
    expect(
      (await discoverySummary('self', { ...save, source: 'imported' }))
        .comparison,
    ).toMatchObject({ reason: 'imported' });
    expect(sql).not.toHaveBeenCalled();
  });
  it('requires twenty distinct other completed players before returning an aggregate', async () => {
    sql.mockResolvedValueOnce([{ players: '19', average: '2' }]);
    expect((await discoverySummary('self', save)).comparison).toEqual({
      status: 'unavailable',
      reason: 'small-cohort',
    });
    sql.mockResolvedValueOnce([{ players: '20', average: '2' }]);
    expect((await discoverySummary('self', save)).comparison).toEqual({
      status: 'available',
      cohortLabel: 'Other players’ best currently saved completed playthroughs',
      otherPlayerCount: 20,
      playerPercent: 0.8,
      averagePercent: 0.8,
      verified: false,
    });
  });
});
