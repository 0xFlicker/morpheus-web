const ADMIN_EMAIL = 'me@0xflick.xyz';

type AdminIdentity = {
  primaryEmailAddress: {
    emailAddress: string;
    verification: {
      status: string;
    } | null;
  } | null;
};

export type AdminAccess = 'signed-out' | 'authorized' | 'rejected';
export type AdminSessionAccess = 'signed-out' | 'rejected' | 'verify-email';

export const getAdminSessionAccess = ({
  userId,
  configuredAdminUserId,
  requireConfiguredAdminUserId,
}: {
  userId: string | null;
  configuredAdminUserId: string | undefined;
  requireConfiguredAdminUserId: boolean;
}): AdminSessionAccess => {
  if (!configuredAdminUserId && requireConfiguredAdminUserId) {
    throw new Error('CLERK_ADMIN_USER_ID is required in production');
  }

  if (!userId) {
    return 'signed-out';
  }

  return configuredAdminUserId && userId !== configuredAdminUserId
    ? 'rejected'
    : 'verify-email';
};

export const getAdminAccess = (user: AdminIdentity | null): AdminAccess => {
  if (!user) {
    return 'signed-out';
  }

  return user.primaryEmailAddress?.verification?.status === 'verified' &&
    user.primaryEmailAddress.emailAddress.toLowerCase() === ADMIN_EMAIL
    ? 'authorized'
    : 'rejected';
};
