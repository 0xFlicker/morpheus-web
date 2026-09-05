import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireCloudAdmin: vi.fn(),
  listCloudReports: vi.fn(),
  listCloudSessions: vi.fn(),
  listCloudSaveDiagnostics: vi.fn(),
  readCloudReportAttachment: vi.fn(),
}));
vi.mock('@/lib/cloud/identity', () => ({
  requireCloudAdmin: mocks.requireCloudAdmin,
}));
vi.mock('@/lib/cloud/reports', () => ({
  ...mocks,
  parseAdminPagination: () => ({ limit: 25, offset: 0 }),
}));

import { CloudHttpError } from '@/lib/cloud/http';
import { GET as reports } from './reports/route';
import { GET as sessions } from './sessions/route';
import { GET as saves } from './saves/route';
import { GET as attachment } from './reports/[reportId]/attachment/route';

const handlers = [
  ['reports', reports],
  ['sessions', sessions],
  ['saves', saves],
  [
    'attachments',
    (request: Request) =>
      attachment(request, {
        params: Promise.resolve({
          reportId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
  ],
] as const;

describe('independent admin API authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  for (const [name, handler] of handlers) {
    for (const status of [401, 403]) {
      it(`${name} rejects ${status === 401 ? 'signed-out' : 'ordinary'} users before reading data`, async () => {
        mocks.requireCloudAdmin.mockRejectedValueOnce(
          new CloudHttpError(status, 'Access denied'),
        );
        const response = await handler(
          new Request('https://www.soapbubble.xyz/api/cloud/admin/reports'),
        );
        expect(response.status).toBe(status);
        expect(mocks.listCloudReports).not.toHaveBeenCalled();
        expect(mocks.listCloudSessions).not.toHaveBeenCalled();
        expect(mocks.listCloudSaveDiagnostics).not.toHaveBeenCalled();
        expect(mocks.readCloudReportAttachment).not.toHaveBeenCalled();
      });
    }
  }
  it('returns reports only after admin authorization, without cacheable responses', async () => {
    mocks.listCloudReports.mockResolvedValueOnce({
      items: [],
      nextOffset: null,
    });
    const response = await reports(
      new Request('https://www.soapbubble.xyz/api/cloud/admin/reports'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.requireCloudAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.listCloudReports).toHaveBeenCalledTimes(1);
  });
});
