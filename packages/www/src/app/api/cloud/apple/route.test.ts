import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/cloud/appleGrant', () => ({
  saveAppleAuthorization: mocks.save,
}));
import { POST } from './route';
const body = {
  protocolVersion: 1,
  identityToken: 'apple-id-token',
  authorizationCode: 'one-use-code',
  appleUserId: 'apple-person',
};
function request(identity = 'user_A', value = body) {
  return new Request('https://soapbubble.xyz/api/cloud/apple', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-morpheus-identity': identity,
    },
    body: JSON.stringify(value),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: 'user_A' });
});
describe('native Apple grant route', () => {
  it('passes the preserved code and identity token only with verified captured Clerk ownership', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith('user_A', body);
  });
  it('rejects anonymous and changed-account requests', async () => {
    expect((await POST(request('user_B'))).status).toBe(409);
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('rejects an unbounded identity token before any provider request', async () => {
    const response = await POST(
      request('user_A', { ...body, identityToken: 'x'.repeat(20_000) }),
    );
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
