import 'server-only';

import { neon } from '@neondatabase/serverless';

export function cloudDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Morpheus player storage is not configured');
  return neon(url);
}
