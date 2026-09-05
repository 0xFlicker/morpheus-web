import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  remove: vi.fn(),
  access: vi.fn(),
  claim: vi.fn(),
  grants: vi.fn(),
  capture: vi.fn(),
  erase: vi.fn(),
  retry: vi.fn(),
  jobs: vi.fn(),
  finish: vi.fn(),
  revoke: vi.fn(),
  decrypt: vi.fn(),
  pending: vi.fn(),
  expire: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: {
      getUser: mocks.user,
      deleteUser: mocks.remove,
      getUserOauthAccessToken: mocks.access,
    },
  }),
}));
vi.mock('@clerk/nextjs/errors', () => ({
  isClerkAPIResponseError: (error: unknown) =>
    error instanceof Error && error.name === 'ClerkAPIResponseError',
}));
vi.mock('./appleProvider', () => ({
  decryptAppleSecret: () => 'user_A',
  decryptAppleToken: mocks.decrypt,
  revokeAppleToken: mocks.revoke,
  appleClientIds: () => ['web.client'],
}));
vi.mock('./appleRepository', () => ({
  claimAccountDeletion: mocks.claim,
  queuedAppleGrants: mocks.grants,
  finishHostedAppleCapture: mocks.capture,
  eraseAppleAccount: mocks.erase,
  retryAccountDeletion: mocks.retry,
  claimAppleRevocations: mocks.jobs,
  finishAppleRevocation: mocks.finish,
  pendingAccountDeletionIds: mocks.pending,
  expireAppleRevocations: mocks.expire,
}));
import {
  processAccountDeletion,
  processAppleRevocations,
  handleAppleClerkDeletion,
  maintainAppleAccounts,
} from './appleAccount';

const id = '11111111-1111-4111-8111-111111111111';
const lease = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('MORPHEUS_APPLE_WEB_CLIENT_ID', 'web.client');
  mocks.claim.mockResolvedValue({
    deletion_id: id,
    encrypted_target: 'ciphertext',
    hosted_checked: false,
    lease_id: lease,
  });
  mocks.grants.mockResolvedValue(0);
  mocks.user.mockResolvedValue({ externalAccounts: [] });
  mocks.jobs.mockResolvedValue([]);
  mocks.pending.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe('durable Apple/account deletion processing', () => {
  it('deletes Clerk and confirms erasure when a linked Apple provider has no revocable token', async () => {
    mocks.user.mockResolvedValue({
      externalAccounts: [
        {
          provider: 'apple',
          id: 'eac_a',
          verification: { status: 'verified' },
        },
      ],
    });
    mocks.access.mockRejectedValue(new Error('provider unavailable'));
    await processAccountDeletion(id);
    expect(mocks.capture).toHaveBeenCalledWith(id, [], true);
    expect(mocks.remove).toHaveBeenCalledWith('user_A');
    expect(mocks.erase).toHaveBeenCalledWith('user_A', true);
  });
  it('persists available hosted access tokens before deleting the Clerk user', async () => {
    mocks.user.mockResolvedValue({
      externalAccounts: [
        {
          provider: 'apple',
          id: 'eac_a',
          verification: { status: 'verified' },
        },
      ],
    });
    mocks.access.mockResolvedValue({
      data: [
        {
          provider: 'apple',
          externalAccountId: 'eac_a',
          token: 'apple-access',
        },
        {
          provider: 'apple',
          externalAccountId: 'eac_other',
          token: 'unrelated',
        },
      ],
    });
    await processAccountDeletion(id);
    expect(mocks.capture).toHaveBeenCalledWith(
      id,
      [
        {
          clientId: 'web.client',
          token: 'apple-access',
          tokenType: 'access_token',
        },
      ],
      false,
    );
    expect(mocks.capture.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.remove.mock.invocationCallOrder[0],
    );
  });
  it('leaves an ambiguous Clerk outcome pending and retryable without claiming deletion', async () => {
    mocks.remove.mockRejectedValue(new Error('connection interrupted'));
    await processAccountDeletion(id);
    expect(mocks.erase).not.toHaveBeenCalled();
    expect(mocks.retry).toHaveBeenCalledWith(id, lease);
  });
  it('confirms a retry when Clerk already deleted the user', async () => {
    const gone = Object.assign(new Error('gone'), {
      name: 'ClerkAPIResponseError',
      status: 404,
    });
    mocks.user.mockRejectedValue(gone);
    mocks.remove.mockRejectedValue(gone);
    await processAccountDeletion(id);
    expect(mocks.erase).toHaveBeenCalledWith('user_A', true);
    expect(mocks.retry).not.toHaveBeenCalled();
  });
  it('does not process another worker’s leased or completed deletion', async () => {
    mocks.claim.mockResolvedValue(null);
    await processAccountDeletion(id);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('records failed revocation for bounded retry independently of account deletion', async () => {
    mocks.jobs.mockResolvedValue([
      { id, encrypted_token: 'ciphertext', lease_id: lease, expired: false },
    ]);
    mocks.decrypt.mockReturnValue({
      clientId: 'web.client',
      token: 'secret',
      tokenType: 'refresh_token',
    });
    mocks.revoke.mockRejectedValue(new Error('Apple offline'));
    await processAppleRevocations();
    expect(mocks.finish).toHaveBeenCalledWith(id, lease, false);
  });
  it('expires revocation material without sending an expired job to Apple', async () => {
    mocks.jobs.mockResolvedValue([
      { id, encrypted_token: 'ciphertext', lease_id: lease, expired: true },
    ]);
    await processAppleRevocations();
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(id, lease, false);
  });
  it('handles an already verified Clerk webhook through the same atomic fence and grant erasure', async () => {
    await handleAppleClerkDeletion('user_deleted');
    expect(mocks.erase).toHaveBeenCalledWith('user_deleted', true);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it('expires revocation material and refreshes deletion fences before attempting maintenance', async () => {
    await maintainAppleAccounts();
    expect(mocks.expire.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.pending.mock.invocationCallOrder[0],
    );
    expect(mocks.pending).toHaveBeenCalledOnce();
  });
});
