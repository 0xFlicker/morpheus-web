import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sql: Object.assign(vi.fn(), { transaction: vi.fn() }),
  list: vi.fn(),
  del: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./database', () => ({ cloudDatabase: () => mocks.sql }));
vi.mock('@vercel/blob', () => ({ list: mocks.list, del: mocks.del }));
import {
  eraseCloudPlayer,
  eraseClerkAccount,
  maintainCloudData,
} from './retention';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('MORPHEUS_REPORTS_READ_WRITE_TOKEN', 'test-private-store');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cloud erasure and retention', () => {
  it('revokes player and associated guest records even while attachment storage is unavailable', async () => {
    vi.stubEnv('MORPHEUS_REPORTS_READ_WRITE_TOKEN', '');
    await eraseCloudPlayer('11111111-1111-4111-8111-111111111111');
    expect(mocks.sql).toHaveBeenCalledTimes(1);
    expect(mocks.sql.mock.calls[0][0].join('')).toContain(
      'associated_player_id',
    );
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('records a deletion fence and erases account plus linked guest data under one lock', async () => {
    await eraseClerkAccount('user_deleted');
    expect(mocks.sql.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.sql.mock.calls[0][0].join('')).toContain(
      'pg_advisory_xact_lock',
    );
    expect(mocks.sql.mock.calls[1][1]).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.sql.mock.calls[2]).toContain('user_deleted');
  });
  it('removes expired reports and old orphan attachments, preserving linked and recent uploads across pages', async () => {
    mocks.sql.transaction.mockResolvedValue([
      [{ attachment_path: 'reports/expired.json' }],
      [{ id: 'expired-player' }],
      [{ session_id: 'expired-session' }],
      [],
      [],
      [],
    ]);
    mocks.sql.mockResolvedValue([{ attachment_path: 'reports/linked.json' }]);
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    mocks.list
      .mockResolvedValueOnce({
        hasMore: true,
        cursor: 'next',
        blobs: [
          { pathname: 'reports/linked.json', uploadedAt: old },
          { pathname: 'reports/orphan.json', uploadedAt: old },
          { pathname: 'reports/in-flight.json', uploadedAt: new Date() },
        ],
      })
      .mockResolvedValueOnce({ hasMore: false, blobs: [] });
    await expect(maintainCloudData()).resolves.toEqual({
      expiredReports: 1,
      expiredPlayers: 1,
      expiredSessions: 1,
      orphanAttachments: 1,
    });
    expect(mocks.del.mock.calls.map(([paths]) => paths)).toEqual([
      ['reports/expired.json'],
      ['reports/orphan.json'],
    ]);
    expect(mocks.list.mock.calls[1][0]).toMatchObject({
      cursor: 'next',
      prefix: 'reports/',
    });
  });
  it('fails before expiring database records if private storage is not configured', async () => {
    vi.stubEnv('MORPHEUS_REPORTS_READ_WRITE_TOKEN', '');
    await expect(maintainCloudData()).rejects.toThrow('not configured');
    expect(mocks.sql.transaction).not.toHaveBeenCalled();
  });
});
