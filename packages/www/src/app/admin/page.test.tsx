import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  signInProps: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  SignIn: (props: Record<string, unknown>) => {
    clerkMocks.signInProps(props);
    return null;
  },
  UserButton: () => null,
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: clerkMocks.auth,
  currentUser: clerkMocks.currentUser,
}));

import AdminPage from './page';

describe('AdminPage', () => {
  beforeEach(() => {
    clerkMocks.auth.mockReset();
    clerkMocks.currentUser.mockReset();
    clerkMocks.signInProps.mockReset();
    vi.stubEnv('CLERK_ADMIN_USER_ID', 'user_admin');
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns sign-in and sign-up completions to /admin', async () => {
    clerkMocks.auth.mockResolvedValue({ userId: null });

    renderToStaticMarkup(await AdminPage());

    expect(clerkMocks.signInProps).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRedirectUrl: '/admin',
        signUpForceRedirectUrl: '/admin',
      }),
    );
  });

  it('rejects another Clerk user without loading their profile', async () => {
    clerkMocks.auth.mockResolvedValue({ userId: 'user_someone_else' });

    const markup = renderToStaticMarkup(await AdminPage());

    expect(markup).toContain('Access denied');
    expect(clerkMocks.currentUser).not.toHaveBeenCalled();
  });

  it('renders the empty bug-report shell for the verified owner', async () => {
    clerkMocks.auth.mockResolvedValue({ userId: 'user_admin' });
    clerkMocks.currentUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: 'me@0xflick.xyz',
        verification: { status: 'verified' },
      },
    });

    const markup = renderToStaticMarkup(await AdminPage());

    expect(markup).toContain('Bug reports');
    expect(markup).not.toContain('Access denied');
  });
});
