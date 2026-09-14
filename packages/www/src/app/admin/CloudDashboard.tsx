import Link from 'next/link';
import { z } from 'zod';
import type { ReactNode } from 'react';

import {
  listCloudReports,
  listCloudSaveDiagnostics,
  listCloudSessions,
  parseAdminPagination,
  type AdminReport,
  type AdminSave,
  type AdminSession,
} from '@/lib/cloud/reports';
import AdminReportAttachments from './AdminReportAttachments';
import styles from './admin.module.css';

type View = 'reports' | 'sessions' | 'saves';
export type AdminSearchParameters = Record<
  string,
  string | string[] | undefined
>;

function timestamp(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function Player({
  id,
  authenticated,
}: {
  id: string | null;
  authenticated: boolean;
}) {
  return (
    <span className={styles.player}>
      <span>{authenticated ? 'Signed in' : 'Anonymous'}</span>
      <code title={id ?? undefined}>{id ? id.slice(0, 8) : 'Deleted'}</code>
    </span>
  );
}

export function AdminReportsTable({
  reports,
}: {
  reports: readonly AdminReport[];
}) {
  if (reports.length === 0)
    return <p className={styles.emptyState}>No bug reports on this page.</p>;
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>
          Submitted bug reports
        </caption>
        <thead>
          <tr>
            <th>Submitted · UTC</th>
            <th>Player</th>
            <th>Game</th>
            <th>Report</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id}>
              <td>
                <time dateTime={report.createdAt}>
                  {timestamp(report.createdAt)}
                </time>
                <span className={styles.meta}>{report.status}</span>
              </td>
              <td>
                <Player
                  id={report.playerId}
                  authenticated={report.authenticated}
                />
              </td>
              <td>
                {report.platform}{' '}
                <span className={styles.meta}>
                  v{report.appVersion} · Scene {report.sceneId ?? '—'}
                </span>
              </td>
              <td className={styles.reportColumn}>
                <details>
                  <summary>
                    {report.description.slice(0, 180)}
                    {report.description.length > 180 ? '…' : ''}
                  </summary>
                  <p className={styles.description}>{report.description}</p>
                  <code className={styles.meta}>Report {report.id}</code>
                  {report.hasAttachment && (
                    <AdminReportAttachments reportId={report.id} />
                  )}
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminSessionsTable({
  sessions,
}: {
  sessions: readonly AdminSession[];
}) {
  if (sessions.length === 0)
    return (
      <p className={styles.emptyState}>No recorded sessions on this page.</p>
    );
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>
          Recent game sessions
        </caption>
        <thead>
          <tr>
            <th>Last seen · UTC</th>
            <th>Player</th>
            <th>Platform</th>
            <th>Session</th>
            <th>Scene</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={`${session.playerId}:${session.sessionId}`}>
              <td>
                <time dateTime={session.lastSeenAt}>
                  {timestamp(session.lastSeenAt)}
                </time>
                <span className={styles.meta}>
                  Started {timestamp(session.startedAt)}
                </span>
              </td>
              <td>
                <Player
                  id={session.playerId}
                  authenticated={session.authenticated}
                />
              </td>
              <td>
                {session.platform}
                <span className={styles.meta}>v{session.appVersion}</span>
              </td>
              <td>
                <code title={session.sessionId}>
                  {session.sessionId.slice(0, 8)}
                </code>
                <span className={styles.meta}>
                  Run {session.activeRunId?.slice(0, 8) ?? '—'}
                </span>
              </td>
              <td>{session.sceneId ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminSavesTable({ saves }: { saves: readonly AdminSave[] }) {
  if (saves.length === 0)
    return <p className={styles.emptyState}>No cloud saves on this page.</p>;
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>
          Discovery and achievement diagnostics
        </caption>
        <thead>
          <tr>
            <th>Updated · UTC</th>
            <th>Player / save</th>
            <th>Discovery</th>
            <th>Observed achievements</th>
          </tr>
        </thead>
        <tbody>
          {saves.map((save) => (
            <tr key={`${save.playerId}:${save.slotId}`}>
              <td>
                <time dateTime={save.updatedAt}>
                  {timestamp(save.updatedAt)}
                </time>
                <span className={styles.meta}>{save.source} · Unverified</span>
              </td>
              <td>
                <Player id={save.playerId} authenticated={save.authenticated} />
                <span className={styles.meta}>
                  {save.slotId} · revision {save.revision} · Scene{' '}
                  {save.sceneId}
                </span>
                <code className={styles.meta} title={save.runId}>
                  Run {save.runId.slice(0, 8)}
                </code>
              </td>
              <td>
                <strong className={styles.percentage}>
                  {save.discovery.overall.percent}%
                </strong>
                <span className={styles.meta}>
                  {save.discovery.overall.discovered} of{' '}
                  {save.discovery.overall.total} locations
                </span>
                <details>
                  <summary>
                    Sections · catalog {save.discovery.catalogVersion}
                  </summary>
                  <dl className={styles.sectionProgress}>
                    {save.discovery.sections.map((section) => (
                      <div key={section.id}>
                        <dt>{section.label}</dt>
                        <dd>
                          {section.percent}% · {section.discovered}/
                          {section.total}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </td>
              <td>
                {save.achievements.length > 0 ? (
                  <ul className={styles.achievements}>
                    {save.achievements.map((achievement) => (
                      <li key={achievement.id}>{achievement.title}</li>
                    ))}
                  </ul>
                ) : (
                  'None observed'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function content(
  view: View,
  pagination: { limit: number; offset: number },
): Promise<{ table: ReactNode; nextOffset: number | null }> {
  switch (view) {
    case 'reports': {
      const page = await listCloudReports(pagination);
      return {
        table: <AdminReportsTable reports={page.items} />,
        nextOffset: page.nextOffset,
      };
    }
    case 'sessions': {
      const page = await listCloudSessions(pagination);
      return {
        table: <AdminSessionsTable sessions={page.items} />,
        nextOffset: page.nextOffset,
      };
    }
    case 'saves': {
      const page = await listCloudSaveDiagnostics(pagination);
      return {
        table: <AdminSavesTable saves={page.items} />,
        nextOffset: page.nextOffset,
      };
    }
  }
}

export default async function CloudDashboard({
  searchParams,
}: {
  searchParams: AdminSearchParameters;
}) {
  const view = z
    .enum(['reports', 'sessions', 'saves'])
    .catch('reports')
    .parse(searchParams.view);
  const parameters = new URLSearchParams();
  if (typeof searchParams.offset === 'string')
    parameters.set('offset', searchParams.offset);
  let body: ReactNode;
  try {
    const pagination = parseAdminPagination(parameters);
    const { table, nextOffset } = await content(view, pagination);
    body = (
      <>
        {table}
        <nav className={styles.pagination} aria-label="Results pages">
          {pagination.offset > 0 && (
            <Link
              href={`/admin?view=${view}&offset=${Math.max(0, pagination.offset - pagination.limit)}`}
            >
              Previous
            </Link>
          )}
          <span>
            Page {Math.floor(pagination.offset / pagination.limit) + 1}
          </span>
          {nextOffset !== null && (
            <Link href={`/admin?view=${view}&offset=${nextOffset}`}>Next</Link>
          )}
        </nav>
      </>
    );
  } catch {
    body = (
      <p className={styles.emptyState} role="status">
        Cloud records could not be loaded.{' '}
        <Link href={`/admin?view=${view}`}>Try again</Link>
      </p>
    );
  }
  return (
    <section className={styles.dashboard} aria-label="Morpheus cloud records">
      <nav className={styles.tabs} aria-label="Admin views">
        <Link
          href="/admin?view=reports"
          aria-current={view === 'reports' ? 'page' : undefined}
        >
          Bug reports
        </Link>
        <Link
          href="/admin?view=sessions"
          aria-current={view === 'sessions' ? 'page' : undefined}
        >
          Sessions
        </Link>
        <Link
          href="/admin?view=saves"
          aria-current={view === 'saves' ? 'page' : undefined}
        >
          Discovery & achievements
        </Link>
      </nav>
      <p className={styles.viewNote}>
        {view === 'reports'
          ? 'Reports are sent by players. Attachments stay private and are available only here.'
          : view === 'sessions'
            ? 'Recent service activity for save continuity and diagnostics. Anonymous players use an installation identity.'
            : 'Discovery is calculated from recorded locations. Achievement matches are for admin testing; uploaded saves do not prove legal play.'}
      </p>
      {body}
    </section>
  );
}
