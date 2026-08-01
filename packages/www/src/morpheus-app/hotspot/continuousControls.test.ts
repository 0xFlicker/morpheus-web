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
import {
  getMouseUpHotspots,
  isDirectPointerActionHotspot,
} from '../hooks/useInputHandler';

function createThresholdGamestates(
  stateId: number,
  value: number,
  branchStateIds: readonly [number, number],
) {
  const values = new Map<number, { value: number; maxValue: number }>([
    [stateId, { value, maxValue: 12 }],
    [branchStateIds[0], { value: 0, maxValue: 1 }],
    [branchStateIds[1], { value: 0, maxValue: 1 }],
  ]);

  return {
    byId(id: number) {
      const state = values.get(id) ?? { value: 0, maxValue: 1 };
      return {
        stateId: id,
        initialValue: 0,
        minValue: 0,
        stateWraps: 0,
        ...state,
      };
    },
  };
}

async function releaseAcrossThreshold(params: {
  sceneId: number;
  stateId: number;
  branchStateIds: readonly [number, number];
  initialValue: number;
  horizontalDelta: number;
}) {
  const scene = await fetchScene(params.sceneId);
  expect(scene).toBeDefined();
  if (!scene) {
    throw new Error(`Missing authored scene ${params.sceneId}`);
  }

  const hotspots = getHotspotCandidates(scene);
  const slider = hotspots.find(
    (hotspot) => hotspot.type === 6 && hotspot.param1 === params.stateId,
  );
  expect(slider).toBeDefined();
  if (!slider) {
    throw new Error(`Missing authored slider ${params.stateId}`);
  }

  const start = {
    top: (slider.rectTop + slider.rectBottom) / 2,
    left: (slider.rectLeft + slider.rectRight) / 2,
  };
  const releasePosition = {
    top: start.top,
    left: start.left + params.horizontalDelta,
  };
  const initialGamestates = createThresholdGamestates(
    params.stateId,
    params.initialValue,
    params.branchStateIds,
  );
  const capture = captureContinuousControls({
    hotspots,
    gamestates: initialGamestates,
    position: start,
  });
  const release = updateCapturedContinuousControls({
    capture,
    gamestates: initialGamestates,
    currentPosition: releasePosition,
    isPanoScene: false,
  });
  const mouseUpHotspots = getMouseUpHotspots({
    hotspots,
    gamestates: release.gamestates,
    currentPosition: releasePosition,
    startingPosition: start,
  });

  let currentGamestates = release.gamestates;
  for (const hotspot of mouseUpHotspots) {
    const result = handleHotspotAction({
      hotspot,
      gamestates: currentGamestates,
      currentPosition: releasePosition,
      startingPosition: start,
      isPanoScene: false,
    });
    currentGamestates = withGamestateUpdates(
      currentGamestates,
      result.gamestateUpdates,
    );
    if (result.allDone) break;
  }

  return { currentGamestates, mouseUpHotspots, release };
}

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

  it('uses scene 412052 final release state to disable the below-threshold MouseUp branch', async () => {
    const result = await releaseAcrossThreshold({
      sceneId: 412052,
      stateId: 1403,
      branchStateIds: [630, 1406],
      initialValue: 1,
      horizontalDelta: 20,
    });

    expect(result.release.gamestates.byId(1403).value).toBe(2);
    expect(
      result.mouseUpHotspots.filter((hotspot) =>
        [630, 1406].includes(hotspot.param1),
      ),
    ).toEqual([]);
    expect(result.currentGamestates.byId(630).value).toBe(0);
    expect(result.currentGamestates.byId(1406).value).toBe(0);
  });

  it('uses scene 414052 final release state to enable the below-threshold MouseUp branch', async () => {
    const result = await releaseAcrossThreshold({
      sceneId: 414052,
      stateId: 1402,
      branchStateIds: [635, 1404],
      initialValue: 2,
      horizontalDelta: -20,
    });

    expect(result.release.gamestates.byId(1402).value).toBe(1);
    expect(
      result.mouseUpHotspots
        .filter((hotspot) => [635, 1404].includes(hotspot.param1))
        .map((hotspot) => hotspot.param1),
    ).toEqual([635, 1404]);
    expect(result.currentGamestates.byId(635).value).toBe(1);
    expect(result.currentGamestates.byId(1404).value).toBe(1);
  });
});
