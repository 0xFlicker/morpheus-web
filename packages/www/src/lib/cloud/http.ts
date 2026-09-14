import { NextResponse } from 'next/server';
import { z } from 'zod';

import { CLOUD_MAX_REQUEST_BYTES } from './protocol';

export class CloudHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: { code: string; retryAfterSeconds: number },
  ) {
    super(message);
  }
}

export function cloudJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function cloudRoute(
  action: () => Promise<Response>,
): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CloudHttpError) {
      const response = cloudJson(
        {
          error: error.message,
          ...(error.details ? { code: error.details.code } : {}),
        },
        error.status,
      );
      if (error.details)
        response.headers.set(
          'Retry-After',
          String(error.details.retryAfterSeconds),
        );
      return response;
    }
    if (error instanceof z.ZodError)
      return cloudJson({ error: 'Invalid Morpheus request.' }, 400);
    // Do not log database URLs, tokens, uploaded diagnostics or provider responses.
    console.error(
      'Morpheus Cloud request failed while accessing its service dependencies.',
    );
    return cloudJson(
      {
        error:
          'Cloud storage is temporarily unavailable. Your device saves are unaffected.',
      },
      503,
    );
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw new CloudHttpError(403, 'Cross-origin requests are not allowed.');
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new CloudHttpError(403, 'Cross-origin requests are not allowed.');
  }
}

export async function readCloudJson(
  request: Request,
  limit = CLOUD_MAX_REQUEST_BYTES,
): Promise<unknown> {
  requireSameOrigin(request);
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  ) {
    throw new CloudHttpError(415, 'Send Morpheus data as JSON.');
  }
  const bytes = await readCloudBody(request, limit);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new CloudHttpError(400, 'The request contains invalid JSON.');
  }
}

/** Preserve exact signed bytes while bounding streamed and declared request sizes. */
export async function readCloudBody(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const declaredLength = request.headers.get('content-length');
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > limit)
  ) {
    throw new CloudHttpError(413, 'The request is too large.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new CloudHttpError(400, 'The request is empty.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new CloudHttpError(413, 'The request is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
