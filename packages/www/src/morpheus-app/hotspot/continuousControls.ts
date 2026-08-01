import type { Hotspot } from 'morpheus/casts/types';

import type { GamestatesAccessor } from '@/morpheus-app/store/slices/gamestateSlice';
import {
  handleHotspotAction,
  type HotspotActionResult,
} from './handleHotspotAction';
import {
  getActiveHotspots,
  withGamestateUpdates,
} from './hotspotEligibility';
import { hotspotRectMatchesPosition } from './matchers';

type Position = { top: number; left: number };

export type ContinuousControlCapture = {
  hotspots: Hotspot[];
  startingPosition: Position;
  oldValues: ReadonlyMap<number, number>;
};

export function isContinuousControl(hotspot: Hotspot): boolean {
  return hotspot.type >= 5 && hotspot.type <= 8;
}

export function captureContinuousControls(params: {
  hotspots: Hotspot[];
  gamestates: GamestatesAccessor;
  position: Position;
}): ContinuousControlCapture | null {
  const hotspots = getActiveHotspots(
    params.hotspots,
    params.gamestates,
  ).filter(
    (hotspot) =>
      isContinuousControl(hotspot) &&
      hotspotRectMatchesPosition(params.position)(hotspot),
  );

  if (hotspots.length === 0) {
    return null;
  }

  return {
    hotspots,
    startingPosition: params.position,
    oldValues: new Map(
      hotspots.map((hotspot) => [
        hotspot.param1,
        params.gamestates.byId(hotspot.param1).value,
      ]),
    ),
  };
}

export function updateCapturedContinuousControls(params: {
  capture: ContinuousControlCapture | null;
  gamestates: GamestatesAccessor;
  currentPosition: Position;
  previousSceneId?: number;
  isPanoScene: boolean;
}): {
  results: HotspotActionResult[];
  gamestates: GamestatesAccessor;
} {
  const { capture } = params;
  if (!capture) {
    return { results: [], gamestates: params.gamestates };
  }

  let gamestates = params.gamestates;
  const results: HotspotActionResult[] = [];

  // Re-check authored comparator eligibility, but never discover a different
  // control after pointer down. The capture itself remains owned until release.
  for (const hotspot of capture.hotspots) {
    if (getActiveHotspots([hotspot], gamestates).length === 0) {
      continue;
    }

    const result = handleHotspotAction({
      hotspot,
      gamestates,
      currentPosition: params.currentPosition,
      startingPosition: capture.startingPosition,
      previousSceneId: params.previousSceneId,
      isPanoScene: params.isPanoScene,
      oldValue: capture.oldValues.get(hotspot.param1),
    });
    results.push(result);
    gamestates = withGamestateUpdates(
      gamestates,
      result.gamestateUpdates,
    );
  }

  return { results, gamestates };
}
