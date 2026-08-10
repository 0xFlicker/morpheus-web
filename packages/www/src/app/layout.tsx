import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const siteTitle = 'Soap Bubble Productions';
const siteDescription =
  'The home of Morpheus, the restored 1998 panoramic adventure from Soap Bubble Productions.';
const configuredUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL;
const siteUrl = configuredUrl
  ? configuredUrl.startsWith('http')
    ? configuredUrl
    : `https://${configuredUrl}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteTitle} · Morpheus`,
    template: `%s · ${siteTitle}`,
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
      }}
    >
      {children}
    </body>
  </html>
);

export default RootLayout;
