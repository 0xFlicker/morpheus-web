'use client';

import { createContext, useContext, type PropsWithChildren } from 'react';

import type { LivingSaveCheckpointCoordinator } from './livingSaveCheckpoint';

const LivingSaveCheckpointContext =
  createContext<LivingSaveCheckpointCoordinator | null>(null);

export function LivingSaveCheckpointProvider({
  coordinator,
  children,
}: PropsWithChildren<{
  coordinator: LivingSaveCheckpointCoordinator | null;
}>) {
  return (
    <LivingSaveCheckpointContext.Provider value={coordinator}>
      {children}
    </LivingSaveCheckpointContext.Provider>
  );
}

export function useLivingSaveCheckpoint(): LivingSaveCheckpointCoordinator | null {
  return useContext(LivingSaveCheckpointContext);
}
