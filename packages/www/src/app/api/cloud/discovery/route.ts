import { z } from 'zod';
import { discoverySummary } from '@/lib/cloud/discoverySummary';
import { cloudJson, cloudRoute } from '@/lib/cloud/http';
import { rateLimit, requireCloudPlayer } from '@/lib/cloud/identity';
import { readCloudSlots } from '@/lib/cloud/saveRepository';
import { LIVING_SAVE_SLOT_IDS } from '@/morpheus-app/storage/livingSaveTypes';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return cloudRoute(async () => {
    const player = await requireCloudPlayer(request);
    await rateLimit(`discovery:${player.id}`, 20, 60);
    const slotId = z
      .enum(LIVING_SAVE_SLOT_IDS)
      .parse(new URL(request.url).searchParams.get('slotId'));
    const slots = await readCloudSlots(player.id);
    return cloudJson(
      await discoverySummary(
        player.id,
        slots.find((slot) => slot.slotId === slotId)?.save ?? null,
      ),
    );
  });
}
