import type { NextResponse } from 'next/server';

import { anonymousCredential, type CloudPlayer } from './identity';
import { CLOUD_ANONYMOUS_COOKIE } from './protocol';

/** Call after a successful operation that verified this player's credential. */
export function refreshAnonymousCookie(
  request: Request,
  response: NextResponse,
  player: CloudPlayer,
  platform: string,
  issuedToken?: string,
): void {
  if (player.authenticated) return;
  const token =
    issuedToken ?? (platform === 'web' ? anonymousCredential(request) : null);
  if (!token) return;
  response.cookies.set(CLOUD_ANONYMOUS_COOKIE, token, {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 90 * 24 * 60 * 60,
  });
}
