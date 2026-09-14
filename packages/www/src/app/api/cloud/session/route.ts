import { cloudJson, cloudRoute, readCloudJson } from '@/lib/cloud/http';
import { refreshAnonymousCookie } from '@/lib/cloud/anonymousCookie';
import { rateLimit, requireCloudPlayer } from '@/lib/cloud/identity';
import { cloudSessionSchema, recordCloudSession } from '@/lib/cloud/sessions';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return cloudRoute(async () => {
    const player = await requireCloudPlayer(request);
    await rateLimit(`session:${player.id}`, 60, 60);
    const session = cloudSessionSchema.parse(
      await readCloudJson(request, 4096),
    );
    await recordCloudSession(player.id, session);
    const response = cloudJson({ ok: true });
    refreshAnonymousCookie(request, response, player, session.platform);
    return response;
  });
}
