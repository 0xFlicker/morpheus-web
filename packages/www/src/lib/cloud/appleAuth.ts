import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { CloudHttpError } from './http';

export async function requireAppleAccountIdentity(
  request: Request,
): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new CloudHttpError(401, 'Sign in to manage this account.');
  if (request.headers.get('x-morpheus-identity') !== userId)
    throw new CloudHttpError(
      409,
      'The account on this device changed. Reconnect before continuing.',
    );
  return userId;
}
