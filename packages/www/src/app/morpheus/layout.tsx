import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';

export default function MorpheusLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider telemetry={false} afterSignOutUrl="/morpheus">
      <div style={{ minHeight: '100dvh', background: '#000' }}>{children}</div>
    </ClerkProvider>
  );
}
