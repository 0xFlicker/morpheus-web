import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';

import { LIVING_SAVE_SLOT_IDS } from '@/morpheus-app/storage/livingSaveTypes';
import { cloudDatabase } from './database';
import { CloudHttpError } from './http';
import {
  cloudProgressKey,
  cloudSlotSchema,
  cloudWriteResultSchema,
  type CloudSlot,
  type CloudWrite,
} from './protocol';

export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const storedSlotSchema = z.object({ slot: cloudSlotSchema });

export async function readCloudSlots(playerId: string): Promise<CloudSlot[]> {
  const sql = cloudDatabase();
  const rows = await sql`SELECT jsonb_build_object(
    'slotId', slot_id, 'revision', revision, 'save', payload, 'updatedAt', updated_at
  ) AS slot FROM morpheus_saves WHERE player_id = ${playerId}`;
  const slots = rows.map((row) => storedSlotSchema.parse(row).slot);
  return LIVING_SAVE_SLOT_IDS.map(
    (slotId) =>
      slots.find((slot) => slot.slotId === slotId) ?? {
        slotId,
        revision: 0,
        save: null,
        updatedAt: null,
      },
  );
}

export async function writeCloudSlot(playerId: string, request: CloudWrite) {
  const sql = cloudDatabase();
  const rows = await sql`SELECT morpheus_write_save(
    ${playerId}::uuid, ${request.slotId}, ${request.expectedRevision}::bigint,
    ${request.mutationId}::uuid, ${request.deviceId}::uuid,
    ${request.save === null ? null : JSON.stringify(request.save)}::jsonb,
    ${digest(cloudProgressKey(request.save))}, ${digest(JSON.stringify(request))}
  ) AS result`;
  const quota = z
    .object({
      result: z.object({
        status: z.literal('quota-exceeded'),
        retryAfterSeconds: z.number().int().positive(),
      }),
    })
    .safeParse(rows[0]);
  if (quota.success)
    throw new CloudHttpError(
      429,
      'Cloud save activity has reached its temporary limit. Your progress is saved on this device.',
      {
        code: 'save-quota-exceeded',
        retryAfterSeconds: quota.data.result.retryAfterSeconds,
      },
    );
  return z.object({ result: cloudWriteResultSchema }).parse(rows[0]).result;
}
