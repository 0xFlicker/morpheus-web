import { describe, expect, it } from 'vitest';

import { config } from './proxy';

describe('Clerk proxy matcher', () => {
  it('authenticates player and admin routes while leaving public browsing independent', () => {
    expect(config.matcher).toEqual([
      '/admin/:path*',
      '/api/cloud/:path*',
      '/morpheus/:path*',
      '/__clerk/:path*',
    ]);
  });
});
