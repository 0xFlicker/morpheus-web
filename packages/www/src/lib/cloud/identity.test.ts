import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  sql: Object.assign(vi.fn(), { transaction: vi.fn() }),
}));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock('./database', () => ({ cloudDatabase: () => mocks.sql }));

import {
  anonymousCredential,
  initializeCloudPlayer,
  requireCloudAdmin,
  requireCloudPlayer,
} from './identity';

const playerId = 'aac14d7b-800b-43b2-bb77-26b27fca728c';
const otherPlayerId = 'ae4f570c-0880-49ec-84fa-509a8067aa44';
const token = 'a'.repeat(43);
const request = (expected = playerId, extra: Record<string, string> = {}) =>
  new Request('https://www.soapbubble.xyz/api/cloud/saves', {
    headers: {
      'x-morpheus-player-id': expected,
      'x-morpheus-anonymous-token': token,
      ...extra,
    },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: null });
  mocks.sql.mockResolvedValue([{ id: playerId, clerk_user_id: null }]);
  mocks.sql.transaction.mockResolvedValue([
    [],
    [{ id: playerId, clerk_user_id: 'user_authenticated' }],
  ]);
});

describe('cloud identity authorization', () => {
  it('does not link guest history from report-only identity preflight', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_authenticated' });
    await expect(initializeCloudPlayer(request())).resolves.toEqual({
      player: { id: playerId, authenticated: true },
    });
    expect(mocks.sql).toHaveBeenCalledTimes(2);
    expect(
      mocks.sql.mock.calls.some(([parts]) =>
        parts.join('').includes('associated_player_id'),
      ),
    ).toBe(false);
  });
  it('rejects registration against a stale Clerk identity before creating or associating any player', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_newaccount' });
    await expect(
      initializeCloudPlayer(request(), 'user_oldaccount'),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      initializeCloudPlayer(request(), 'anonymous'),
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.sql.transaction).not.toHaveBeenCalled();
  });
  it('hashes the opaque credential before querying and treats the header only as a consistency check', async () => {
    await expect(requireCloudPlayer(request())).resolves.toEqual({
      id: playerId,
      authenticated: false,
    });
    const parameters = mocks.sql.mock.calls[0].slice(1);
    expect(parameters).not.toContain(token);
    expect(parameters[0]).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      requireCloudPlayer(request(otherPlayerId)),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects forged expected-player headers without a valid credential', async () => {
    mocks.sql.mockResolvedValue([]);
    await expect(requireCloudPlayer(request())).rejects.toMatchObject({
      status: 401,
    });
  });
  it('uses verified Clerk identity and rejects cookie account races', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_authenticated' });
    mocks.sql.transaction.mockResolvedValue([
      [],
      [{ id: otherPlayerId, clerk_user_id: 'user_authenticated' }],
    ]);
    await expect(requireCloudPlayer(request())).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.sql.mock.calls[1]).toContain('user_authenticated');
  });
  it('does not recreate an account from a token retry after deletion', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_deleted' });
    mocks.sql.transaction.mockResolvedValue([[], []]);
    await expect(requireCloudPlayer(request())).rejects.toMatchObject({
      status: 401,
    });
  });
  it('never downgrades an invalid bearer to an anonymous save write', async () => {
    await expect(
      requireCloudPlayer(
        request(playerId, { authorization: 'Bearer invalid' }),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('accepts native uppercase UUID spelling and rejects missing expected identity', async () => {
    await expect(
      requireCloudPlayer(request(playerId.toUpperCase())),
    ).resolves.toMatchObject({ id: playerId });
    await expect(
      requireCloudPlayer(
        new Request('https://www.soapbubble.xyz/api/cloud/saves'),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('reads a valid HttpOnly-cookie credential without accepting malformed tokens', () => {
    expect(
      anonymousCredential(
        new Request('https://www.soapbubble.xyz', {
          headers: { cookie: `other=1; morpheus-player=${token}` },
        }),
      ),
    ).toBe(token);
    expect(
      anonymousCredential(
        new Request('https://www.soapbubble.xyz', {
          headers: { 'x-morpheus-anonymous-token': 'short' },
        }),
      ),
    ).toBeNull();
  });
});

describe('cloud admin authorization', () => {
  it('denies signed-out requests and non-admin users before loading identity details', async () => {
    vi.stubEnv('CLERK_ADMIN_USER_ID', 'user_admin');
    await expect(requireCloudAdmin()).rejects.toMatchObject({ status: 401 });
    mocks.auth.mockResolvedValue({ userId: 'user_player' });
    await expect(requireCloudAdmin()).rejects.toMatchObject({ status: 403 });
    expect(mocks.currentUser).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it('requires both configured admin ID and the verified admin email', async () => {
    vi.stubEnv('CLERK_ADMIN_USER_ID', 'user_admin');
    mocks.auth.mockResolvedValue({ userId: 'user_admin' });
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: 'me@0xflick.xyz',
        verification: { status: 'unverified' },
      },
    });
    await expect(requireCloudAdmin()).rejects.toMatchObject({ status: 403 });
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: 'me@0xflick.xyz',
        verification: { status: 'verified' },
      },
    });
    await expect(requireCloudAdmin()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });
});
