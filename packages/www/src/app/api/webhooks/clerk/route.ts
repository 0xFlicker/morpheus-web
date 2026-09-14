import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { NextRequest } from 'next/server';
import {
  cloudJson,
  cloudRoute,
  CloudHttpError,
  readCloudBody,
} from '@/lib/cloud/http';
import { handleAppleClerkDeletion } from '@/lib/cloud/appleAccount';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return cloudRoute(async () => {
    if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET)
      throw new Error('Clerk webhook is not configured');
    const body = await readCloudBody(request, 256 * 1024);
    const signedRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body,
    });
    const event = await verifyWebhook(signedRequest).catch(() => {
      throw new CloudHttpError(400, 'Invalid webhook signature.');
    });
    if (event.type === 'user.deleted') {
      if (!event.data.id)
        throw new CloudHttpError(400, 'Missing deleted account.');
      await handleAppleClerkDeletion(event.data.id);
    }
    return cloudJson({ received: true });
  });
}
