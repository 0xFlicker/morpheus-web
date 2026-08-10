import type { ReactNode } from 'react';

export default function MorpheusLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#000' }}>{children}</div>
  );
}
