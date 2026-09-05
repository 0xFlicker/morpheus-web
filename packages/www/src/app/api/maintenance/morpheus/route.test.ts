import { afterEach, describe, expect, it, vi } from 'vitest';
const maintain = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cloud/retention', () => ({ maintainCloudData: maintain }));
import { GET } from './route';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe('daily maintenance authorization', () => {
  it('fails closed without a configured secret or the correct bearer', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(
      (
        await GET(
          new Request('https://www.soapbubble.xyz/api/maintenance/morpheus'),
        )
      ).status,
    ).toBe(401);
    vi.stubEnv('CRON_SECRET', 'correct');
    expect(
      (
        await GET(
          new Request('https://www.soapbubble.xyz/api/maintenance/morpheus', {
            headers: { authorization: 'Bearer invalid' },
          }),
        )
      ).status,
    ).toBe(401);
    expect(maintain).not.toHaveBeenCalled();
  });
  it('runs cleanup only for the configured scheduler credential', async () => {
    vi.stubEnv('CRON_SECRET', 'correct');
    maintain.mockResolvedValue({ expiredReports: 0 });
    const response = await GET(
      new Request('https://www.soapbubble.xyz/api/maintenance/morpheus', {
        headers: { authorization: 'Bearer correct' },
      }),
    );
    expect(response.status).toBe(200);
    expect(maintain).toHaveBeenCalledTimes(1);
  });
});
