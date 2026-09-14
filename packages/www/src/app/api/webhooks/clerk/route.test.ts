import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  handleAppleClerkDeletion: vi.fn(),
}));
vi.mock('@clerk/nextjs/webhooks', () => mocks);
vi.mock('@/lib/cloud/appleAccount', () => mocks);
import { POST } from './route';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', 'test-secret');
});
afterEach(() => vi.unstubAllEnvs());
const request = (body = '{ "signed": true }') =>
  new Request('https://www.soapbubble.xyz/api/webhooks/clerk', {
    method: 'POST',
    body,
  });
describe('Clerk account deletion webhook', () => {
  it('preserves signed bytes and deletes only the verified event account', async () => {
    mocks.verifyWebhook.mockImplementation(async (value: Request) => {
      expect(await value.text()).toBe('{ "signed": true }');
      return { type: 'user.deleted', data: { id: 'user_deleted' } };
    });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.handleAppleClerkDeletion).toHaveBeenCalledWith('user_deleted');
  });
  it('rejects forged and oversized payloads without erasing accounts', async () => {
    mocks.verifyWebhook.mockRejectedValue(new Error('Bad signature'));
    expect((await POST(request())).status).toBe(400);
    expect((await POST(request('x'.repeat(256 * 1024 + 1)))).status).toBe(413);
    expect(mocks.handleAppleClerkDeletion).not.toHaveBeenCalled();
  });
  it('returns a retryable failure when deletion fails and acknowledges unrelated verified events', async () => {
    mocks.verifyWebhook.mockResolvedValue({
      type: 'user.deleted',
      data: { id: 'user_deleted' },
    });
    mocks.handleAppleClerkDeletion.mockRejectedValue(
      new Error('Database unavailable'),
    );
    expect((await POST(request())).status).toBe(503);
    mocks.verifyWebhook.mockResolvedValue({
      type: 'user.updated',
      data: { id: 'user_updated' },
    });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.handleAppleClerkDeletion).toHaveBeenCalledTimes(1);
  });
});
