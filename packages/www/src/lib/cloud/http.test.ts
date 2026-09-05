import { describe, expect, it } from 'vitest';
import { CloudHttpError, readCloudJson, requireSameOrigin } from './http';

describe('cloud HTTP boundary', () => {
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request('https://www.soapbubble.xyz/api/cloud/saves', {
      method: 'PUT',
      body,
      headers: { 'content-type': 'application/json', ...headers },
    });
  it('allows same-origin browser requests and native requests without an Origin header', async () => {
    await expect(
      readCloudJson(request('{}', { origin: 'https://www.soapbubble.xyz' })),
    ).resolves.toEqual({});
    await expect(readCloudJson(request('{}'))).resolves.toEqual({});
  });
  it('rejects cross-site cookie requests, including a null origin', async () => {
    await expect(
      readCloudJson(request('{}', { origin: 'https://attacker.example' })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      readCloudJson(request('{}', { origin: 'null' })),
    ).rejects.toMatchObject({ status: 403 });
    expect(() =>
      requireSameOrigin(request('{}', { 'sec-fetch-site': 'cross-site' })),
    ).toThrow(CloudHttpError);
  });
  it('bounds actual streamed bytes even without or with a dishonest Content-Length', async () => {
    await expect(
      readCloudJson(request('"long text"'), 4),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readCloudJson(request('"long text"', { 'content-length': '2' }), 4),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readCloudJson(request('{}', { 'content-length': '9999' }), 4),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('rejects malformed JSON and unsupported content types', async () => {
    await expect(readCloudJson(request('{'))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      readCloudJson(request('{}', { 'content-type': 'text/plain' })),
    ).rejects.toMatchObject({ status: 415 });
  });
});
