import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import {
  decryptAppleSecret,
  decryptAppleToken,
  revokeAppleToken,
  appleClientIds,
  type AppleRevocableToken,
} from './appleProvider';
import {
  claimAccountDeletion,
  claimAppleRevocations,
  eraseAppleAccount,
  finishAppleRevocation,
  finishHostedAppleCapture,
  pendingAccountDeletionIds,
  queuedAppleGrants,
  retryAccountDeletion,
  expireAppleRevocations,
} from './appleRepository';

function userIsGone(error: unknown): boolean {
  return isClerkAPIResponseError(error) && error.status === 404;
}

/** Clerk owns hosted OAuth. Capture its available Apple access tokens before deletion. */
async function captureHostedAppleTokens(id: string, userId: string) {
  const tokens: AppleRevocableToken[] = [];
  let manualRequired = false;
  const knownGrants = await queuedAppleGrants(id);
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const accounts = user.externalAccounts.filter(
      (account) => account.provider === 'apple',
    );
    if (accounts.length) {
      const clientId = process.env.MORPHEUS_APPLE_WEB_CLIENT_ID;
      if (clientId && appleClientIds().includes(clientId)) {
        const access = await client.users.getUserOauthAccessToken(
          userId,
          'apple',
        );
        for (const token of access.data) {
          if (
            token.provider === 'apple' &&
            token.token &&
            accounts.some((account) => account.id === token.externalAccountId)
          )
            tokens.push({
              clientId,
              token: token.token,
              tokenType: 'access_token',
            });
        }
      }
      manualRequired = knownGrants === 0 && tokens.length === 0;
    }
  } catch {
    // A missing provider token or unavailable provider never prevents account erasure.
    // A user already deleted elsewhere may also have had a hosted Apple grant.
    manualRequired = knownGrants === 0;
  }
  await finishHostedAppleCapture(id, tokens, manualRequired);
}

export async function processAppleRevocations(deletionId?: string) {
  const jobs = await claimAppleRevocations(deletionId);
  await Promise.all(
    jobs.map(async (job) => {
      let success = false;
      if (!job.expired && job.encrypted_token !== null) {
        try {
          await revokeAppleToken(
            decryptAppleToken(job.encrypted_token, job.id),
          );
          success = true;
        } catch {
          // The durable job retains only encrypted revocation material for a bounded retry.
        }
      }
      await finishAppleRevocation(job.id, job.lease_id, success);
    }),
  );
  return jobs.length;
}

export async function processAccountDeletion(id: string) {
  const job = await claimAccountDeletion(id);
  if (!job) return;
  try {
    const userId = decryptAppleSecret(
      job.encrypted_target,
      `clerk-deletion:${id}`,
    );
    if (!job.hosted_checked) await captureHostedAppleTokens(id, userId);
    const client = await clerkClient();
    try {
      await client.users.deleteUser(userId);
    } catch (error) {
      if (!userIsGone(error)) throw error;
    }
    // Remote success (including a retry's404) is durable before we say deleted.
    await eraseAppleAccount(userId, true);
  } catch {
    // The receipt remains pending, including if the remote outcome was ambiguous.
    await retryAccountDeletion(id, job.lease_id);
  }
}

/** Called only after Clerk's signed user.deleted webhook has been verified. */
export async function handleAppleClerkDeletion(userId: string) {
  await eraseAppleAccount(userId, true);
}

/** Run before foundation retention so outstanding deletion fences cannot expire. */
export async function maintainAppleAccounts() {
  await expireAppleRevocations();
  const ids = await pendingAccountDeletionIds();
  await Promise.all(ids.map(processAccountDeletion));
  const revocations = await processAppleRevocations();
  return {
    pendingAccountsAttempted: ids.length,
    appleRevocationsAttempted: revocations,
  };
}
