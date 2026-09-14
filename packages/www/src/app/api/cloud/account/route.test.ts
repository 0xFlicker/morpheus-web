import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  begin: vi.fn(),
  process: vi.fn(),
  revoke: vi.fn(),
  rate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/cloud/appleRepository', () => ({
  findDeletionReceipt: mocks.find,
  beginAccountDeletion: mocks.begin,
}));
vi.mock('@/lib/cloud/appleAccount', () => ({
  processAccountDeletion: mocks.process,
  processAppleRevocations: mocks.revoke,
}));
vi.mock('@/lib/cloud/identity', () => ({ rateLimit: mocks.rate }));
import { DELETE, GET } from './route';

const id = '11111111-1111-4111-8111-111111111111';
const token = 'a'.repeat(43);
const pending = { deletion_id: id, status: 'pending', apple_status: 'queued' };
const done = {
  deletion_id: id,
  status: 'deleted',
  apple_status: 'manual_required',
};
function request(
  method = 'DELETE',
  headers: Record<string, string> = {},
  body = { protocolVersion: 1, deletionId: id },
) {
  return new Request(
    `https://soapbubble.xyz/api/cloud/account?deletionId=${id}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-morpheus-deletion-token': token,
        ...headers,
      },
      ...(method === 'DELETE' ? { body: JSON.stringify(body) } : {}),
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: 'user_A' });
});
describe('durable deletion capability routes', () => {
  it('accepts a new deletion only for the captured verified Clerk account and returns202 pending', async () => {
    mocks.find.mockResolvedValue(pending).mockResolvedValueOnce(null);
    const response = await DELETE(
      request('DELETE', { 'x-morpheus-identity': 'user_A' }),
    );
    expect(response.status).toBe(202);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(mocks.begin).toHaveBeenCalledWith(id, token, 'user_A');
    expect(await response.json()).toEqual({
      protocolVersion: 1,
      deletionId: id,
      status: 'pending',
      deleted: false,
      appleRevocation: 'queued',
    });
  });
  it('rejects a changed account before authorizing a deletion target', async () => {
    mocks.find.mockResolvedValue(null);
    const response = await DELETE(
      request('DELETE', { 'x-morpheus-identity': 'user_B' }),
    );
    expect(response.status).toBe(409);
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it('returns404 for an unknown capability without Clerk authentication; it cannot authorize new deletion', async () => {
    mocks.find.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await DELETE(request())).status).toBe(404);
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it('recovers a completed deletion after Clerk sign-out without reading current auth', async () => {
    mocks.find.mockResolvedValue(done);
    const response = await GET(request('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      protocolVersion: 1,
      deletionId: id,
      status: 'deleted',
      deleted: true,
      appleRevocation: 'manual_required',
    });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('resumes only the already-authorized pending target via a DELETE retry', async () => {
    mocks.find
      .mockResolvedValue(done)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(pending);
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith(id);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it('never reports an unknown GET receipt as deleted', async () => {
    mocks.find.mockResolvedValue(null);
    expect((await GET(request('GET'))).status).toBe(404);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it('does not allow cross-origin or malformed capability requests', async () => {
    expect(
      (await GET(request('GET', { origin: 'https://evil.test' }))).status,
    ).toBe(403);
    expect(
      (await GET(request('GET', { 'x-morpheus-deletion-token': 'short' })))
        .status,
    ).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });
});
