import { describe, expect, it } from 'vitest';

import { gamePhaseReducer } from './gamePhase';

describe('gamePhaseReducer', () => {
  it('moves new games through intro and into the stage', () => {
    expect(gamePhaseReducer('title', { type: 'new-game-selected' })).toBe(
      'intro',
    );
    expect(gamePhaseReducer('intro', { type: 'game-ready' })).toBe('stage');
  });

  it('resumes an existing game directly into the stage', () => {
    expect(gamePhaseReducer('title', { type: 'game-ready' })).toBe('stage');
  });

  it('returns from the stage to the internal title without routing', () => {
    expect(gamePhaseReducer('stage', { type: 'return-to-title' })).toBe(
      'title',
    );
  });

  it('allows a failed intro to start the prepared game or return to title', () => {
    expect(gamePhaseReducer('intro', { type: 'start-failed' })).toBe('error');
    expect(gamePhaseReducer('error', { type: 'game-ready' })).toBe('stage');
    expect(gamePhaseReducer('error', { type: 'return-to-title' })).toBe(
      'title',
    );
  });
});
