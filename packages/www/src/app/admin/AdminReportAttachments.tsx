'use client';

import { useState } from 'react';
import { z } from 'zod';
import styles from './admin.module.css';

const manifestSchema = z.object({
  hasDiagnostics: z.boolean(),
  hasScreenshot: z.boolean(),
});

export default function AdminReportAttachments({
  reportId,
}: {
  reportId: string;
}) {
  const [manifest, setManifest] = useState<z.infer<
    typeof manifestSchema
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const url = `/api/cloud/admin/reports/${encodeURIComponent(reportId)}/attachment`;

  async function loadAttachments() {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`${url}?kind=manifest`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Report attachments unavailable');
      setManifest(manifestSchema.parse(await response.json()));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.attachments}>
      {manifest ? (
        <>
          {manifest.hasDiagnostics && (
            <a href={`${url}?kind=diagnostics`}>Download diagnostics</a>
          )}
          {manifest.hasScreenshot && (
            <a href={`${url}?kind=screenshot`}>Download screenshot</a>
          )}
        </>
      ) : (
        <button type="button" onClick={loadAttachments} disabled={loading}>
          {loading ? 'Loading attachments…' : 'View attachments'}
        </button>
      )}
      {error && (
        <span role="alert">Attachments could not be loaded. Try again.</span>
      )}
    </div>
  );
}
