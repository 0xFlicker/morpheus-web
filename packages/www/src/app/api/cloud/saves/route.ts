import { cloudJson, cloudRoute, readCloudJson } from '@/lib/cloud/http';
import { rateLimit, requireCloudPlayer } from '@/lib/cloud/identity';
import { CLOUD_PROTOCOL_VERSION, cloudWriteSchema } from '@/lib/cloud/protocol';
import { readCloudSlots, writeCloudSlot } from '@/lib/cloud/saveRepository';
import { validateCloudSave } from '@/lib/cloud/saveValidation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return cloudRoute(async () => {
    const player = await requireCloudPlayer(request);
    await rateLimit(`read:${player.id}`, 120, 60);
    return cloudJson({
      protocolVersion: CLOUD_PROTOCOL_VERSION,
      playerId: player.id,
      authenticated: player.authenticated,
      slots: await readCloudSlots(player.id),
    });
  });
}

export async function PUT(request: Request) {
  return cloudRoute(async () => {
    const player = await requireCloudPlayer(request);
    await rateLimit(`write:${player.id}`, 120, 60);
    const write = cloudWriteSchema.parse(await readCloudJson(request));
    await validateCloudSave(write.save);
    const result = await writeCloudSlot(player.id, write);
    return cloudJson(result, result.status === 'saved' ? 200 : 409);
  });
}
