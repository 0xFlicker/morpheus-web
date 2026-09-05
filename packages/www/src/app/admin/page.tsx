import { SignIn, UserButton } from '@clerk/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import type { Metadata } from 'next';

import { getAdminAccess, getAdminSessionAccess } from './adminAccess';
import styles from './admin.module.css';

export const metadata: Metadata = {
  title: 'Admin',
  robots: {
    index: false,
    follow: false,
  },
};

const RejectedAdmin = () => (
  <main className={styles.centeredPage}>
    <section className={styles.rejectedPanel}>
      <div className={styles.userControl}>
        <UserButton />
      </div>
      <p className={styles.eyebrow}>Morpheus admin</p>
      <h1>Access denied</h1>
      <p>This account is not authorized to view the admin area.</p>
    </section>
  </main>
);

const AdminPage = async () => {
  const { userId } = await auth();
  const sessionAccess = getAdminSessionAccess({
    userId,
    configuredAdminUserId: process.env.CLERK_ADMIN_USER_ID,
    requireConfiguredAdminUserId: process.env.NODE_ENV === 'production',
  });

  if (sessionAccess === 'signed-out') {
    return (
      <main className={styles.centeredPage}>
        <SignIn
          routing="hash"
          forceRedirectUrl="/admin"
          signUpForceRedirectUrl="/admin"
        />
      </main>
    );
  }

  if (sessionAccess === 'rejected') {
    return <RejectedAdmin />;
  }

  const user = await currentUser();

  if (getAdminAccess(user) !== 'authorized') {
    return <RejectedAdmin />;
  }

  return (
    <main className={styles.adminPage}>
      <header className={styles.header}>
        <h1>Bug reports</h1>
        <UserButton />
      </header>
      <section className={styles.emptyState} aria-label="Bug reports" />
    </main>
  );
};

export default AdminPage;
