import type { Metadata } from 'next';

import { Client } from './client';

export const metadata: Metadata = {
  title: 'Play Morpheus',
  description: 'Play the restored 1998 panoramic adventure Morpheus.',
};

type MorpheusPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MorpheusPage({
  searchParams,
}: MorpheusPageProps) {
  const query = await searchParams;
  const mcpSessionName = typeof query.mcp === 'string' ? query.mcp : null;

  return <Client mcpSessionName={mcpSessionName} />;
}
