import { fetchInitial } from '@soapbubble/morpheus-client/service/gameState';

import {
  LIVING_SAVE_GAME_DATA_VERSION,
  type LivingSaveValidationContext,
} from './livingSaveTypes';

export function createLivingSaveValidationDefaults(): Pick<
  LivingSaveValidationContext,
  'supportedGameDataVersions' | 'expectedGamestateBounds'
> {
  return {
    supportedGameDataVersions: [LIVING_SAVE_GAME_DATA_VERSION],
    expectedGamestateBounds: Object.fromEntries(
      fetchInitial().map((gamestate) => [
        gamestate.stateId,
        {
          minimum: Math.min(gamestate.minValue, gamestate.value),
          maximum: Math.max(gamestate.maxValue, gamestate.value),
        },
      ]),
    ),
  };
}
