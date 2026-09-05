import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './legal.module.css';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header>
        <Link href="/">Soap Bubble Productions</Link>
        <Link href="/morpheus">Play Morpheus</Link>
      </header>
      <main>{children}</main>
      <footer>
        <span>False Floor, LLC</span>
        <nav aria-label="Policies and support">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/support">Contact</Link>
        </nav>
      </footer>
    </div>
  );
}
