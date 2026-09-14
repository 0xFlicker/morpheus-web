'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { CloudReport } from '@/lib/cloud/reports';
import { CLOUD_REPORT_MAX_BYTES } from '@/lib/cloud/reportLimits';
import styles from './cloud-player.module.css';

const receiptSchema = z.object({
  protocolVersion: z.literal(1),
  reportId: z.uuid(),
  status: z.literal('received'),
});
const reportingIdentitySchema = z.object({
  protocolVersion: z.literal(1),
  playerId: z.uuid(),
  authenticated: z.boolean(),
});
const reportFailureMessage =
  'The report could not be sent. Your note is still here; try again when connected.';
const identityChangedMessage =
  'The account on this device changed. Return to the same account to retry, or edit your note to prepare a new report.';
const reportTooLargeMessage =
  'This report is too large to send. Your note is still here. Shorten it, or use Support to send a note without game details.';

export type PreparedCloudReport = {
  readonly body: string;
  readonly platform: CloudReport['platform'];
  playerId: string | null;
  identityEstablished: boolean;
};

/** Preserve both the report bytes and confirmed owner until this request succeeds. */
export async function sendPreparedCloudReport(
  prepared: PreparedCloudReport,
  signal: AbortSignal,
): Promise<void> {
  if (
    new TextEncoder().encode(prepared.body).byteLength > CLOUD_REPORT_MAX_BYTES
  )
    throw new Error(reportTooLargeMessage);
  if (!prepared.identityEstablished) {
    const response = await fetch('/api/cloud/reports/identity', {
      method: 'POST',
      credentials: 'same-origin',
      signal,
      headers: {
        'content-type': 'application/json',
        ...(prepared.playerId
          ? { 'x-morpheus-player-id': prepared.playerId }
          : {}),
      },
      body: JSON.stringify({ protocolVersion: 1, platform: prepared.platform }),
    });
    if (response.status === 409) throw new Error(identityChangedMessage);
    if (!response.ok) throw new Error(reportFailureMessage);
    const identity = reportingIdentitySchema.parse(await response.json());
    if (prepared.playerId && prepared.playerId !== identity.playerId)
      throw new Error(identityChangedMessage);
    prepared.playerId = identity.playerId;
    prepared.identityEstablished = true;
  }
  signal.throwIfAborted();
  if (!prepared.playerId) throw new Error(reportFailureMessage);
  const response = await fetch('/api/cloud/reports', {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-morpheus-player-id': prepared.playerId,
    },
    body: prepared.body,
  });
  if (response.status === 409 || response.status === 401)
    throw new Error(identityChangedMessage);
  if (response.status === 413) throw new Error(reportTooLargeMessage);
  if (!response.ok) throw new Error(reportFailureMessage);
  receiptSchema.parse(await response.json());
}

/** Works on the public support route without a game store or Clerk provider. */
export function CloudReportForm({
  sceneId = null,
  diagnostics,
  captureDiagnostics,
  playerId,
  onClose,
}: {
  sceneId?: number | null;
  diagnostics?: CloudReport['diagnostics'];
  captureDiagnostics?: () => Pick<CloudReport, 'sceneId' | 'diagnostics'>;
  playerId?: string | null;
  onClose?: () => void;
}) {
  const [description, setDescription] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>(
    'idle',
  );
  const [failureMessage, setFailureMessage] = useState(reportFailureMessage);
  const prepared = useRef<PreparedCloudReport | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  const edited = () => {
    prepared.current = null;
    setStatus('idle');
  };
  return (
    <form
      className={styles.reportForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (
          request.current ||
          status === 'sent' ||
          description.trim().length === 0
        )
          return;
        if (!prepared.current) {
          const payload: CloudReport = {
            protocolVersion: 1,
            requestId: crypto.randomUUID(),
            platform: 'web',
            appVersion: 'web-cloud-1',
            description: `${description.trim()}${replyEmail.trim() ? `\n\nReply email: ${replyEmail.trim()}` : ''}`,
            sceneId,
            ...(diagnostics ? { diagnostics } : {}),
            ...captureDiagnostics?.(),
          };
          prepared.current = {
            body: JSON.stringify(payload),
            platform: payload.platform,
            playerId: playerId ?? null,
            identityEstablished: false,
          };
        }
        setStatus('sending');
        const controller = new AbortController();
        request.current = controller;
        const timeout = setTimeout(() => controller.abort(), 30_000);
        void sendPreparedCloudReport(prepared.current, controller.signal)
          .then(() => {
            if (!controller.signal.aborted && mounted.current)
              setStatus('sent');
          })
          .catch((error: unknown) => {
            // Retry keeps the completed identity and exact report request.
            if (mounted.current) {
              setFailureMessage(
                error instanceof Error &&
                  (error.message === identityChangedMessage ||
                    error.message === reportTooLargeMessage)
                  ? error.message
                  : reportFailureMessage,
              );
              setStatus('failed');
            }
          })
          .finally(() => {
            clearTimeout(timeout);
            if (request.current === controller) request.current = null;
          });
      }}
    >
      <label>
        How can we help?
        <textarea
          required
          maxLength={9500}
          rows={4}
          value={description}
          disabled={status === 'sending'}
          onChange={(event) => {
            setDescription(event.target.value);
            edited();
          }}
        />
      </label>
      <label>
        Reply email (optional)
        <input
          type="email"
          autoComplete="email"
          maxLength={254}
          value={replyEmail}
          disabled={status === 'sending'}
          onChange={(event) => {
            setReplyEmail(event.target.value);
            edited();
          }}
        />
      </label>
      <p>
        Send your note
        {diagnostics || captureDiagnostics
          ? ', current scene, and game state'
          : sceneId
            ? ' and current scene'
            : ''}{' '}
        to the Morpheus team at False Floor, LLC. Reports are private. Your
        email is used only to respond if you provide it.{' '}
        <a href="/privacy" target="_blank" rel="noreferrer">
          Privacy
        </a>
      </p>
      <button
        type="submit"
        disabled={
          status === 'sending' ||
          status === 'sent' ||
          description.trim().length === 0
        }
      >
        {status === 'sending'
          ? 'Sending…'
          : status === 'failed'
            ? 'Try again'
            : 'Send report'}
      </button>
      {status === 'sent' && <p role="status">Report received. Thank you.</p>}
      {status === 'failed' && <p role="status">{failureMessage}</p>}
      {onClose && (
        <button type="button" onClick={onClose}>
          Close
        </button>
      )}
    </form>
  );
}
