import { describe, expect, it } from 'vitest';

import { config } from './proxy';

describe('Clerk proxy matcher', () => {
  it('limits Clerk middleware to the admin and Clerk routes', () => {
    expect(config.matcher).toEqual(['/admin/:path*', '/__clerk/:path*']);
  });
});
