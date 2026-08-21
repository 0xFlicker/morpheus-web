import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
