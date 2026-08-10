'use client';

import { useCallback, useMemo } from 'react';
import type { Scene } from '@soapbubble/morpheus-client/morpheus/casts/types';

import { GameStageShell } from '@/morpheus-app/components/GameStageShell';
import { RuntimeProvider } from '@/morpheus-app/runtime/RuntimeProvider';
import { explorerRuntimePolicy } from '@/morpheus-app/runtime/runtimePolicy';
import { replaceSceneAddress } from './sceneAddress';

interface ClientProps {
  scene: Scene;
  mcpSessionName: string | null;
}

export const Client = ({ scene, mcpSessionName }: ClientProps) => {
  const policy = useMemo(() => explorerRuntimePolicy(scene.sceneId), [scene]);
  const handleCurrentSceneChange = useCallback((sceneId: number) => {
    replaceSceneAddress(sceneId, window.history, window.location.search);
  }, []);

  return (
    <RuntimeProvider key={scene.sceneId} policy={policy} scene={scene}>
      <GameStageShell
        mcpSessionName={mcpSessionName}
        onCurrentSceneChange={handleCurrentSceneChange}
      />
    </RuntimeProvider>
  );
};
