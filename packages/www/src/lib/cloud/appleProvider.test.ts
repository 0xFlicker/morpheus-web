import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { exportPKCS8, generateKeyPair, SignJWT, decodeJwt } from 'jose';

const mocks = vi.hoisted(() => ({ key: undefined as CryptoKey | undefined }));
vi.mock('server-only', () => ({}));
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return { ...actual, createRemoteJWKSet: () => async () => mocks.key };
});
import {
  decryptAppleSecret,
  encryptAppleSecret,
  verifyAppleIdentity,
  exchangeAppleCode,
  revokeAppleToken,
} from './appleProvider';

let signingKey: CryptoKey;
let clientKey: string;
beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  mocks.key = keys.publicKey;
  signingKey = keys.privateKey;
  clientKey = await exportPKCS8(
    (await generateKeyPair('ES256', { extractable: true })).privateKey,
  );
});
beforeEach(() => {
  vi.stubEnv('MORPHEUS_APPLE_CLIENT_IDS', 'xyz.soapbubble.morpheus');
  vi.stubEnv('MORPHEUS_APPLE_PRIVATE_KEY', clientKey);
  vi.stubEnv('MORPHEUS_APPLE_TEAM_ID', 'TESTTEAM');
  vi.stubEnv('MORPHEUS_APPLE_KEY_ID', 'TESTKEY');
  vi.stubEnv(
    'MORPHEUS_APPLE_ENCRYPTION_KEY',
    Buffer.alloc(32, 9).toString('base64'),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function token(
  subject = 'apple-person',
  audience = 'xyz.soapbubble.morpheus',
  issuer = 'https://appleid.apple.com',
  expires = '5 minutes',
) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(signingKey);
}

describe('Apple provider verification and encryption', () => {
  it('verifies issuer, configured audience, signature, and current token lifetime', async () => {
    await expect(verifyAppleIdentity(await token())).resolves.toEqual({
      subject: 'apple-person',
      clientId: 'xyz.soapbubble.morpheus',
    });
    await expect(
      verifyAppleIdentity(await token('apple-person', 'other.app')),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyAppleIdentity(
        await token('apple-person', undefined, 'https://evil.test'),
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyAppleIdentity(
        await token('apple-person', undefined, undefined, '-1 minute'),
      ),
    ).rejects.toMatchObject({ status: 401 });
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('apple-person')
      .setIssuer('https://appleid.apple.com')
      .setAudience('xyz.soapbubble.morpheus')
      .setIssuedAt()
      .setExpirationTime('5 minutes')
      .sign((await generateKeyPair('RS256')).privateKey);
    await expect(verifyAppleIdentity(forged)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('binds encrypted secrets to their purpose and rejects tampering and a wrong key', () => {
    const encrypted = encryptAppleSecret(
      'private refresh token',
      'apple-grant:one',
    );
    expect(encrypted).not.toContain('private');
    expect(decryptAppleSecret(encrypted, 'apple-grant:one')).toBe(
      'private refresh token',
    );
    expect(() => decryptAppleSecret(encrypted, 'clerk-deletion:one')).toThrow();
    const altered = Buffer.from(encrypted, 'base64');
    altered[altered.length - 1] ^= 1;
    expect(() =>
      decryptAppleSecret(altered.toString('base64'), 'apple-grant:one'),
    ).toThrow();
    vi.stubEnv(
      'MORPHEUS_APPLE_ENCRYPTION_KEY',
      Buffer.alloc(32, 10).toString('base64'),
    );
    expect(() => decryptAppleSecret(encrypted, 'apple-grant:one')).toThrow();
  });
  it('exchanges a native one-use code using a short client secret and verifies the returned subject', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ refresh_token: 'refresh', id_token: await token() }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      exchangeAppleCode('one-use-code', {
        subject: 'apple-person',
        clientId: 'xyz.soapbubble.morpheus',
      }),
    ).resolves.toEqual({
      token: 'refresh',
      clientId: 'xyz.soapbubble.morpheus',
      tokenType: 'refresh_token',
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    expect(options.redirect).toBe('error');
    expect(options.body.get('redirect_uri')).toBeNull();
    expect(options.body.get('code')).toBe('one-use-code');
    const claims = decodeJwt(options.body.get('client_secret'));
    expect(claims).toMatchObject({
      iss: 'TESTTEAM',
      sub: 'xyz.soapbubble.morpheus',
      aud: 'https://appleid.apple.com',
    });
    expect(claims.exp! - claims.iat!).toBe(300);
    fetchMock.mockResolvedValue(
      Response.json({
        refresh_token: 'refresh',
        id_token: await token('another-person'),
      }),
    );
    await expect(
      exchangeAppleCode('one-use-code', {
        subject: 'apple-person',
        clientId: 'xyz.soapbubble.morpheus',
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('does not treat a rejected or consumed authorization code as stored', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: 'invalid_grant' }, { status: 400 }),
        ),
    );
    await expect(
      exchangeAppleCode('consumed', {
        subject: 'apple-person',
        clientId: 'xyz.soapbubble.morpheus',
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('accepts only Apple200 revocation, including already-invalidated tokens', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      revokeAppleToken({
        token: 'refresh',
        clientId: 'xyz.soapbubble.morpheus',
        tokenType: 'refresh_token',
      }),
    ).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].body.get('token_type_hint')).toBe(
      'refresh_token',
    );
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    await expect(
      revokeAppleToken({
        token: 'refresh',
        clientId: 'xyz.soapbubble.morpheus',
        tokenType: 'refresh_token',
      }),
    ).rejects.toThrow('pending');
  });
});
