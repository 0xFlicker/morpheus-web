import 'server-only';

import { getMorpheusMap } from '@soapbubble/morpheus-client/service/map';
import { validateLivingSaveSessionEnvelope } from '@/morpheus-app/storage/livingSaveSchema';
import { createLivingSaveValidationDefaults } from '@/morpheus-app/storage/livingSaveValidationDefaults';
import { CloudHttpError } from './http';
import type { CloudSave } from './protocol';

const scenes = new Set(
  getMorpheusMap().flatMap((entry) =>
    'sceneId' in entry.data &&
    typeof entry.data.sceneId === 'number' &&
    entry.type === 'Scene'
      ? [entry.data.sceneId]
      : [],
  ),
);
const validationContext = {
  ...createLivingSaveValidationDefaults(),
  isSceneAvailable: async (sceneId: number) => scenes.has(sceneId),
};

export async function validateCloudSave(save: CloudSave | null) {
  if (!save) return;
  const validation = await validateLivingSaveSessionEnvelope(
    save.envelope,
    validationContext,
  );
  if (!validation.ok) throw new CloudHttpError(400, validation.reason);
  if (save.discoveredSceneIds.some((id) => !scenes.has(id))) {
    throw new CloudHttpError(400, 'The save refers to an unknown discovery.');
  }
}
