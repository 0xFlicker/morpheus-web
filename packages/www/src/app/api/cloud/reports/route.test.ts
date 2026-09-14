import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireCloudPlayer: vi.fn(),
  rateLimit: vi.fn(),
  submitCloudReport: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/cloud/identity', () => mocks);
vi.mock('@/lib/cloud/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cloud/reports')>()),
  submitCloudReport: mocks.submitCloudReport,
}));

import { POST } from './route';
import { CloudHttpError } from '@/lib/cloud/http';
import { CLOUD_REPORT_MAX_BYTES } from '@/lib/cloud/reportLimits';

const playerId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const body = {
  protocolVersion: 1,
  requestId: '33333333-3333-4333-8333-333333333333',
  platform: 'web',
  appVersion: '1',
  description: 'The screen was blank.',
};
const request = (value: unknown = body, headers: Record<string, string> = {}) =>
  new Request('https://www.soapbubble.xyz/api/cloud/reports', {
    method: 'POST',
    body: JSON.stringify(value),
    headers: {
      'content-type': 'application/json',
      'x-morpheus-player-id': playerId,
      ...headers,
    },
  });

describe('explicit report upload API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireCloudPlayer.mockResolvedValue({
      id: playerId,
      authenticated: false,
    });
    mocks.submitCloudReport.mockResolvedValue(reportId);
  });
  it('accepts the verified owner and returns a receipt without issuing another identity', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      protocolVersion: 1,
      reportId,
      status: 'received',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.submitCloudReport).toHaveBeenCalledWith(playerId, body);
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      `reports:${playerId}`,
      10,
      3600,
    );
  });
  it('rejects a request without a completed identity before reading its content', async () => {
    mocks.requireCloudPlayer.mockRejectedValueOnce(
      new CloudHttpError(400, 'Reconnect this device'),
    );
    const input = request(body, { 'x-morpheus-player-id': '' });
    const response = await POST(input);
    expect(response.status).toBe(400);
    expect(input.bodyUsed).toBe(false);
    expect(mocks.submitCloudReport).not.toHaveBeenCalled();
  });
  it('rejects a rate-limited owner before consuming the report body', async () => {
    mocks.rateLimit.mockRejectedValueOnce(
      new CloudHttpError(429, 'Please try again shortly.'),
    );
    const input = request();
    expect((await POST(input)).status).toBe(429);
    expect(input.bodyUsed).toBe(false);
    expect(mocks.submitCloudReport).not.toHaveBeenCalled();
  });
  it('accepts a 2 MiB encoded screenshot together with the maximum bounded state map', async () => {
    const largeReport = {
      ...body,
      description: 'a'.repeat(10000),
      screenshotPNGBase64: Buffer.alloc(2 * 1024 * 1024).toString('base64'),
      diagnostics: {
        snapshot: {
          schemaVersion: 1,
          capturedAt: '2026-09-05T00:00:00Z',
          app: { version: '1', build: '1' },
          platform: {
            family: 'macOS',
            device: 'Mac',
            operatingSystem: 'macOS 26',
          },
          scene: {
            sceneID: 1010,
            phase: 'playing',
            surface: 'panorama',
            authoredYaw: 0,
            pitch: 0,
          },
          gameState: {
            totalStateCount: 16384,
            changedValues: Object.fromEntries(
              Array.from({ length: 16384 }, (_, index) => [
                String(1000000000 + index),
                Number.MIN_SAFE_INTEGER,
              ]),
            ),
          },
        },
      },
    };
    const wireBytes = Buffer.byteLength(JSON.stringify(largeReport));
    expect(wireBytes).toBeGreaterThan(3 * 1024 * 1024);
    expect(wireBytes).toBeLessThan(CLOUD_REPORT_MAX_BYTES);
    expect((await POST(request(largeReport))).status).toBe(201);
    // PNG validation is covered by reports.test.ts; this route test verifies wire capacity.
    expect(mocks.submitCloudReport).toHaveBeenCalledOnce();
  });
  it('rejects serialized reports above the 4 MiB cap without submitting them', async () => {
    expect(CLOUD_REPORT_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(
      (
        await POST(
          request({ ...body, description: 'a'.repeat(CLOUD_REPORT_MAX_BYTES) }),
        )
      ).status,
    ).toBe(413);
    expect(mocks.submitCloudReport).not.toHaveBeenCalled();
  });
  it('fences an account change before reading report content or uploading', async () => {
    mocks.requireCloudPlayer.mockRejectedValueOnce(
      new CloudHttpError(409, 'The account changed'),
    );
    const input = request();
    const response = await POST(input);
    expect(response.status).toBe(409);
    expect(input.bodyUsed).toBe(false);
    expect(mocks.submitCloudReport).not.toHaveBeenCalled();
  });
  it('rejects injected owner IDs and cross-site submissions', async () => {
    expect((await POST(request({ ...body, playerId }))).status).toBe(400);
    mocks.requireCloudPlayer.mockClear();
    expect(
      (await POST(request(body, { origin: 'https://attacker.test' }))).status,
    ).toBe(403);
    expect(mocks.requireCloudPlayer).not.toHaveBeenCalled();
    expect(mocks.submitCloudReport).not.toHaveBeenCalled();
  });
});
