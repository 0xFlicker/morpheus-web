import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudReport } from '@/lib/cloud/reports';
import { CLOUD_REPORT_MAX_BYTES } from '@/lib/cloud/reportLimits';

const mocks = vi.hoisted(() => ({
  initializeCloudPlayer: vi.fn(),
  requireCloudPlayer: vi.fn(),
  anonymousCredential: vi.fn(),
  rateLimit: vi.fn(),
  submitCloudReport: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/cloud/identity', () => mocks);
vi.mock('@/lib/cloud/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cloud/reports')>()),
  submitCloudReport: mocks.submitCloudReport,
}));

import { CloudHttpError } from '@/lib/cloud/http';
import { CLOUD_ANONYMOUS_COOKIE } from '@/lib/cloud/protocol';
import { POST as establishIdentity } from '@/app/api/cloud/reports/identity/route';
import { POST as uploadReport } from '@/app/api/cloud/reports/route';
import {
  sendPreparedCloudReport,
  type PreparedCloudReport,
} from './CloudReportForm';

const report: CloudReport = {
  protocolVersion: 1,
  requestId: '33333333-3333-4333-8333-333333333333',
  platform: 'web',
  appVersion: '1',
  description: 'The screen was blank.',
};
const preparedReport = (): PreparedCloudReport => ({
  body: JSON.stringify(report),
  platform: 'web',
  playerId: null,
  identityEstablished: false,
});
const send = (prepared: PreparedCloudReport) =>
  sendPreparedCloudReport(prepared, new AbortController().signal);

/** Real route handlers; only identity/database/Blob and HTTP delivery are simulated. */
function server() {
  const players = new Map<string, string>();
  const reports = new Map<string, { id: string; report: CloudReport }>();
  let cookie = '';
  let account: string | null = null;
  let lostResponse: 'preflight' | 'upload' | null = null;
  const cookieToken = (request: Request) =>
    request.headers.get('cookie')?.split('=')[1] ?? null;
  mocks.anonymousCredential.mockImplementation(cookieToken);
  mocks.initializeCloudPlayer.mockImplementation(async (request: Request) => {
    if (account) return { player: { id: account, authenticated: true } };
    const token = cookieToken(request);
    const existing = token && players.get(token);
    if (existing) return { player: { id: existing, authenticated: false } };
    const anonymousToken = crypto.randomUUID();
    const id = crypto.randomUUID();
    players.set(anonymousToken, id);
    return { player: { id, authenticated: false }, anonymousToken };
  });
  mocks.requireCloudPlayer.mockImplementation(async (request: Request) => {
    const expected = request.headers.get('x-morpheus-player-id');
    if (!expected) throw new CloudHttpError(400, 'An identity is required.');
    const token = cookieToken(request);
    const id = account ?? (token ? players.get(token) : null);
    if (!id) throw new CloudHttpError(401, 'An identity is required.');
    if (expected !== id) throw new CloudHttpError(409, 'The account changed.');
    return { id, authenticated: account !== null };
  });
  mocks.submitCloudReport.mockImplementation(
    async (playerId: string, payload: CloudReport) => {
      const key = `${playerId}:${payload.requestId}`;
      const existing = reports.get(key);
      if (existing) {
        expect(payload).toEqual(existing.report);
        return existing.id;
      }
      const id = crypto.randomUUID();
      reports.set(key, { id, report: payload });
      return id;
    },
  );
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (cookie) headers.set('cookie', cookie);
    const request = new Request(`https://www.soapbubble.xyz${path}`, {
      ...init,
      headers,
    });
    const isPreflight = path === '/api/cloud/reports/identity';
    if (isPreflight)
      expect(JSON.parse(String(init?.body))).toEqual({
        protocolVersion: 1,
        platform: 'web',
      });
    const response = await (isPreflight
      ? establishIdentity(request)
      : uploadReport(request));
    if (lostResponse === (isPreflight ? 'preflight' : 'upload')) {
      lostResponse = null;
      throw new TypeError(
        'The connection was lost after the server completed.',
      );
    }
    const nextCookie = response.headers.get('set-cookie');
    if (nextCookie) {
      expect(nextCookie).toContain('HttpOnly');
      cookie = nextCookie.split(';')[0];
      expect(cookie.startsWith(`${CLOUD_ANONYMOUS_COOKIE}=`)).toBe(true);
    }
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    players,
    reports,
    fetchMock,
    loseNextResponse: (kind: 'preflight' | 'upload') => {
      lostResponse = kind;
    },
    changeAccount: (playerId: string) => {
      account = playerId;
    },
  };
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('report submission retry ownership', () => {
  it('checks serialized UTF-8 bytes locally before sending content or establishing an identity', async () => {
    const remote = server();
    const prepared = {
      ...preparedReport(),
      body: JSON.stringify({
        ...report,
        description: '💫'.repeat(CLOUD_REPORT_MAX_BYTES / 4),
      }),
    };
    expect(prepared.body.length).toBeLessThan(CLOUD_REPORT_MAX_BYTES);
    expect(new TextEncoder().encode(prepared.body).byteLength).toBeGreaterThan(
      CLOUD_REPORT_MAX_BYTES,
    );
    await expect(send(prepared)).rejects.toThrow(
      'This report is too large to send.',
    );
    expect(remote.fetchMock).not.toHaveBeenCalled();
    expect(prepared.identityEstablished).toBe(false);
  });

  it('explains a transport size rejection without changing the prepared report', async () => {
    const prepared = {
      ...preparedReport(),
      identityEstablished: true,
      playerId: crypto.randomUUID(),
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: 'The request is too large.' },
            { status: 413 },
          ),
        ),
    );
    await expect(send(prepared)).rejects.toThrow(
      'This report is too large to send.',
    );
    expect(prepared.body).toBe(JSON.stringify(report));
    expect(prepared.identityEstablished).toBe(true);
  });

  it('sends no report when the first identity response is lost, then retries with a completed credential', async () => {
    const remote = server();
    const prepared = preparedReport();
    remote.loseNextResponse('preflight');
    await expect(send(prepared)).rejects.toThrow('connection was lost');
    expect(prepared.identityEstablished).toBe(false);
    expect(remote.reports.size).toBe(0);
    expect(mocks.submitCloudReport).not.toHaveBeenCalled();
    await send(prepared);
    expect(remote.players.size).toBe(2); // The orphan identity never had report content.
    expect(remote.reports.size).toBe(1);
    expect(prepared.identityEstablished).toBe(true);
    expect(mocks.submitCloudReport).toHaveBeenCalledWith(
      prepared.playerId,
      report,
    );
  });

  it('retries a lost upload response with the same completed identity and exact report bytes', async () => {
    const remote = server();
    const prepared = preparedReport();
    remote.loseNextResponse('upload');
    await expect(send(prepared)).rejects.toThrow('connection was lost');
    const selectedPlayer = prepared.playerId;
    expect(remote.reports.size).toBe(1);
    await send(prepared);
    expect(prepared.playerId).toBe(selectedPlayer);
    expect(remote.players.size).toBe(1);
    expect(remote.reports.size).toBe(1);
    expect(mocks.initializeCloudPlayer).toHaveBeenCalledOnce();
    const uploads = remote.fetchMock.mock.calls.filter(
      ([path]) => path === '/api/cloud/reports',
    );
    expect(uploads).toHaveLength(2);
    for (const [, init] of uploads) {
      expect(init?.body).toBe(prepared.body);
      expect(new Headers(init?.headers).get('x-morpheus-player-id')).toBe(
        selectedPlayer,
      );
    }
  });

  it('never rebinds an already submitted payload when an account changes before retry', async () => {
    const remote = server();
    const prepared = preparedReport();
    remote.loseNextResponse('upload');
    await expect(send(prepared)).rejects.toThrow();
    const originalPlayer = prepared.playerId;
    remote.changeAccount(crypto.randomUUID());
    await expect(send(prepared)).rejects.toThrow(
      'account on this device changed',
    );
    expect(prepared.playerId).toBe(originalPlayer);
    expect(mocks.initializeCloudPlayer).toHaveBeenCalledOnce();
    expect(mocks.submitCloudReport).toHaveBeenCalledOnce();
    expect(remote.reports.size).toBe(1);
  });

  it('fences a supplied game identity before sending content if the cookie already changed', async () => {
    const remote = server();
    const prepared = { ...preparedReport(), playerId: crypto.randomUUID() };
    remote.changeAccount(crypto.randomUUID());
    await expect(send(prepared)).rejects.toThrow(
      'account on this device changed',
    );
    expect(prepared.identityEstablished).toBe(false);
    expect(mocks.initializeCloudPlayer).not.toHaveBeenCalled();
    expect(mocks.submitCloudReport).not.toHaveBeenCalled();
    expect(remote.fetchMock).toHaveBeenCalledOnce();
  });
});
