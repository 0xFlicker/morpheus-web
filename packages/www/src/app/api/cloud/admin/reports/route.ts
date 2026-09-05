import { cloudJson, cloudRoute } from '@/lib/cloud/http';
import { requireCloudAdmin } from '@/lib/cloud/identity';
import { listCloudReports, parseAdminPagination } from '@/lib/cloud/reports';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return cloudRoute(async () => {
    await requireCloudAdmin();
    return cloudJson(
      await listCloudReports(
        parseAdminPagination(new URL(request.url).searchParams),
      ),
    );
  });
}
