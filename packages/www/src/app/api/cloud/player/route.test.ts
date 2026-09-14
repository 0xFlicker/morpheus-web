import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeCloudPlayer: vi.fn(),
  requireCloudPlayer: vi.fn(),
  rateLimit: vi.fn(),
  recordCloudSession: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/cloud/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cloud/identity')>()),
  initializeCloudPlayer: mocks.initializeCloudPlayer,
  requireCloudPlayer: mocks.requireCloudPlayer,
  rateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/cloud/sessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cloud/sessions')>()),
  recordCloudSession: mocks.recordCloudSession,
}));

import { CloudHttpError } from '@/lib/cloud/http';
import {
  CLOUD_ANONYMOUS_COOKIE,
  CLOUD_ANONYMOUS_HEADER,
} from '@/lib/cloud/protocol';
import { POST as register } from './route';
import { POST as updateSession } from '../session/route';

const player = {
  id: '11111111-1111-4111-8111-111111111111',
  authenticated: false,
};
const token = 'a'.repeat(43);
const replacementToken = 'b'.repeat(43);

function sessionRequest(
  path: string,
  platform = 'web',
  headers: Record<string, string> = {},
) {
  return new Request(`https://www.soapbubble.xyz/api/cloud/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-morpheus-identity': 'anonymous',
      'x-morpheus-player-id': player.id,
      cookie: `${CLOUD_ANONYMOUS_COOKIE}=${token}`,
      ...headers,
    },
    body: JSON.stringify({
      deviceId: '22222222-2222-4222-8222-222222222222',
      sessionId: '33333333-3333-4333-8333-333333333333',
      platform,
      appVersion: 'test',
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.initializeCloudPlayer.mockResolvedValue({ player });
  mocks.requireCloudPlayer.mockResolvedValue(player);
});

describe.each([
  { path: 'player', post: register, verify: mocks.initializeCloudPlayer },
  { path: 'session', post: updateSession, verify: mocks.requireCloudPlayer },
])('$path anonymous browser cookie lifetime', ({ path, post, verify }) => {
  it('renews the verified cookie for 90 days after recording a successful web session', async () => {
    const response = await post(sessionRequest(path));
    expect(response.status).toBe(200);
    expect(mocks.recordCloudSession).toHaveBeenCalledWith(
      player.id,
      expect.objectContaining({ platform: 'web' }),
    );
    const cookie = response.headers.get('set-cookie');
    for (const attribute of [
      `${CLOUD_ANONYMOUS_COOKIE}=${token}`,
      'Max-Age=7776000',
      'HttpOnly',
      'Secure',
      'SameSite=lax',
      'Path=/',
    ])
      expect(cookie).toContain(attribute);
    expect(await response.json()).not.toHaveProperty('anonymousToken');
  });

  it('renews the verified header credential when a different cookie is present', async () => {
    const response = await post(
      sessionRequest(path, 'web', {
        [CLOUD_ANONYMOUS_HEADER]: replacementToken,
      }),
    );
    expect(response.headers.get('set-cookie')).toContain(
      `${CLOUD_ANONYMOUS_COOKIE}=${replacementToken}`,
    );
  });

  it('does not renew an unverified anonymous cookie during authenticated play', async () => {
    const authenticatedPlayer = { ...player, authenticated: true };
    mocks.initializeCloudPlayer.mockResolvedValue({
      player: authenticatedPlayer,
    });
    mocks.requireCloudPlayer.mockResolvedValue(authenticatedPlayer);
    const response = await post(
      sessionRequest(path, 'web', { 'x-morpheus-identity': 'user_test' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('does not renew a cookie after identity verification fails', async () => {
    verify.mockRejectedValue(new CloudHttpError(409, 'Account changed'));
    const response = await post(sessionRequest(path));
    expect(response.status).toBe(409);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.recordCloudSession).not.toHaveBeenCalled();
  });

  it('does not renew a cookie when the session cannot be recorded', async () => {
    mocks.recordCloudSession.mockRejectedValue(
      new CloudHttpError(503, 'Unavailable'),
    );
    const response = await post(sessionRequest(path));
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('does not create a browser cookie for an existing native session', async () => {
    const response = await post(
      sessionRequest(path, 'ios', { [CLOUD_ANONYMOUS_HEADER]: token }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});

describe('anonymous registration', () => {
  it.each(['web', 'ios'])(
    'prefers the newly issued token over a stale cookie on %s',
    async (platform) => {
      mocks.initializeCloudPlayer.mockResolvedValue({
        player,
        anonymousToken: replacementToken,
      });
      const response = await register(sessionRequest('player', platform));
      expect(response.headers.get('set-cookie')).toContain(
        `${CLOUD_ANONYMOUS_COOKIE}=${replacementToken}`,
      );
      expect((await response.json()).anonymousToken).toBe(
        platform === 'web' ? undefined : replacementToken,
      );
    },
  );

  it('passes the required identity assertion to registration', async () => {
    const request = sessionRequest('player');
    await register(request);
    expect(mocks.initializeCloudPlayer).toHaveBeenCalledWith(
      request,
      'anonymous',
    );
  });

  it('rejects registration without an identity assertion before resolving a player', async () => {
    const request = sessionRequest('player');
    request.headers.delete('x-morpheus-identity');
    const response = await register(request);
    expect(response.status).toBe(400);
    expect(mocks.initializeCloudPlayer).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
