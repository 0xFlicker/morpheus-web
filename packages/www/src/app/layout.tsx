import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/app/providers';

const siteTitle = 'Morpheus';
const siteDescription =
  'A restored interactive panoramic adventure. Explore, discover, and shape your journey.';
const deploymentUrl =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const siteUrl = deploymentUrl
  ? `https://${deploymentUrl}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s | ${siteTitle}`,
  },
  description: siteDescription,
  applicationName: siteTitle,
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
  },
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body
      style={{
        margin: 0,
        padding: 0,
        overflow: 'hidden',
      }}
    >
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
