import { cloudJson, cloudRoute, readCloudJson } from '@/lib/cloud/http';
import { requireAppleAccountIdentity } from '@/lib/cloud/appleAuth';
import { saveAppleAuthorization } from '@/lib/cloud/appleGrant';
import { appleAuthorizationSchema } from '@/lib/cloud/appleProtocol';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  return cloudRoute(async () => {
    const authorization = appleAuthorizationSchema.parse(
      await readCloudJson(request, 24 * 1024),
    );
    const userId = await requireAppleAccountIdentity(request);
    await saveAppleAuthorization(userId, authorization);
    return cloudJson({ protocolVersion: 1, stored: true });
  });
}
