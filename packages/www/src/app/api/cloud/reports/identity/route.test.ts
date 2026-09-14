import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeCloudPlayer: vi.fn(),
  requireCloudPlayer: vi.fn(),
  anonymousCredential: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/cloud/identity', () => mocks);
import { POST } from './route';
import { CloudHttpError } from '@/lib/cloud/http';

const playerId = '11111111-1111-4111-8111-111111111111';
const body = { protocolVersion: 1, platform: 'web' };
const request = (value: unknown = body, headers: Record<string, string> = {}) =>
  new Request('https://www.soapbubble.xyz/api/cloud/reports/identity', {
    method: 'POST',
    body: JSON.stringify(value),
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('explicit reporting identity preflight', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.initializeCloudPlayer.mockResolvedValue({
      player: { id: playerId, authenticated: false },
      anonymousToken: 'private-anonymous-token',
    });
  });
  it('establishes an anonymous browser cookie before accepting any report content', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      protocolVersion: 1,
      playerId,
      authenticated: false,
    });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      `reports-identity:${playerId}`,
      60,
      60,
    );
  });
  it('returns a newly issued credential for native clients to persist before uploading', async () => {
    const response = await POST(request({ ...body, platform: 'ios' }));
    expect(await response.json()).toEqual({
      protocolVersion: 1,
      playerId,
      authenticated: false,
      anonymousToken: 'private-anonymous-token',
    });
  });
  it('checks an existing selected identity without binding it to another account', async () => {
    mocks.requireCloudPlayer.mockRejectedValueOnce(
      new CloudHttpError(409, 'The account changed'),
    );
    expect(
      (await POST(request(body, { 'x-morpheus-player-id': playerId }))).status,
    ).toBe(409);
    expect(mocks.initializeCloudPlayer).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it('limits an existing reporting identity before returning its credential', async () => {
    mocks.requireCloudPlayer.mockResolvedValueOnce({
      id: playerId,
      authenticated: false,
    });
    mocks.rateLimit.mockRejectedValueOnce(
      new CloudHttpError(429, 'Please try again shortly.'),
    );
    const response = await POST(
      request(body, { 'x-morpheus-player-id': playerId }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      `reports-identity:${playerId}`,
      60,
      60,
    );
    expect(mocks.initializeCloudPlayer).not.toHaveBeenCalled();
  });
  it('rejects content and cross-site requests before issuing credentials', async () => {
    expect(
      (await POST(request({ ...body, description: 'Do not upload this yet.' })))
        .status,
    ).toBe(400);
    expect(
      (await POST(request(body, { origin: 'https://attacker.test' }))).status,
    ).toBe(403);
    expect(mocks.initializeCloudPlayer).not.toHaveBeenCalled();
    expect(mocks.requireCloudPlayer).not.toHaveBeenCalled();
  });
});
