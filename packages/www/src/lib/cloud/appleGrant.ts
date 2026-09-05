import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import { CloudHttpError } from './http';
import { rateLimit } from './identity';
import { digest } from './saveRepository';
import type { AppleAuthorization } from './appleProtocol';
import { exchangeAppleCode, verifyAppleIdentity } from './appleProvider';
import {
  hasStoredAppleGrant,
  reserveAppleGrant,
  completeAppleGrant,
} from './appleRepository';

export async function saveAppleAuthorization(
  userId: string,
  authorization: AppleAuthorization,
): Promise<void> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (
    !user.externalAccounts.some(
      (account) =>
        account.provider === 'apple' &&
        account.providerUserId === authorization.appleUserId &&
        account.verification?.status === 'verified',
    )
  ) {
    throw new CloudHttpError(
      403,
      'Apple authorization does not belong to this signed-in account.',
    );
  }
  // A completed exchange may be retried after its short-lived Apple JWT expired.
  if (await hasStoredAppleGrant(userId, authorization.authorizationCode))
    return;
  await rateLimit(`apple-grant:${digest(userId)}`, 20, 3600);
  const identity = await verifyAppleIdentity(authorization.identityToken);
  if (identity.subject !== authorization.appleUserId)
    throw new CloudHttpError(
      403,
      'Apple authorization does not match this account.',
    );
  const reservation = await reserveAppleGrant(
    userId,
    authorization.authorizationCode,
  );
  if (reservation === null) return;
  const token = await exchangeAppleCode(
    authorization.authorizationCode,
    identity,
  );
  await completeAppleGrant(userId, reservation, token);
}
