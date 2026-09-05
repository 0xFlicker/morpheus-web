import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requireCloudPlayer: vi.fn(),
  eraseCloudPlayer: vi.fn(),
}));
vi.mock('@/lib/cloud/identity', () => mocks);
vi.mock('@/lib/cloud/retention', () => mocks);
import { DELETE } from './route';
import { CloudHttpError } from '@/lib/cloud/http';
beforeEach(() => vi.resetAllMocks());
describe('online data deletion', () => {
  it('erases only the verified identity and clears the anonymous browser credential', async () => {
    mocks.requireCloudPlayer.mockResolvedValue({ id: 'verified-player' });
    const response = await DELETE(
      new Request('https://www.soapbubble.xyz/api/cloud/erase', {
        method: 'DELETE',
      }),
    );
    expect(mocks.eraseCloudPlayer).toHaveBeenCalledWith('verified-player');
    expect(await response.json()).toEqual({ erased: true });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('rejects cross-origin and stale identity before deleting records', async () => {
    const foreign = new Request('https://www.soapbubble.xyz/api/cloud/erase', {
      method: 'DELETE',
      headers: { origin: 'https://attacker.test' },
    });
    expect((await DELETE(foreign)).status).toBe(403);
    mocks.requireCloudPlayer.mockRejectedValue(
      new CloudHttpError(409, 'Account changed'),
    );
    expect(
      (
        await DELETE(
          new Request('https://www.soapbubble.xyz/api/cloud/erase', {
            method: 'DELETE',
          }),
        )
      ).status,
    ).toBe(409);
    expect(mocks.eraseCloudPlayer).not.toHaveBeenCalled();
  });
});
