import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  stored: vi.fn(),
  reserve: vi.fn(),
  save: vi.fn(),
  verify: vi.fn(),
  exchange: vi.fn(),
  rate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({ users: { getUser: mocks.user } }),
}));
vi.mock('./appleRepository', () => ({
  hasStoredAppleGrant: mocks.stored,
  reserveAppleGrant: mocks.reserve,
  completeAppleGrant: mocks.save,
}));
vi.mock('./appleProvider', () => ({
  verifyAppleIdentity: mocks.verify,
  exchangeAppleCode: mocks.exchange,
}));
vi.mock('./identity', () => ({ rateLimit: mocks.rate }));
import { saveAppleAuthorization } from './appleGrant';

const request = {
  protocolVersion: 1 as const,
  identityToken: 'jwt',
  authorizationCode: 'code',
  appleUserId: 'subject',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({
    externalAccounts: [
      {
        provider: 'apple',
        providerUserId: 'subject',
        verification: { status: 'verified' },
      },
    ],
  });
  mocks.stored.mockResolvedValue(false);
  mocks.reserve.mockResolvedValue('reservation-id');
  mocks.verify.mockResolvedValue({
    subject: 'subject',
    clientId: 'native.app',
  });
  mocks.exchange.mockResolvedValue({
    clientId: 'native.app',
    token: 'refresh',
    tokenType: 'refresh_token',
  });
});
describe('account-bound Apple grants', () => {
  it('rejects an Apple subject not verified on the authenticated Clerk user before exchanging', async () => {
    mocks.user.mockResolvedValue({
      externalAccounts: [
        {
          provider: 'apple',
          providerUserId: 'other',
          verification: { status: 'verified' },
        },
      ],
    });
    await expect(
      saveAppleAuthorization('user_A', request),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it('rejects a JWT subject that differs from its verified Clerk account', async () => {
    mocks.verify.mockResolvedValue({
      subject: 'other',
      clientId: 'native.app',
    });
    await expect(
      saveAppleAuthorization('user_A', request),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it('returns a stored identical code retry without exchanging it again or requiring a fresh Apple JWT', async () => {
    mocks.stored.mockResolvedValue(true);
    await saveAppleAuthorization('user_A', request);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it('exchanges and stores only after both subjects match, with a per-account grant budget', async () => {
    await saveAppleAuthorization('user_A', request);
    expect(mocks.rate).toHaveBeenCalledWith(
      expect.stringMatching(/^apple-grant:[a-f0-9]{64}$/),
      20,
      3600,
    );
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.exchange.mock.invocationCallOrder[0],
    );
    expect(mocks.save).toHaveBeenCalledWith('user_A', 'reservation-id', {
      clientId: 'native.app',
      token: 'refresh',
      tokenType: 'refresh_token',
    });
  });
  it('does not exchange the same code twice while its admitted request is unresolved', async () => {
    mocks.reserve.mockRejectedValue(
      Object.assign(new Error('pending'), { status: 503 }),
    );
    await expect(
      saveAppleAuthorization('user_A', request),
    ).rejects.toMatchObject({ status: 503 });
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('recognizes a completed concurrent request before repeating Apple exchange', async () => {
    mocks.reserve.mockResolvedValue(null);
    await saveAppleAuthorization('user_A', request);
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it('keeps an admitted ambiguous exchange represented instead of pretending it stored a token', async () => {
    mocks.exchange.mockRejectedValue(new Error('lost Apple response'));
    await expect(saveAppleAuthorization('user_A', request)).rejects.toThrow(
      'lost Apple response',
    );
    expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
