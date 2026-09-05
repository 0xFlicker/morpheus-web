import { cloudJson, cloudRoute, readCloudJson } from '@/lib/cloud/http';
import { z } from 'zod';
import { refreshAnonymousCookie } from '@/lib/cloud/anonymousCookie';
import { initializeCloudPlayer, rateLimit } from '@/lib/cloud/identity';
import { CLOUD_PROTOCOL_VERSION } from '@/lib/cloud/protocol';
import { cloudSessionSchema, recordCloudSession } from '@/lib/cloud/sessions';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return cloudRoute(async () => {
    const session = cloudSessionSchema.parse(
      await readCloudJson(request, 4096),
    );
    const expectedIdentity = z
      .string()
      .regex(/^(anonymous|user_[A-Za-z0-9]+)$/)
      .max(128)
      .parse(request.headers.get('x-morpheus-identity'));
    const { player, anonymousToken, associatedAnonymousPlayerId } =
      await initializeCloudPlayer(request, expectedIdentity);
    await rateLimit(`session:${player.id}`, 60, 60);
    await recordCloudSession(player.id, session);
    const response = cloudJson({
      protocolVersion: CLOUD_PROTOCOL_VERSION,
      playerId: player.id,
      authenticated: player.authenticated,
      associatedAnonymousPlayerId: associatedAnonymousPlayerId ?? null,
      ...(anonymousToken && session.platform !== 'web'
        ? { anonymousToken }
        : {}),
    });
    refreshAnonymousCookie(
      request,
      response,
      player,
      session.platform,
      anonymousToken,
    );
    return response;
  });
}
