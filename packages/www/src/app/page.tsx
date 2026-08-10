import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>Soap Bubble Productions</h1>
      <p>Morpheus is waiting.</p>
      <nav aria-label="Primary navigation">
        <Link href="/morpheus">Play Morpheus</Link>
      </nav>
    </main>
  );
}
