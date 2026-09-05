import {
  cloudJson,
  cloudRoute,
  readCloudJson,
  requireSameOrigin,
} from '@/lib/cloud/http';
import { rateLimit, requireCloudPlayer } from '@/lib/cloud/identity';
import { CLOUD_PROTOCOL_VERSION } from '@/lib/cloud/protocol';
import { CLOUD_REPORT_MAX_BYTES } from '@/lib/cloud/reportLimits';
import { cloudReportSchema, submitCloudReport } from '@/lib/cloud/reports';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return cloudRoute(async () => {
    requireSameOrigin(request);
    // Establish the credential in a completed, content-free preflight. A lost
    // upload response can then only retry against this same verified owner.
    const player = await requireCloudPlayer(request);
    await rateLimit(`reports:${player.id}`, 10, 3600);
    const report = cloudReportSchema.parse(
      await readCloudJson(request, CLOUD_REPORT_MAX_BYTES),
    );
    const reportId = await submitCloudReport(player.id, report);
    return cloudJson(
      {
        protocolVersion: CLOUD_PROTOCOL_VERSION,
        reportId,
        status: 'received',
      },
      201,
    );
  });
}
