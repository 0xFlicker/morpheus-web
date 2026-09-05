'use client';

import { SignInButton, UserButton, useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  calculateDiscovery,
  getDiscoverySection,
  DISCOVERY_SECTION_LABELS,
} from '@/lib/discovery';
import { useAppSelector } from '@/morpheus-app/store/hooks';
import { useMorpheusCloud, type CloudContextValue } from './CloudProvider';
import styles from './cloud-player.module.css';

const comparisonSchema = z.object({
  comparison: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('available'),
      averagePercent: z.number(),
      otherPlayerCount: z.number(),
      cohortLabel: z.string(),
    }),
    z.object({ status: z.literal('unavailable'), reason: z.string() }),
  ]),
});

export function DiscoverySummary({ overlay = false }: { overlay?: boolean }) {
  const cloud = useMorpheusCloud();
  const activeSlotId = useAppSelector(
    (state) => state.livingSaves.runtimeSlotId,
  );
  const activeSceneId = useAppSelector((state) => state.scene.activeSceneId);
  const [comparison, setComparison] = useState<
    z.infer<typeof comparisonSchema>['comparison'] | null
  >(null);
  const save = activeSlotId
    ? cloud?.snapshot?.metadata.slots[activeSlotId].save
    : null;
  const progress = save ? calculateDiscovery(save.discoveredSceneIds) : null;
  const section = progress?.sections.find(
    (candidate) =>
      candidate.id ===
      (activeSceneId ? getDiscoverySection(activeSceneId) : undefined),
  );
  const playerId = cloud?.snapshot?.metadata.playerId;
  const runId = save?.runId;
  const acknowledgedRevision = activeSlotId
    ? cloud?.snapshot?.metadata.slots[activeSlotId].acknowledgedRevision
    : null;
  useEffect(() => {
    setComparison(null);
    if (
      !overlay ||
      !progress?.completed ||
      cloud?.status !== 'ready' ||
      !activeSlotId
    )
      return;
    const controller = new AbortController();
    void fetch(`/api/cloud/discovery?slotId=${activeSlotId}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: playerId ? { 'x-morpheus-player-id': playerId } : {},
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Discovery comparison unavailable.');
        const parsed = comparisonSchema.parse(await response.json());
        if (!controller.signal.aborted) setComparison(parsed.comparison);
      })
      .catch(() => {
        if (!controller.signal.aborted) setComparison(null);
      });
    return () => controller.abort();
  }, [
    activeSlotId,
    acknowledgedRevision,
    cloud?.status,
    overlay,
    playerId,
    progress?.completed,
    runId,
  ]);
  if (!progress) return null;
  return (
    <aside
      className={`${styles.discovery} ${overlay ? styles.overlay : ''}`}
      aria-label="Journey discovery"
    >
      <span>{progress.overall.percent}% discovered</span>
      {section && (
        <span>
          {section.label} {section.percent}%
        </span>
      )}
      {progress.completed && overlay && (
        <p>
          Your journey revealed {progress.overall.discovered} of{' '}
          {progress.overall.total} locations.
          {comparison?.status === 'available' && (
            <>
              {' '}
              Other players discovered {comparison.averagePercent}% on average
              across {comparison.otherPlayerCount} players’ best currently saved
              completed journeys.
            </>
          )}
        </p>
      )}
    </aside>
  );
}

export function CloudPlayerDetails({
  showNotice = false,
}: {
  showNotice?: boolean;
}) {
  const cloud = useMorpheusCloud();
  return cloud ? (
    <ConnectedCloudPlayerDetails cloud={cloud} showNotice={showNotice} />
  ) : null;
}

function ConnectedCloudPlayerDetails({
  cloud,
  showNotice,
}: {
  cloud: CloudContextValue;
  showNotice: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const [resolving, setResolving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [erasing, setErasing] = useState(false);
  const [erasedPlayerId, setErasedPlayerId] = useState<string | null>(null);
  const erased =
    erasedPlayerId !== null &&
    erasedPlayerId === cloud.snapshot?.metadata.playerId &&
    !cloud.snapshot?.metadata.onlineServicesEnabled;
  return (
    <div className={styles.details}>
      <div className={styles.account}>
        {isLoaded &&
          (isSignedIn ? (
            <>
              <UserButton />
              <span>
                {cloud.status === 'ready' ? 'Journeys connected' : 'Signed in'}
              </span>
            </>
          ) : (
            <SignInButton mode="modal">
              <button type="button" onClick={cloud.acknowledgeNotice}>
                Sign in to continue on your other devices
              </button>
            </SignInButton>
          ))}
        {cloud.status === 'offline' && (
          <span className={styles.connection}>
            Saved on this device. Reconnecting when available.
          </span>
        )}
      </div>
      {showNotice && cloud.snapshot?.metadata.noticeAcknowledgedAt === null && (
        <p className={styles.notice}>
          Beginning or continuing a journey enables online saves and functional
          session details for resume and support. No data is sold.{' '}
          <a href="/privacy" target="_blank" rel="noreferrer">
            Privacy
          </a>{' '}
          ·{' '}
          <a href="/terms" target="_blank" rel="noreferrer">
            Terms
          </a>
        </p>
      )}
      {!showNotice && <DiscoverySummary />}
      <details className={styles.privacy}>
        <summary>Privacy</summary>
        <p>
          Online services store your progress and functional session details.
          You can continue playing on this device with online services stopped.{' '}
          <a href="/privacy" target="_blank" rel="noreferrer">
            Privacy details
          </a>
        </p>
        <button
          type="button"
          disabled={erasing}
          onClick={() => {
            void cloud
              .setOnlineServices(
                !cloud.snapshot?.metadata.onlineServicesEnabled,
              )
              .catch(() =>
                setFailure(
                  'That setting could not be saved. Please try again.',
                ),
              );
          }}
        >
          {cloud.snapshot?.metadata.onlineServicesEnabled
            ? 'Stop online services'
            : 'Resume online services'}
        </button>
        {cloud.snapshot?.metadata.playerId && !erased && (
          <details>
            <summary>Delete online data</summary>
            <p>
              Permanently remove online journeys, session details, and reports
              for this {isSignedIn ? 'account' : 'anonymous player'}. Private
              attachments are removed by daily cleanup. Journeys on this device
              remain available. Online services will stop here; other connected
              devices can upload their progress again. This does not delete your
              sign-in account.
            </p>
            <button
              type="button"
              disabled={erasing}
              onClick={() => {
                setErasing(true);
                setFailure(null);
                const playerId = cloud.snapshot?.metadata.playerId ?? null;
                void cloud
                  .eraseOnlineData()
                  .then(() => setErasedPlayerId(playerId))
                  .catch((error: unknown) =>
                    setFailure(
                      error instanceof Error
                        ? error.message
                        : 'Online data could not be deleted.',
                    ),
                  )
                  .finally(() => setErasing(false));
              }}
            >
              {erasing
                ? 'Deleting online data…'
                : 'Permanently delete online data'}
            </button>
          </details>
        )}
        {erased && (
          <p role="status">
            Online data deleted. Your journeys remain on this device.
          </p>
        )}
      </details>
      {cloud.conflicts.map((conflict) => {
        const local = cloud.snapshot?.metadata.slots[conflict.slotId].save;
        const other =
          conflict.kind === 'local'
            ? conflict.candidate
            : conflict.kind === 'guest'
              ? conflict.guest
              : conflict.remote.save;
        const localPercent = local
          ? calculateDiscovery(local.discoveredSceneIds).overall.percent
          : null;
        const otherPercent = other
          ? calculateDiscovery(other.discoveredSceneIds).overall.percent
          : null;
        return (
          <section
            key={
              conflict.kind === 'local'
                ? conflict.candidateId
                : `${conflict.kind}:${conflict.slotId}`
            }
            className={styles.conflict}
            aria-label="Choose a journey version"
          >
            <p>
              Slot {conflict.slotId.slice(-1)} has different progress. Which
              journey should continue?
            </p>
            <div>
              {(['local', 'remote'] as const).map((choice) => {
                const version = choice === 'local' ? local : other;
                const versionSection = version
                  ? getDiscoverySection(version.envelope.activeSceneId)
                  : undefined;
                const percent =
                  choice === 'local' ? localPercent : otherPercent;
                const label =
                  conflict.kind === 'local'
                    ? choice === 'local'
                      ? 'Saved journey'
                      : 'Other tab'
                    : choice === 'local'
                      ? 'This device'
                      : conflict.kind === 'guest'
                        ? 'Before signing in'
                        : 'Other device';
                return (
                  <button
                    key={choice}
                    type="button"
                    disabled={resolving}
                    onClick={() => {
                      setFailure(null);
                      setResolving(true);
                      void cloud
                        .resolve(conflict, choice)
                        .catch(() =>
                          setFailure(
                            'That choice could not be saved yet. Please try again.',
                          ),
                        )
                        .finally(() => setResolving(false));
                    }}
                  >
                    Keep {label.toLowerCase()}
                    {percent === null
                      ? ' — deleted'
                      : ` — ${percent}% discovered`}
                    {version && (
                      <span className={styles.versionDetail}>
                        {versionSection
                          ? `${DISCOVERY_SECTION_LABELS[versionSection]} · `
                          : ''}
                        {new Date(version.envelope.savedAt).toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <small>The other version will be discarded.</small>
          </section>
        );
      })}
      {failure && <p role="alert">{failure}</p>}
    </div>
  );
}
