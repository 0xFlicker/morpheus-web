import Link from 'next/link';

import styles from './scene-page.module.css';

export default function SceneNotFound() {
  return (
    <main className={`${styles.page} ${styles.notFound}`}>
      <p className={styles.kicker}>Map registry notice</p>
      <h1>Scene not found.</h1>
      <p>That number is not part of the authored Morpheus scene map.</p>
      <Link href="/scenes">Browse every scene →</Link>
    </main>
  );
}
