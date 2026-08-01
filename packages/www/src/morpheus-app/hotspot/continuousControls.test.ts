import { describe, expect, it } from 'vitest';
import { fetch as fetchScene } from '@soapbubble/morpheus-client/service/scene';

import {
  createGamestatesAccessor,
  createHotspot,
} from './harnessClick.fixtures';
import { handleHotspotAction } from './handleHotspotAction';
import {
  getActiveHotspots,
  getHotspotCandidates,
  withGamestateUpdates,
} from './hotspotEligibility';
import { hotspotRectMatchesPosition } from './matchers';
import { resolveAlwaysHotspotActions } from './alwaysHotspots';
import {
  captureContinuousControls,
  updateCapturedContinuousControls,
} from './continuousControls';
import { isDirectPointerActionHotspot } from '../hooks/useInputHandler';

describe('continuous control ownership', () => {
  it('retains the captured control across intermediate Always state updates', () => {
    const control = createHotspot({
      type: 7,
      gesture: 3,
      param1: 10,
      param2: 0,
      rectTop: 0,
      rectBottom: 100,
      rectLeft: 0,
      rectRight: 100,
    });
    const start = { top: 50, left: 50 };
    const initialGamestates = createGamestatesAccessor({
      10: { value: 0, maxValue: 10 },
      20: { value: 0, maxValue: 1 },
    });
    const capture = captureContinuousControls({
      hotspots: [control],
      gamestates: initialGamestates,
      position: start,
    });
    const firstDrag = updateCapturedContinuousControls({
      capture,
      gamestates: initialGamestates,
      currentPosition: { top: 70, left: 50 },
      isPanoScene: false,
    });
    const settledGamestates = withGamestateUpdates(
      firstDrag.gamestates,
      [{ stateId: 20, value: 1 }],
    );
    const secondDrag = updateCapturedContinuousControls({
      capture,
      gamestates: settledGamestates,
      currentPosition: { top: 100, left: 50 },
      isPanoScene: false,
    });

    expect(secondDrag.gamestates.byId(10).value).toBe(5);
    expect(secondDrag.gamestates.byId(20).value).toBe(1);
  });

  it('runs scene 202019 through press, drag, release while preserving MouseEnter', async () => {
    const scene = await fetchScene(202019);
    expect(scene).toBeDefined();
    if (!scene) return;

    const hotspots = getHotspotCandidates(scene);
    const cargoSlider = hotspots.find(
      (hotspot) => hotspot.type === 7 && hotspot.param1 === 1011,
    );
    expect(cargoSlider).toBeDefined();
    if (!cargoSlider) return;

    expect(cargoSlider.gesture).toBe(3);

    const start = {
      top: (cargoSlider.rectTop + cargoSlider.rectBottom) / 2,
      left: (cargoSlider.rectLeft + cargoSlider.rectRight) / 2,
    };
    let currentGamestates = createGamestatesAccessor({
      800: { value: 0, maxValue: 2 },
      1011: { value: 2, maxValue: 5 },
      1012: { value: 0, maxValue: 5 },
    });

    const directMouseEnterActions = getActiveHotspots(
      hotspots,
      currentGamestates,
    ).filter(
      (hotspot) =>
        hotspot.gesture === 3 &&
        hotspotRectMatchesPosition(start)(hotspot) &&
        isDirectPointerActionHotspot(hotspot),
    );

    expect(directMouseEnterActions).not.toContain(cargoSlider);
    expect(currentGamestates.byId(1011).value).toBe(2);

    const capture = captureContinuousControls({
      hotspots,
      gamestates: currentGamestates,
      position: start,
    });
    expect(capture?.hotspots).toEqual([cargoSlider]);

    const firstDrag = updateCapturedContinuousControls({
      capture,
      gamestates: currentGamestates,
      currentPosition: {
        top:
          start.top +
          (cargoSlider.rectBottom - cargoSlider.rectTop) / 5,
        left: start.left,
      },
      isPanoScene: false,
    });
    currentGamestates = firstDrag.gamestates;

    expect(currentGamestates.byId(1011).value).toBe(3);

    const release = updateCapturedContinuousControls({
      capture,
      gamestates: currentGamestates,
      currentPosition: {
        top: cargoSlider.rectBottom,
        left: start.left,
      },
      isPanoScene: false,
    });
    currentGamestates = release.gamestates;

    expect(currentGamestates.byId(1011).value).toBe(5);

    const alwaysResults = resolveAlwaysHotspotActions({
      hotspots,
      gamestates: currentGamestates,
      execute: (hotspot, gamestates) =>
        handleHotspotAction({
          hotspot,
          gamestates,
          currentPosition: start,
          startingPosition: start,
          isPanoScene: false,
        }),
    });
    for (const result of alwaysResults) {
      currentGamestates = withGamestateUpdates(
        currentGamestates,
        result.gamestateUpdates,
      );
    }

    expect(currentGamestates.byId(800).value).toBe(2);
    expect(currentGamestates.byId(1011).value).toBe(0);
    expect(alwaysResults.at(-1)?.sceneTransition?.sceneId).toBe(202014);

    const firstTransition = await fetchScene(202014);
    const secondTransition = await fetchScene(202015);
    expect(
      firstTransition?.casts.find((cast) => 'actionAtEnd' in cast)?.actionAtEnd,
    ).toBe(202015);
    expect(
      secondTransition?.casts.find((cast) => 'actionAtEnd' in cast)
        ?.actionAtEnd,
    ).toBe(203019);
  });
});
