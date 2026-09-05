import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { CloudHttpError } from './http';

const appleIssuer = 'https://appleid.apple.com';
const appleKeys = createRemoteJWKSet(new URL(`${appleIssuer}/auth/keys`), {
  timeoutDuration: 10_000,
});
const revocableTokenSchema = z.strictObject({
  clientId: z.string().min(1).max(256),
  token: z.string().min(1).max(16_384),
  tokenType: z.enum(['refresh_token', 'access_token']),
});
export type AppleRevocableToken = z.infer<typeof revocableTokenSchema>;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error('Apple account services are not configured');
  return value;
}

export function appleClientIds(): string[] {
  const ids = required('MORPHEUS_APPLE_CLIENT_IDS')
    .split(',')
    .map((id) => id.trim());
  if (ids.some((id) => !/^[A-Za-z0-9.-]{1,256}$/.test(id)))
    throw new Error('Apple client configuration is invalid');
  return ids;
}

/** Native grants have no redirect URI. Hosted grants remain owned by Clerk. */
export async function verifyAppleIdentity(identityToken: string) {
  const audience = appleClientIds();
  try {
    const { payload } = await jwtVerify(identityToken, appleKeys, {
      issuer: appleIssuer,
      audience,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'aud', 'exp', 'iat'],
      maxTokenAge: '10 minutes',
      clockTolerance: 5,
    });
    if (typeof payload.aud !== 'string' || !payload.sub)
      throw new Error('Invalid Apple identity');
    return { subject: payload.sub, clientId: payload.aud };
  } catch {
    throw new CloudHttpError(
      401,
      'Apple authorization could not be verified. Sign in again.',
    );
  }
}

async function clientSecret(clientId: string): Promise<string> {
  if (!appleClientIds().includes(clientId))
    throw new Error('Apple client is not configured');
  const key = await importPKCS8(
    required('MORPHEUS_APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    'ES256',
  );
  return new SignJWT({})
    .setProtectedHeader({
      alg: 'ES256',
      kid: required('MORPHEUS_APPLE_KEY_ID'),
    })
    .setIssuer(required('MORPHEUS_APPLE_TEAM_ID'))
    .setSubject(clientId)
    .setAudience(appleIssuer)
    .setIssuedAt()
    .setExpirationTime('5 minutes')
    .sign(key);
}

async function appleRequest(
  path: 'token' | 'revoke',
  clientId: string,
  fields: Record<string, string>,
) {
  return fetch(`${appleIssuer}/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: await clientSecret(clientId),
      ...fields,
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
    cache: 'no-store',
  });
}

export async function exchangeAppleCode(
  code: string,
  expected: { subject: string; clientId: string },
): Promise<AppleRevocableToken> {
  const response = await appleRequest('token', expected.clientId, {
    code,
    grant_type: 'authorization_code',
  });
  if (!response.ok)
    throw new CloudHttpError(
      422,
      'Apple authorization could not be saved. Sign in with Apple again.',
    );
  const tokens = z
    .object({
      refresh_token: z.string().min(1).max(16_384),
      id_token: z.string().max(16_384),
    })
    .parse(await response.json());
  const identity = await verifyAppleIdentity(tokens.id_token);
  if (
    identity.subject !== expected.subject ||
    identity.clientId !== expected.clientId
  )
    throw new CloudHttpError(
      401,
      'Apple authorization does not match this account.',
    );
  return {
    clientId: expected.clientId,
    token: tokens.refresh_token,
    tokenType: 'refresh_token',
  };
}

export async function revokeAppleToken(
  token: AppleRevocableToken,
): Promise<void> {
  const response = await appleRequest('revoke', token.clientId, {
    token: token.token,
    token_type_hint: token.tokenType,
  });
  // Apple returns 200 both for successful revocation and an already invalidated token.
  if (response.status !== 200) throw new Error('Apple revocation is pending');
}

function encryptionKey(): Buffer {
  const value = required('MORPHEUS_APPLE_ENCRYPTION_KEY');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value)
    throw new Error('Apple encryption configuration is invalid');
  return key;
}

/** Purpose and random record ID bind ciphertext to its one intended row. */
export function encryptAppleSecret(value: string, purpose: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
    'base64',
  );
}

export function decryptAppleSecret(value: string, purpose: string): string {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 29) throw new Error('Invalid encrypted Apple record');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    bytes.subarray(0, 12),
  );
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}

export function encryptAppleToken(
  token: AppleRevocableToken,
  id: string,
): string {
  return encryptAppleSecret(
    JSON.stringify(revocableTokenSchema.parse(token)),
    `apple-grant:${id}`,
  );
}

export function decryptAppleToken(
  ciphertext: string,
  id: string,
): AppleRevocableToken {
  return revocableTokenSchema.parse(
    JSON.parse(decryptAppleSecret(ciphertext, `apple-grant:${id}`)),
  );
}
