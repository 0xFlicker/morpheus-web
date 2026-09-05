import { describe, expect, it } from 'vitest';

import { getAdminAccess, getAdminSessionAccess } from './adminAccess';

describe('getAdminSessionAccess', () => {
  it('requires an immutable admin user ID in production', () => {
    expect(() =>
      getAdminSessionAccess({
        userId: null,
        configuredAdminUserId: undefined,
        requireConfiguredAdminUserId: true,
      }),
    ).toThrow('CLERK_ADMIN_USER_ID is required in production');
  });

  it('requires a signed-in session', () => {
    expect(
      getAdminSessionAccess({
        userId: null,
        configuredAdminUserId: 'user_admin',
        requireConfiguredAdminUserId: true,
      }),
    ).toBe('signed-out');
  });

  it('rejects another Clerk user before loading their profile', () => {
    expect(
      getAdminSessionAccess({
        userId: 'user_someone_else',
        configuredAdminUserId: 'user_admin',
        requireConfiguredAdminUserId: true,
      }),
    ).toBe('rejected');
  });

  it('continues to email verification for the configured Clerk user', () => {
    expect(
      getAdminSessionAccess({
        userId: 'user_admin',
        configuredAdminUserId: 'user_admin',
        requireConfiguredAdminUserId: true,
      }),
    ).toBe('verify-email');
  });

  it('allows email-only bootstrap in development', () => {
    expect(
      getAdminSessionAccess({
        userId: 'user_admin',
        configuredAdminUserId: undefined,
        requireConfiguredAdminUserId: false,
      }),
    ).toBe('verify-email');
  });
});

describe('getAdminAccess', () => {
  it('requires a signed-in user', () => {
    expect(getAdminAccess(null)).toBe('signed-out');
  });

  it('authorizes the configured primary email address', () => {
    expect(
      getAdminAccess({
        primaryEmailAddress: {
          emailAddress: 'me@0xflick.xyz',
          verification: { status: 'verified' },
        },
      }),
    ).toBe('authorized');
  });

  it('matches the configured email address case-insensitively', () => {
    expect(
      getAdminAccess({
        primaryEmailAddress: {
          emailAddress: 'ME@0XFLICK.XYZ',
          verification: { status: 'verified' },
        },
      }),
    ).toBe('authorized');
  });

  it('rejects any other primary email address', () => {
    expect(
      getAdminAccess({
        primaryEmailAddress: {
          emailAddress: 'someone@example.com',
          verification: { status: 'verified' },
        },
      }),
    ).toBe('rejected');
  });

  it('rejects a signed-in user without a primary email address', () => {
    expect(getAdminAccess({ primaryEmailAddress: null })).toBe('rejected');
  });

  it('rejects an unverified matching primary email address', () => {
    expect(
      getAdminAccess({
        primaryEmailAddress: {
          emailAddress: 'me@0xflick.xyz',
          verification: { status: 'unverified' },
        },
      }),
    ).toBe('rejected');
  });
});
