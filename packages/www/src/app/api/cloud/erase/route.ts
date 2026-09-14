import { cloudJson, cloudRoute, requireSameOrigin } from '@/lib/cloud/http';
import { requireCloudPlayer } from '@/lib/cloud/identity';
import { eraseCloudPlayer } from '@/lib/cloud/retention';
import { CLOUD_ANONYMOUS_COOKIE } from '@/lib/cloud/protocol';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function DELETE(request: Request) {
  return cloudRoute(async () => {
    requireSameOrigin(request);
    const player = await requireCloudPlayer(request);
    await eraseCloudPlayer(player.id);
    const response = cloudJson({ erased: true });
    response.cookies.set(CLOUD_ANONYMOUS_COOKIE, '', {
      httpOnly: true,
      secure: new URL(request.url).protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return response;
  });
}
