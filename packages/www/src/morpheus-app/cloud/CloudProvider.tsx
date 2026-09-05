'use client';

import { useAuth } from '@clerk/nextjs';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { openGameMenu } from '@/morpheus-app/store/slices/gameMenuSlice';
import { setLivingSaveIdentityFence } from '@/morpheus-app/storage/livingSaveStorage';
import { resetGame } from '@/morpheus-app/store/actions';
import {
  livingSaveCatalogResolved,
  type LivingSavesState,
} from '@/morpheus-app/store/slices/livingSavesSlice';
import type { AppStore } from '@/morpheus-app/store/store';
import type { LivingSaveCheckpointCoordinator } from '@/morpheus-app/store/livingSaveCheckpoint';
import type { LivingSaveCoordinator } from '@/morpheus-app/store/livingSaveCoordinator';
import {
  createCloudClient,
  localCloudConflicts,
  type CloudClient,
  type CloudClientState,
  type CloudConflict,
} from './cloudClient';
import {
  acknowledgeCloudNotice,
  setCloudOnlineServices,
  readCloudLocalSnapshot,
  switchCloudLocalIdentity,
  type CloudLocalSnapshot,
} from './cloudStorage';
import { CLOUD_LOCAL_CHANGE_EVENT } from './localMetadata';
import styles from './cloud-player.module.css';

export type CloudContextValue = CloudClientState & {
  setPlaying: (playing: boolean) => void;
  sync: () => void;
  acknowledgeNotice: () => void;
  setOnlineServices: (enabled: boolean) => Promise<void>;
  eraseOnlineData: () => Promise<void>;
  resolve: (
    conflict: CloudConflict,
    choice: 'local' | 'remote',
  ) => Promise<void>;
};
const CloudContext = createContext<CloudContextValue | null>(null);
export const useMorpheusCloud = () => useContext(CloudContext);

/** Return a usable local catalog only after its owner is verified or switched. */
export async function prepareCloudLocalRuntime({
  identity,
  isCurrent,
  onIdentityChange,
  currentIdentity,
  hasRetainedRuntime = false,
}: {
  identity: string | null;
  isCurrent: () => boolean;
  onIdentityChange: () => void | Promise<void>;
  currentIdentity?: string | null;
  hasRetainedRuntime?: boolean;
}): Promise<CloudLocalSnapshot | null> {
  let before = await readCloudLocalSnapshot();
  if (!isCurrent()) return null;
  // An offline launch can retain the locally recorded owner while Clerk loads.
  if (identity === null) return before;
  const priorIdentity = currentIdentity ?? before.metadata.identityKey;
  if (
    hasRetainedRuntime ||
    (priorIdentity !== null && priorIdentity !== identity)
  ) {
    await onIdentityChange();
    if (!isCurrent()) return null;
    const drained = await readCloudLocalSnapshot();
    if (drained.metadata.identityKey !== before.metadata.identityKey)
      throw new Error(
        'The local account changed while its journey was being saved.',
      );
    before = drained;
  }
  if (!isCurrent()) return null;
  if (before.metadata.identityKey === identity) return before;
  const snapshot = await switchCloudLocalIdentity(identity, {
    expectedIdentityKey: before.metadata.identityKey,
    isCurrent,
  });
  if (!isCurrent()) return null;
  if (snapshot.metadata.identityKey !== identity) {
    throw new Error('The local journey belongs to a different account.');
  }
  return snapshot;
}

export function canApplyCloudSnapshot({
  snapshot,
  saves,
  playing,
  menuOpen,
  resolvingLocal = false,
}: {
  snapshot: CloudLocalSnapshot;
  saves: Pick<
    LivingSavesState,
    'runtimeSlotId' | 'saveHealth' | 'failureReason' | 'operation'
  >;
  playing: boolean;
  menuOpen: boolean;
  resolvingLocal?: boolean;
}): boolean {
  const hasLocalCandidates =
    saves.runtimeSlotId !== null &&
    snapshot.metadata.slots[saves.runtimeSlotId].localCandidates.length > 0;
  if (hasLocalCandidates && !resolvingLocal) return false;
  if (
    saves.saveHealth === 'save-unavailable' &&
    !(
      saves.failureReason === 'conflict' &&
      (resolvingLocal || !hasLocalCandidates)
    )
  )
    return false;
  return (
    saves.operation === null &&
    saves.saveHealth !== 'saving' &&
    (!playing || menuOpen)
  );
}

export function CloudProvider({
  children,
  store,
  coordinator,
  checkpointCoordinator,
}: PropsWithChildren<{
  store: AppStore;
  coordinator: LivingSaveCoordinator;
  checkpointCoordinator: LivingSaveCheckpointCoordinator;
}>) {
  const { isLoaded, userId } = useAuth();
  const identity = isLoaded ? (userId ?? 'anonymous') : null;
  const [runtimeAccess, setRuntimeAccess] = useState({
    identity,
    ready: false,
  });
  // Latch closed during render so A→B→A cannot remount an undrained A runtime.
  if (runtimeAccess.identity !== identity)
    setRuntimeAccess({ identity, ready: false });
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const playing = useRef(false);
  const onlineEnabled = useRef(false);
  const client = useRef<CloudClient | null>(null);
  const [localIdentity, setLocalIdentity] = useState<string | null>(null);
  const localIdentityRef = useRef(localIdentity);
  localIdentityRef.current = localIdentity;
  const runtimeIdentity = identity ?? localIdentity;
  const [localStorageFailed, setLocalStorageFailed] = useState(false);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [state, setState] = useState<CloudClientState>({
    status: 'connecting',
    conflicts: [],
    snapshot: null,
  });

  useEffect(() => {
    if (identityRef.current !== null) return;
    let mounted = true;
    // Local play remains available while Clerk loads, including an offline launch.
    const isCurrent = () => mounted && identityRef.current === null;
    void prepareCloudLocalRuntime({
      identity: null,
      isCurrent,
      onIdentityChange: () => {},
    })
      .then((snapshot) => {
        if (!snapshot || !isCurrent()) return;
        setLivingSaveIdentityFence(snapshot.metadata.identityKey);
        setLocalIdentity(snapshot.metadata.identityKey ?? 'anonymous');
        setLocalStorageFailed(false);
        setRuntimeAccess({ identity: null, ready: true });
        setState({
          status: 'offline',
          conflicts: localCloudConflicts(snapshot),
          snapshot,
        });
      })
      .catch(() => {
        if (!isCurrent()) return;
        setLocalIdentity(null);
        setLocalStorageFailed(true);
        setState({ status: 'offline', conflicts: [], snapshot: null });
      });
    return () => {
      mounted = false;
    };
  }, [setupAttempt]);

  useEffect(() => {
    if (runtimeIdentity === null) return;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const sessionId = crypto.randomUUID();
    client.current?.stop();
    client.current = null;
    const isCurrent = () => !disposed && identityRef.current === identity;
    const canApply = (snapshot: CloudLocalSnapshot, resolvingLocal = false) => {
      const runtime = store.getState();
      return canApplyCloudSnapshot({
        snapshot,
        saves: runtime.livingSaves,
        playing: playing.current,
        menuOpen: runtime.gameMenu.open,
        resolvingLocal,
      });
    };
    const onCatalog = async (
      snapshot: Awaited<ReturnType<typeof readCloudLocalSnapshot>>,
      resolvingLocal = false,
    ) => {
      if (!isCurrent() || snapshot.metadata.identityKey !== runtimeIdentity)
        return;
      if (!canApply(snapshot, resolvingLocal)) return;
      const before = store.getState().livingSaves;
      if (before.catalogRevision === snapshot.catalog.revision) return;
      if (playing.current && before.runtimeSlotId !== null) {
        const slot = snapshot.catalog.slots[before.runtimeSlotId];
        const runtimeSlot = before.slots.find(
          (value) => value.slotId === before.runtimeSlotId,
        );
        // An intermediate choice updates the catalog, but the live game waits
        // until every retained branch for its slot has been resolved.
        if (slot.revision !== runtimeSlot?.revision && canApply(snapshot)) {
          if (slot.kind === 'occupied') {
            await coordinator.restoreSlot(slot.slotId);
            return;
          }
          store.dispatch(resetGame());
          playing.current = false;
          setRuntimeKey((key) => key + 1);
        }
      }
      store.dispatch(
        livingSaveCatalogResolved({
          catalog: snapshot.catalog,
          operationId: 'cloud-refresh',
        }),
      );
    };
    const revealConflicts = (conflicts: CloudConflict[]) => {
      if (
        conflicts.length > 0 &&
        playing.current &&
        !store.getState().gameMenu.open
      )
        store.dispatch(openGameMenu());
    };
    const connect = async () => {
      let snapshot: CloudLocalSnapshot | null;
      try {
        snapshot = await prepareCloudLocalRuntime({
          identity: runtimeIdentity,
          isCurrent,
          currentIdentity: localIdentityRef.current,
          hasRetainedRuntime:
            store.getState().livingSaves.runtimeSlotId !== null,
          onIdentityChange: async () => {
            coordinator.cancel?.();
            const result = await checkpointCoordinator.flush();
            if (!result.ok)
              throw new Error(
                'The last journey could not be saved on this device.',
              );
          },
        });
      } catch {
        if (!isCurrent()) return;
        // Retain the old Redux runtime and captured checkpoint so retry can finish it.
        setLocalStorageFailed(true);
        setRuntimeAccess({ identity, ready: false });
        setState((previous) => ({ ...previous, status: 'offline' }));
        return;
      }
      if (!snapshot || !isCurrent()) return;
      if (
        localIdentityRef.current !== null &&
        localIdentityRef.current !== runtimeIdentity
      ) {
        playing.current = false;
        coordinator.cancel?.();
        store.dispatch(resetGame());
      }
      setLivingSaveIdentityFence(runtimeIdentity);
      setLocalIdentity(runtimeIdentity);
      setLocalStorageFailed(false);
      setRuntimeAccess({ identity, ready: true });
      onlineEnabled.current = snapshot.metadata.onlineServicesEnabled;
      const conflicts = localCloudConflicts(snapshot);
      setState({
        status:
          identity === null
            ? 'offline'
            : onlineEnabled.current
              ? 'connecting'
              : 'local',
        conflicts,
        snapshot,
      });
      revealConflicts(conflicts);
      const next = createCloudClient({
        identityKey: runtimeIdentity,
        sessionId,
        isIdentityCurrent: isCurrent,
        isCurrent: () =>
          identity !== null && isCurrent() && onlineEnabled.current,
        canApply,
        onCatalog,
        onState: (nextState) => {
          if (!isCurrent()) return;
          setState(nextState);
          revealConflicts(nextState.conflicts);
          if (nextState.status === 'offline' && retryTimer === null) {
            retryTimer = setTimeout(() => {
              retryTimer = null;
              void client.current?.sync();
            }, 30_000);
          }
        },
      });
      client.current = next;
      if (onlineEnabled.current) await next.sync();
    };
    void connect();
    let checkpointTimer: ReturnType<typeof setTimeout> | null = null;
    let wasMenuOpen = store.getState().gameMenu.open;
    const unsubscribe = store.subscribe(() => {
      const open = store.getState().gameMenu.open;
      if (open && !wasMenuOpen) void client.current?.sync();
      wasMenuOpen = open;
    });
    const changed = () => {
      void readCloudLocalSnapshot()
        .then((snapshot) => {
          if (!isCurrent() || snapshot.metadata.identityKey !== runtimeIdentity)
            return;
          onlineEnabled.current = snapshot.metadata.onlineServicesEnabled;
          if (!onlineEnabled.current) client.current?.pause();
          const localConflicts = localCloudConflicts(snapshot);
          setState((previous) => ({
            ...previous,
            snapshot,
            conflicts: [
              ...(onlineEnabled.current
                ? previous.conflicts.filter(
                    (conflict) => conflict.kind !== 'local',
                  )
                : []),
              ...localConflicts,
            ],
            status: onlineEnabled.current ? previous.status : 'local',
          }));
          revealConflicts(localConflicts);
        })
        .catch(() => {
          if (isCurrent())
            setState((previous) => ({ ...previous, status: 'offline' }));
        });
      // Coalesce frequent checkpoints; their state is already durable in IndexedDB.
      if (checkpointTimer !== null) clearTimeout(checkpointTimer);
      checkpointTimer = setTimeout(() => {
        checkpointTimer = null;
        void client.current?.sync();
      }, 1_200);
    };
    const foreground = () => {
      if (document.visibilityState !== 'hidden') void client.current?.sync();
    };
    window.addEventListener(CLOUD_LOCAL_CHANGE_EVENT, changed);
    window.addEventListener('online', foreground);
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      disposed = true;
      coordinator.cancel?.();
      unsubscribe();
      client.current?.stop();
      client.current = null;
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (checkpointTimer !== null) clearTimeout(checkpointTimer);
      window.removeEventListener(CLOUD_LOCAL_CHANGE_EVENT, changed);
      window.removeEventListener('online', foreground);
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [
    checkpointCoordinator,
    coordinator,
    identity,
    runtimeIdentity,
    setupAttempt,
    store,
  ]);

  return (
    <CloudContext.Provider
      value={{
        ...state,
        setPlaying: (value) => {
          playing.current = value;
          if (!value) void client.current?.sync();
        },
        sync: () => {
          void client.current?.sync();
        },
        acknowledgeNotice: () => {
          void acknowledgeCloudNotice().catch(() =>
            setState((previous) => ({ ...previous, status: 'offline' })),
          );
        },
        setOnlineServices: async (enabled) => {
          if (!enabled) {
            onlineEnabled.current = false;
            client.current?.pause();
          }
          await setCloudOnlineServices(enabled);
        },
        eraseOnlineData: async () => {
          const before = await readCloudLocalSnapshot();
          if (
            !before.metadata.playerId ||
            before.metadata.identityKey !== identityRef.current
          )
            throw new Error(
              'Connect this device before deleting its online data.',
            );
          onlineEnabled.current = false;
          client.current?.pause();
          await setCloudOnlineServices(false);
          const response = await fetch('/api/cloud/erase', {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'x-morpheus-player-id': before.metadata.playerId },
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok)
            throw new Error(
              'Online data could not be deleted. Please try again when connected.',
            );
        },
        resolve: async (conflict, choice) => {
          await client.current?.resolve(conflict, choice);
        },
      }}
    >
      {!localStorageFailed &&
      runtimeAccess.ready &&
      runtimeAccess.identity === identity &&
      localIdentity !== null &&
      (identity === null || localIdentity === identity) ? (
        <div key={`${localIdentity}:${runtimeKey}`}>{children}</div>
      ) : localStorageFailed ? (
        <section className={styles.details} role="alert">
          <p>
            {localIdentity !== null
              ? 'Your last journey could not be saved or closed. It remains in this session; try again when browser storage is available.'
              : 'Your journeys could not be opened from this browser’s storage. Check that browser storage is available, then try again.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setLocalStorageFailed(false);
              setSetupAttempt((attempt) => attempt + 1);
            }}
          >
            Try again
          </button>
        </section>
      ) : null}
    </CloudContext.Provider>
  );
}
