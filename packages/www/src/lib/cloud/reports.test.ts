import { crc32, deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./database', () => ({ cloudDatabase: () => mocks.sql }));
vi.mock('@vercel/blob', () => ({
  put: mocks.put,
  get: mocks.get,
  del: mocks.del,
}));

import {
  cloudReportSchema,
  listCloudReports,
  parseAdminPagination,
  readCloudReportAttachment,
  redactReportText,
  sanitizeReportScreenshot,
  submitCloudReport,
} from './reports';
import { digest } from './saveRepository';

const playerId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const request = () =>
  cloudReportSchema.parse({
    protocolVersion: 1,
    requestId,
    platform: 'macos',
    appVersion: '1.0',
    description: 'The panorama did not appear.',
    sceneId: 1010,
  });
const diagnostics = {
  snapshot: {
    schemaVersion: 1,
    capturedAt: '2026-09-05T01:00:00Z',
    app: { version: '1.0', build: '42' },
    platform: { family: 'macOS', device: 'Mac', operatingSystem: 'macOS 26' },
    scene: {
      sceneID: 1010,
      phase: 'playing',
      surface: 'panorama',
      authoredYaw: 0,
      pitch: 0,
    },
    gameState: { totalStateCount: 100, changedValues: { '1000': 1 } },
    error: {
      code: 'media',
      message: 'Failed /Users/Alice/secret.txt token=hide-me',
      sceneID: 1010,
    },
  },
  lastMediaFailure: {
    schemaVersion: 1,
    occurredAt: '2026-09-05T01:00:00Z',
    failureSource: 'foreground',
    elapsedMilliseconds: 123,
    attemptNumber: 1,
    statusCode: 403,
    underlyingURL: 'https://private.example/file?token=hide-me',
    underlyingError: 'Authorization: Bearer hide-me',
  },
};

function pngChunk(kind: string, data: Buffer) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(kind, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

function screenshot(includeMetadata = false, width = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    ...(includeMetadata
      ? [pngChunk('tEXt', Buffer.from('Comment\0private metadata'))]
      : []),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('requested cloud reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sql.mockReset();
    mocks.get.mockReset();
    vi.stubEnv('MORPHEUS_REPORTS_READ_WRITE_TOKEN', 'private-test-store');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects ownership and source URL fields and bounds notes and state maps', () => {
    expect(
      cloudReportSchema.safeParse({ ...request(), playerId }).success,
    ).toBe(false);
    expect(
      cloudReportSchema.safeParse({
        ...request(),
        screenshotURL: 'https://example.com',
      }).success,
    ).toBe(false);
    expect(
      cloudReportSchema.safeParse({
        ...request(),
        description: 'x'.repeat(10001),
      }).success,
    ).toBe(false);
    expect(
      cloudReportSchema.safeParse({
        ...request(),
        diagnostics: {
          ...diagnostics,
          snapshot: {
            ...diagnostics.snapshot,
            gameState: { totalStateCount: 1, changedValues: { secret: 42 } },
          },
        },
      }).success,
    ).toBe(false);
  });

  it('redacts URLs, filesystem paths, credentials, bearer tokens, and JSON secret fields', () => {
    const value = redactReportText(
      'url https://x.test/report?token=abc /Users/Alice/file C:\\Users\\Alice\\file token=secret Bearer bearer-secret {"api_key":"another-secret"}',
    );
    for (const privateValue of [
      'https://',
      'Alice',
      'token=secret',
      'bearer-secret',
      'another-secret',
    ]) {
      expect(value).not.toContain(privateValue);
    }
    expect(value).toContain('[URL removed]');
    expect(redactReportText('Deck1/racePAN.png')).toBe('Deck1/racePAN.png');
  });

  it('strips screenshot metadata and rejects malformed, oversized-dimension and polyglot PNGs', () => {
    expect(sanitizeReportScreenshot(screenshot(true).toString('base64'))).toBe(
      screenshot().toString('base64'),
    );
    expect(() => sanitizeReportScreenshot('<svg/>')).toThrow();
    expect(() =>
      sanitizeReportScreenshot(screenshot(false, 4097).toString('base64')),
    ).toThrow();
    expect(() =>
      sanitizeReportScreenshot(
        Buffer.concat([screenshot(), Buffer.from('<script>')]).toString(
          'base64',
        ),
      ),
    ).toThrow();
    const corrupt = screenshot();
    corrupt[corrupt.length - 1] ^= 1;
    expect(() =>
      sanitizeReportScreenshot(corrupt.toString('base64')),
    ).toThrow();
  });

  it('uploads only redacted whitelisted diagnostics to the dedicated private store', async () => {
    const input = cloudReportSchema.parse({
      ...request(),
      diagnostics,
      screenshotPNGBase64: screenshot(true).toString('base64'),
    });
    const hash = digest(JSON.stringify(input));
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: reportId,
        request_hash: hash,
        attachment_path: `reports/${playerId}/${requestId}/${hash}.json`,
      },
    ]);
    await expect(submitCloudReport(playerId, input)).resolves.toBe(reportId);
    const [pathname, body, options] = mocks.put.mock.calls[0];
    expect(pathname).toBe(`reports/${playerId}/${requestId}/${hash}.json`);
    expect(options).toMatchObject({
      token: 'private-test-store',
      access: 'private',
      addRandomSuffix: false,
    });
    expect(body).not.toContain('hide-me');
    expect(body).not.toContain('underlyingURL');
    expect(body).not.toContain('Alice');
    expect(JSON.parse(body).screenshotPNGBase64).toBe(
      screenshot().toString('base64'),
    );
  });

  it('reuses the receipt after a lost response without another upload', async () => {
    const input = request();
    mocks.sql.mockResolvedValueOnce([
      {
        id: reportId,
        request_hash: digest(JSON.stringify(input)),
        attachment_path: null,
      },
    ]);
    await expect(submitCloudReport(playerId, input)).resolves.toBe(reportId);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it('rejects a reused request ID with changed content', async () => {
    mocks.sql.mockResolvedValueOnce([
      {
        id: reportId,
        request_hash: 'different-content',
        attachment_path: null,
      },
    ]);
    await expect(submitCloudReport(playerId, request())).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('does not record receipt metadata when the private upload fails', async () => {
    mocks.sql.mockResolvedValueOnce([]);
    mocks.put.mockRejectedValueOnce(new Error('Store offline'));
    await expect(
      submitCloudReport(
        playerId,
        cloudReportSchema.parse({ ...request(), diagnostics }),
      ),
    ).rejects.toThrow('Store offline');
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });

  it('cleans only the losing content path when concurrent changed requests collide', async () => {
    const input = cloudReportSchema.parse({ ...request(), diagnostics });
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(submitCloudReport(playerId, input)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.del).toHaveBeenCalledWith(
      `reports/${playerId}/${requestId}/${digest(JSON.stringify(input))}.json`,
      { token: 'private-test-store' },
    );
  });

  it('bounds pagination and does not expose attachment paths or credentials in report lists', async () => {
    expect(parseAdminPagination(new URLSearchParams())).toEqual({
      limit: 25,
      offset: 0,
    });
    for (const query of ['limit=51', 'limit=0', 'offset=-1', 'offset=10001']) {
      expect(() => parseAdminPagination(new URLSearchParams(query))).toThrow();
    }
    const item = {
      id: reportId,
      playerId,
      authenticated: false,
      platform: 'macos',
      description: 'A report',
      sceneId: 1010,
      appVersion: '1',
      hasAttachment: true,
      status: 'new',
      createdAt: '2026-09-05T01:00:00Z',
    };
    mocks.sql.mockResolvedValueOnce([
      { item: { ...item, attachment_path: 'private-path', token: 'secret' } },
      { item },
    ]);
    const page = await listCloudReports({ limit: 1, offset: 0 });
    expect(page.nextOffset).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(JSON.stringify(page)).not.toContain('private-path');
    expect(JSON.stringify(page)).not.toContain('secret');
  });

  it('rejects an arbitrary stored URL without fetching it', async () => {
    mocks.sql.mockResolvedValueOnce([
      { attachment_path: 'https://attacker.test/payload' },
    ]);
    await expect(
      readCloudReportAttachment(reportId, 'diagnostics'),
    ).rejects.toThrow('Invalid stored report attachment path');
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('serves private attachment bytes with no-store and no public URL', async () => {
    const path = `reports/${playerId}/${requestId}/${'a'.repeat(64)}.json`;
    mocks.sql.mockResolvedValueOnce([{ attachment_path: path }]);
    mocks.get.mockResolvedValueOnce({
      statusCode: 200,
      stream: new Response(
        JSON.stringify({
          screenshotPNGBase64: screenshot().toString('base64'),
        }),
      ).body,
    });
    const response = await readCloudReportAttachment(reportId, 'screenshot');
    expect(mocks.get).toHaveBeenCalledWith(path, {
      token: 'private-test-store',
      access: 'private',
      useCache: false,
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toContain(
      'attachment;',
    );
    expect(response.headers.get('location')).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(screenshot());
  });
});
