import { cloudJson, cloudRoute } from '@/lib/cloud/http';
import { requireCloudAdmin } from '@/lib/cloud/identity';
import {
  listCloudSaveDiagnostics,
  parseAdminPagination,
} from '@/lib/cloud/reports';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return cloudRoute(async () => {
    await requireCloudAdmin();
    return cloudJson(
      await listCloudSaveDiagnostics(
        parseAdminPagination(new URL(request.url).searchParams),
      ),
    );
  });
}
