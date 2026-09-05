'use client';

import type { CloudReport } from '@/lib/cloud/reports';
import { useAppStore } from '@/morpheus-app/store/hooks';
import { useMorpheusCloud } from './CloudProvider';
import { CloudReportForm } from './CloudReportForm';
import styles from './cloud-player.module.css';

export function CloudReportPanel() {
  const cloud = useMorpheusCloud();
  const store = useAppStore();
  if (!cloud) return null;
  const captureDiagnostics = (): Pick<
    CloudReport,
    'sceneId' | 'diagnostics'
  > => {
    const state = store.getState();
    const sceneId = state.scene.activeSceneId;
    const rotation = state.rotation.current;
    const values = state.gamestate.byId;
    const failureReason = state.livingSaves.failureReason;
    return {
      sceneId,
      diagnostics: {
        snapshot: {
          schemaVersion: 1,
          capturedAt: new Date().toISOString(),
          app: { version: 'web-cloud-1', build: 'web' },
          platform: {
            family: 'web',
            device: 'Browser',
            operatingSystem: 'Browser',
          },
          scene: {
            sceneID: sceneId,
            phase: 'game',
            surface: 'browser',
            authoredYaw: Math.round(rotation.yaw3600),
            pitch: Math.round(rotation.pitch),
          },
          gameState: {
            totalStateCount: Object.keys(values).length,
            changedValues: Object.fromEntries(
              Object.values(values).map((value) => [
                value.stateId,
                value.value,
              ]),
            ),
          },
          error: failureReason
            ? { code: 'save-status', message: failureReason, sceneID: sceneId }
            : null,
        },
      },
    };
  };
  return (
    <details className={styles.report}>
      <summary>Send a report</summary>
      <CloudReportForm
        captureDiagnostics={captureDiagnostics}
        playerId={cloud.snapshot?.metadata.playerId}
      />
    </details>
  );
}
