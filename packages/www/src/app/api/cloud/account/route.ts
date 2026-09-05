import { z } from 'zod';
import {
  cloudJson,
  cloudRoute,
  CloudHttpError,
  readCloudJson,
  requireSameOrigin,
} from '@/lib/cloud/http';
import { requireAppleAccountIdentity } from '@/lib/cloud/appleAuth';
import {
  accountDeletionSchema,
  deletionReceipt,
  deletionTokenSchema,
} from '@/lib/cloud/appleProtocol';
import {
  beginAccountDeletion,
  findDeletionReceipt,
} from '@/lib/cloud/appleRepository';
import {
  processAccountDeletion,
  processAppleRevocations,
} from '@/lib/cloud/appleAccount';
import { rateLimit } from '@/lib/cloud/identity';
import { digest } from '@/lib/cloud/saveRepository';

export const runtime = 'nodejs';
export const maxDuration = 60;

function recoveryToken(request: Request): string {
  const token = deletionTokenSchema.safeParse(
    request.headers.get('x-morpheus-deletion-token'),
  );
  if (!token.success)
    throw new CloudHttpError(
      400,
      'A valid account deletion recovery token is required.',
    );
  return token.data;
}

async function respond(id: string, token: string) {
  let row = await findDeletionReceipt(id, token);
  if (!row)
    throw new CloudHttpError(404, 'Account deletion receipt was not found.');
  if (row.status === 'pending') {
    await processAccountDeletion(id);
    row = await findDeletionReceipt(id, token);
  }
  if (!row) throw new Error('Account deletion receipt disappeared');
  // Revocation is independent; a provider/storage outage must not hide confirmed deletion.
  if (row.apple_status === 'queued') {
    try {
      await processAppleRevocations(id);
    } catch {
      console.warn('Morpheus Apple revocation remains queued for maintenance.');
    }
    row = (await findDeletionReceipt(id, token)) ?? row;
  }
  const response = cloudJson(
    deletionReceipt(row),
    row.status === 'deleted' ? 200 : 202,
  );
  if (row.status === 'pending') response.headers.set('Retry-After', '60');
  return response;
}

export async function DELETE(request: Request) {
  return cloudRoute(async () => {
    const { deletionId } = accountDeletionSchema.parse(
      await readCloudJson(request, 1024),
    );
    const token = recoveryToken(request);
    // Possession can resume only a previously authorized, immutable deletion target.
    // Check before Clerk auth: its user/session may already have been deleted.
    if (!(await findDeletionReceipt(deletionId, token))) {
      const userId = await requireAppleAccountIdentity(request).catch(
        (error: unknown) => {
          if (error instanceof CloudHttpError && error.status === 401)
            throw new CloudHttpError(
              404,
              'Account deletion receipt was not found.',
            );
          throw error;
        },
      );
      await rateLimit(`account-delete:${digest(userId)}`, 10, 86400);
      await beginAccountDeletion(deletionId, token, userId);
    }
    return respond(deletionId, token);
  });
}

export async function GET(request: Request) {
  return cloudRoute(async () => {
    requireSameOrigin(request);
    const id = z
      .uuid()
      .parse(new URL(request.url).searchParams.get('deletionId'))
      .toLowerCase();
    return respond(id, recoveryToken(request));
  });
}
