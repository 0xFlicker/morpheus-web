import { z } from 'zod';
import { refreshAnonymousCookie } from '@/lib/cloud/anonymousCookie';
import { cloudJson, cloudRoute, readCloudJson } from '@/lib/cloud/http';
import {
  initializeCloudPlayer,
  rateLimit,
  requireCloudPlayer,
} from '@/lib/cloud/identity';
import { CLOUD_PROTOCOL_VERSION } from '@/lib/cloud/protocol';

export const runtime = 'nodejs';

const identityRequestSchema = z
  .object({
    protocolVersion: z.literal(1),
    platform: z.enum(['web', 'ios', 'macos']),
  })
  .strict();

/** Called only after Send, before any report content leaves the device. */
export async function POST(request: Request) {
  return cloudRoute(async () => {
    const { platform } = identityRequestSchema.parse(
      await readCloudJson(request, 1024),
    );
    const { player, anonymousToken } = request.headers.has(
      'x-morpheus-player-id',
    )
      ? { player: await requireCloudPlayer(request), anonymousToken: undefined }
      : await initializeCloudPlayer(request);
    await rateLimit(`reports-identity:${player.id}`, 60, 60);
    const response = cloudJson({
      protocolVersion: CLOUD_PROTOCOL_VERSION,
      playerId: player.id,
      authenticated: player.authenticated,
      ...(anonymousToken && platform !== 'web' ? { anonymousToken } : {}),
    });
    refreshAnonymousCookie(request, response, player, platform, anonymousToken);
    return response;
  });
}
