import { afterEach, describe, expect, it, vi } from 'vitest';
const maintain = vi.hoisted(() => vi.fn());
const maintainApple = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cloud/retention', () => ({ maintainCloudData: maintain }));
vi.mock('@/lib/cloud/appleAccount', () => ({ maintainAppleAccounts: maintainApple }));
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
    expect(maintainApple).not.toHaveBeenCalled();
  });
  it('runs cleanup only for the configured scheduler credential', async () => {
    vi.stubEnv('CRON_SECRET', 'correct');
    maintain.mockResolvedValue({ expiredReports: 0 });
    maintainApple.mockResolvedValue({ pendingAccountsAttempted: 0, appleRevocationsAttempted: 0 });
    const response = await GET(
      new Request('https://www.soapbubble.xyz/api/maintenance/morpheus', {
        headers: { authorization: 'Bearer correct' },
      }),
    );
    expect(response.status).toBe(200);
    expect(maintain).toHaveBeenCalledTimes(1);
    expect(maintainApple).toHaveBeenCalledTimes(1);
    expect(maintainApple.mock.invocationCallOrder[0]).toBeLessThan(maintain.mock.invocationCallOrder[0]);
    expect(await response.json()).toEqual({ expiredReports: 0,
      apple: { pendingAccountsAttempted: 0, appleRevocationsAttempted: 0 } });
  });
  it('does not expire deletion fences when account maintenance fails', async () => {
    vi.stubEnv('CRON_SECRET', 'correct');
    maintainApple.mockRejectedValue(new Error('Database unavailable'));
    const response = await GET(new Request('https://www.soapbubble.xyz/api/maintenance/morpheus', {
      headers: { authorization: 'Bearer correct' },
    }));
    expect(response.status).toBe(503);
    expect(maintain).not.toHaveBeenCalled();
  });
});
