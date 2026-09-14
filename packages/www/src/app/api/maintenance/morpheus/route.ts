import { timingSafeEqual } from 'node:crypto';
import { cloudJson, cloudRoute, CloudHttpError } from '@/lib/cloud/http';
import { maintainCloudData } from '@/lib/cloud/retention';
import { maintainAppleAccounts } from '@/lib/cloud/appleAccount';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  return cloudRoute(async () => {
    const secret = process.env.CRON_SECRET;
    const actual = Buffer.from(request.headers.get('authorization') ?? '');
    const expected = Buffer.from(secret ? `Bearer ${secret}` : '');
    if (
      !secret ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new CloudHttpError(401, 'Unauthorized.');
    }
    const apple = await maintainAppleAccounts();
    return cloudJson({ ...(await maintainCloudData()), apple });
  });
}
