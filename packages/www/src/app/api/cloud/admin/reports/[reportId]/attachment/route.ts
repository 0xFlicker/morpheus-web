import { z } from 'zod';
import { cloudRoute } from '@/lib/cloud/http';
import { requireCloudAdmin } from '@/lib/cloud/identity';
import { readCloudReportAttachment } from '@/lib/cloud/reports';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  return cloudRoute(async () => {
    await requireCloudAdmin();
    const { reportId } = await context.params;
    const kind = z
      .enum(['diagnostics', 'screenshot', 'manifest'])
      .parse(new URL(request.url).searchParams.get('kind') ?? 'diagnostics');
    return readCloudReportAttachment(reportId, kind);
  });
}
