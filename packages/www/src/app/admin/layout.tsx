import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';

const AdminLayout = ({ children }: { children: ReactNode }) => (
  <ClerkProvider telemetry={false}>{children}</ClerkProvider>
);

export default AdminLayout;
