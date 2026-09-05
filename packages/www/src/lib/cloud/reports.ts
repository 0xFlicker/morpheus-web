import 'server-only';

import { randomUUID } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { del, get, put } from '@vercel/blob';
import { z } from 'zod';

import { calculateDiscovery, evaluateAchievements } from '@/lib/discovery';
import { cloudDatabase } from './database';
import { CloudHttpError, readCloudJson } from './http';
import { CLOUD_PROTOCOL_VERSION, cloudSaveSchema } from './protocol';
import { CLOUD_REPORT_MAX_BYTES } from './reportLimits';
import { digest } from './saveRepository';

const maxScreenshotBytes = 2 * 1024 * 1024;
const sceneId = z.number().int().positive().max(2147483647);
const optionalSceneId = sceneId.nullish();
const diagnosticText = z.string().max(10000);

// This is the native report.json shape. Object schemas deliberately discard
// unrecognized diagnostic fields, including underlyingURL and credentials.
export const reportDiagnosticsSchema = z.object({
  snapshot: z.object({
    schemaVersion: z.literal(1),
    capturedAt: z.string().max(80),
    app: z.object({ version: z.string().max(80), build: z.string().max(80) }),
    platform: z.object({
      family: z.string().max(80),
      device: z.string().max(160),
      operatingSystem: z.string().max(160),
    }),
    scene: z.object({
      sceneID: optionalSceneId,
      phase: z.string().max(160),
      surface: z.string().max(160),
      authoredYaw: z.number().int().safe(),
      pitch: z.number().int().safe(),
    }),
    gameState: z.object({
      totalStateCount: z.number().int().nonnegative().max(16384),
      changedValues: z
        .record(z.string().regex(/^\d{1,10}$/), z.number().int().safe())
        .refine((values) => Object.keys(values).length <= 16384),
    }),
    error: z
      .object({
        code: z.string().max(160),
        message: diagnosticText,
        sceneID: optionalSceneId,
        castID: optionalSceneId,
      })
      .nullish(),
  }),
  previousCrash: z
    .object({
      markedAt: z.string().max(80),
      lastSafeSceneID: optionalSceneId,
      lastSafePhase: z.string().max(160),
    })
    .nullish(),
  lastMediaFailure: z
    .object({
      schemaVersion: z.literal(1),
      occurredAt: z.string().max(80),
      sourceSceneID: optionalSceneId,
      destinationSceneID: optionalSceneId,
      castID: optionalSceneId,
      relativeMediaPath: z.string().max(1024).nullish(),
      failureSource: z.enum(['foreground', 'prefetch']),
      elapsedMilliseconds: z.number().int().nonnegative().safe(),
      attemptNumber: z.number().int().nonnegative().safe(),
      statusCode: z.number().int().min(100).max(599).nullish(),
      underlyingError: diagnosticText,
    })
    .nullish(),
});

export const cloudReportSchema = z
  .object({
    protocolVersion: z.literal(CLOUD_PROTOCOL_VERSION),
    requestId: z.uuid(),
    platform: z.enum(['web', 'ios', 'macos']),
    appVersion: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(10000),
    sceneId: optionalSceneId,
    diagnostics: reportDiagnosticsSchema.optional(),
    screenshotPNGBase64: z
      .string()
      .min(1)
      .max(Math.ceil(maxScreenshotBytes / 3) * 4)
      .optional(),
  })
  .strict();

export type CloudReport = z.infer<typeof cloudReportSchema>;

/** Diagnostic text is never trusted to contain only a friendly error message. */
export function redactReportText(value: string): string {
  return value
    .replace(
      /(?:https?|file|blob|postgres(?:ql)?):\/\/[^\s<>"']+/gi,
      '[URL removed]',
    )
    .replace(/\bBearer\s+[^\s,"']+/gi, '[credential removed]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[credential removed]',
    )
    .replace(
      /\b(?:authorization|cookie|token|[a-z_-]*[_-]token|secret|password|api[_-]?key|credential|signature)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '[credential removed]',
    )
    .replace(
      /(?<![A-Za-z0-9._-])(?:[A-Za-z]:\\|~\/|\/)[^\s<>"']+/g,
      '[path removed]',
    );
}

function redactDiagnostics(value: unknown): unknown {
  if (typeof value === 'string') return redactReportText(value);
  if (Array.isArray(value)) return value.map(redactDiagnostics);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactDiagnostics(item),
      ]),
    );
  }
  return value;
}

/** Check PNG framing/CRCs and discard ancillary metadata before private storage. */
export function sanitizeReportScreenshot(encoded: string): string {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  ) {
    throw new CloudHttpError(
      400,
      'The screenshot must be a PNG encoded as base64.',
    );
  }
  const bytes = Buffer.from(encoded, 'base64');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length > maxScreenshotBytes ||
    !bytes.subarray(0, 8).equals(signature)
  ) {
    throw new CloudHttpError(
      400,
      'The screenshot must be a PNG no larger than 2 MB.',
    );
  }
  const chunks = [signature];
  let offset = 8;
  let hasImage = false;
  let ended = false;
  let chunkCount = 0;
  while (offset + 12 <= bytes.length && !ended) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length || ++chunkCount > 10000) break;
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (
      !/^[A-Za-z]{4}$/.test(kind) ||
      crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)
    )
      break;
    if (offset === 8) {
      if (kind !== 'IHDR' || length !== 13) break;
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      if (width < 1 || height < 1 || width > 4096 || height > 4096) {
        throw new CloudHttpError(
          400,
          'The screenshot dimensions must be at most 4096 pixels.',
        );
      }
    } else if (kind === 'IHDR') break;
    if (kind === 'IDAT') hasImage = true;
    if (kind === 'IEND') {
      if (length !== 0) break;
      ended = true;
    }
    if (['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(kind)) {
      chunks.push(bytes.subarray(offset, end));
    } else if (kind[0] === kind[0].toUpperCase()) {
      break; // Unknown critical chunks are not a supported screenshot format.
    }
    offset = end;
  }
  if (!ended || !hasImage || offset !== bytes.length) {
    throw new CloudHttpError(400, 'The screenshot is not a complete PNG.');
  }
  return Buffer.concat(chunks).toString('base64');
}

function reportsToken(): string {
  const token = process.env.MORPHEUS_REPORTS_READ_WRITE_TOKEN;
  if (!token)
    throw new Error('Private Morpheus report storage is not configured');
  return token;
}

const storedReportSchema = z.object({
  id: z.uuid(),
  request_hash: z.string(),
  attachment_path: z.string().nullable(),
});

export async function submitCloudReport(
  playerId: string,
  request: CloudReport,
): Promise<string> {
  const sql = cloudDatabase();
  const requestHash = digest(JSON.stringify(request));
  const existing =
    await sql`SELECT id, request_hash, attachment_path FROM morpheus_bug_reports
    WHERE player_id = ${playerId} AND request_id = ${request.requestId}`;
  if (existing[0]) {
    const report = storedReportSchema.parse(existing[0]);
    if (report.request_hash !== requestHash)
      throw new CloudHttpError(
        409,
        'This report request was already used. Send the edited report with a new request ID.',
      );
    return report.id;
  }

  const diagnostics = request.diagnostics
    ? reportDiagnosticsSchema.parse(redactDiagnostics(request.diagnostics))
    : undefined;
  const screenshotPNGBase64 = request.screenshotPNGBase64
    ? sanitizeReportScreenshot(request.screenshotPNGBase64)
    : undefined;
  // A deterministic content path makes a lost response safe to retry. A crash
  // between Blob and SQL can leave an orphan; the retention job removes it.
  const attachmentPath =
    diagnostics || screenshotPNGBase64
      ? `reports/${playerId.toLowerCase()}/${request.requestId.toLowerCase()}/${requestHash}.json`
      : null;
  if (attachmentPath) {
    await put(
      attachmentPath,
      JSON.stringify({ diagnostics, screenshotPNGBase64 }),
      {
        token: reportsToken(),
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      },
    );
  }
  const rows = await sql`INSERT INTO morpheus_bug_reports
    (id, player_id, request_id, request_hash, platform, description, scene_id, app_version, attachment_path)
    VALUES (${randomUUID()}, ${playerId}, ${request.requestId}, ${requestHash}, ${request.platform},
      ${redactReportText(request.description).slice(0, 10000)}, ${request.sceneId ?? null},
      ${redactReportText(request.appVersion).slice(0, 80)}, ${attachmentPath})
    ON CONFLICT (player_id, request_id) DO UPDATE SET request_id = EXCLUDED.request_id
      WHERE morpheus_bug_reports.request_hash = EXCLUDED.request_hash
    RETURNING id, request_hash, attachment_path`;
  if (!rows[0]) {
    // Only this losing content hash is deleted. Never delete the winning upload.
    if (attachmentPath) await del(attachmentPath, { token: reportsToken() });
    throw new CloudHttpError(
      409,
      'This report request was already used. Send the edited report with a new request ID.',
    );
  }
  return storedReportSchema.parse(rows[0]).id;
}

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export function parseAdminPagination(parameters: URLSearchParams) {
  return paginationSchema.parse({
    limit: parameters.get('limit') ?? undefined,
    offset: parameters.get('offset') ?? undefined,
  });
}

export type AdminPagination = z.infer<typeof paginationSchema>;
export type AdminPage<T> = { items: T[]; nextOffset: number | null };

function page<T>(rows: T[], pagination: AdminPagination): AdminPage<T> {
  const nextOffset = pagination.offset + pagination.limit;
  return {
    items: rows.slice(0, pagination.limit),
    nextOffset:
      rows.length > pagination.limit && nextOffset <= 10000 ? nextOffset : null,
  };
}

const reportSummarySchema = z.object({
  id: z.uuid(),
  playerId: z.uuid().nullable(),
  authenticated: z.boolean(),
  platform: z.string(),
  description: z.string(),
  sceneId: z.number().nullable(),
  appVersion: z.string(),
  hasAttachment: z.boolean(),
  status: z.string(),
  createdAt: z.string(),
});
export type AdminReport = z.infer<typeof reportSummarySchema>;

export async function listCloudReports(
  pagination: AdminPagination,
): Promise<AdminPage<AdminReport>> {
  const sql = cloudDatabase();
  const rows = await sql`SELECT jsonb_build_object(
    'id', r.id, 'playerId', r.player_id, 'authenticated', p.clerk_user_id IS NOT NULL,
    'platform', r.platform, 'description', r.description, 'sceneId', r.scene_id,
    'appVersion', r.app_version, 'hasAttachment', r.attachment_path IS NOT NULL,
    'status', r.status, 'createdAt', r.created_at) AS item
    FROM morpheus_bug_reports r LEFT JOIN morpheus_players p ON p.id = r.player_id
    ORDER BY r.created_at DESC, r.id DESC LIMIT ${pagination.limit + 1} OFFSET ${pagination.offset}`;
  return page(
    rows.map((row) => z.object({ item: reportSummarySchema }).parse(row).item),
    pagination,
  );
}

const sessionSummarySchema = z.object({
  playerId: z.uuid(),
  sessionId: z.uuid(),
  authenticated: z.boolean(),
  platform: z.string(),
  appVersion: z.string(),
  sceneId: z.number().nullable(),
  activeRunId: z.uuid().nullable(),
  startedAt: z.string(),
  lastSeenAt: z.string(),
});
export type AdminSession = z.infer<typeof sessionSummarySchema>;

export async function listCloudSessions(
  pagination: AdminPagination,
): Promise<AdminPage<AdminSession>> {
  const sql = cloudDatabase();
  const rows = await sql`SELECT jsonb_build_object(
    'playerId', s.player_id, 'sessionId', s.session_id, 'authenticated', p.clerk_user_id IS NOT NULL,
    'platform', s.platform, 'appVersion', s.app_version, 'sceneId', s.active_scene_id,
    'activeRunId', s.active_run_id, 'startedAt', s.started_at, 'lastSeenAt', s.last_seen_at) AS item
    FROM morpheus_sessions s JOIN morpheus_players p ON p.id = s.player_id
    ORDER BY s.last_seen_at DESC, s.session_id DESC, s.player_id DESC
    LIMIT ${pagination.limit + 1} OFFSET ${pagination.offset}`;
  return page(
    rows.map((row) => z.object({ item: sessionSummarySchema }).parse(row).item),
    pagination,
  );
}

const saveSummarySchema = z.object({
  playerId: z.uuid(),
  authenticated: z.boolean(),
  slotId: z.string(),
  revision: z.number(),
  updatedAt: z.string(),
  save: cloudSaveSchema,
});
export type AdminSave = Omit<z.infer<typeof saveSummarySchema>, 'save'> & {
  runId: string;
  sceneId: number;
  source: 'played' | 'imported';
  discovery: ReturnType<typeof calculateDiscovery>;
  achievements: ReturnType<typeof evaluateAchievements>;
};

export async function listCloudSaveDiagnostics(
  pagination: AdminPagination,
): Promise<AdminPage<AdminSave>> {
  const sql = cloudDatabase();
  const rows = await sql`SELECT jsonb_build_object(
    'playerId', s.player_id, 'authenticated', p.clerk_user_id IS NOT NULL, 'slotId', s.slot_id,
    'revision', s.revision, 'updatedAt', s.updated_at, 'save', s.payload) AS item
    FROM morpheus_saves s JOIN morpheus_players p ON p.id = s.player_id
    WHERE s.payload IS NOT NULL ORDER BY s.updated_at DESC, s.player_id DESC, s.slot_id
    LIMIT ${pagination.limit + 1} OFFSET ${pagination.offset}`;
  return page(
    rows.map((row) => {
      const { save, ...summary } = z
        .object({ item: saveSummarySchema })
        .parse(row).item;
      return {
        ...summary,
        runId: save.runId,
        sceneId: save.envelope.activeSceneId,
        source: save.source,
        discovery: calculateDiscovery(save.discoveredSceneIds),
        achievements: evaluateAchievements(
          save.discoveredSceneIds,
          save.source,
        ),
      };
    }),
    pagination,
  );
}

const reportBundleSchema = z
  .object({
    diagnostics: reportDiagnosticsSchema.optional(),
    screenshotPNGBase64: z.string().optional(),
  })
  .strict();

export async function readCloudReportAttachment(
  reportId: string,
  kind: 'diagnostics' | 'screenshot' | 'manifest',
): Promise<Response> {
  const sql = cloudDatabase();
  const rows =
    await sql`SELECT attachment_path FROM morpheus_bug_reports WHERE id = ${z.uuid().parse(reportId)}`;
  const report = rows[0]
    ? z.object({ attachment_path: z.string().nullable() }).parse(rows[0])
    : null;
  if (!report?.attachment_path)
    throw new CloudHttpError(404, 'This report has no attachment.');
  // Never resolve a caller-supplied URL or an arbitrary storage key.
  if (
    !/^reports\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9]{64}\.json$/.test(
      report.attachment_path,
    )
  ) {
    throw new Error('Invalid stored report attachment path');
  }
  const result = await get(report.attachment_path, {
    token: reportsToken(),
    access: 'private',
    useCache: false,
  });
  if (!result || result.statusCode !== 200)
    throw new CloudHttpError(404, 'This report attachment is unavailable.');
  const attachmentRequest = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: result.stream,
    duplex: 'half',
  };
  const bundle = reportBundleSchema.parse(
    await readCloudJson(
      new Request('https://reports.invalid', attachmentRequest),
      CLOUD_REPORT_MAX_BYTES,
    ),
  );
  if (kind === 'manifest') {
    return Response.json(
      {
        hasDiagnostics: Boolean(bundle.diagnostics),
        hasScreenshot: Boolean(bundle.screenshotPNGBase64),
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': `attachment; filename="morpheus-report-${reportId}.${kind === 'screenshot' ? 'png' : 'json'}"`,
  };
  if (kind === 'screenshot') {
    if (!bundle.screenshotPNGBase64)
      throw new CloudHttpError(404, 'This report has no screenshot.');
    return new Response(
      new Uint8Array(
        Buffer.from(
          sanitizeReportScreenshot(bundle.screenshotPNGBase64),
          'base64',
        ),
      ),
      {
        headers: { ...headers, 'Content-Type': 'image/png' },
      },
    );
  }
  if (!bundle.diagnostics)
    throw new CloudHttpError(404, 'This report has no diagnostic attachment.');
  return new Response(
    JSON.stringify(redactDiagnostics(bundle.diagnostics), null, 2),
    {
      headers: { ...headers, 'Content-Type': 'application/json' },
    },
  );
}
