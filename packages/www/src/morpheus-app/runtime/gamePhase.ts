export type GamePhase = 'title' | 'intro' | 'stage' | 'error';

export type GamePhaseEvent =
  | { type: 'new-game-selected' }
  | { type: 'game-ready' }
  | { type: 'start-failed' }
  | { type: 'return-to-title' };

export function gamePhaseReducer(
  phase: GamePhase,
  event: GamePhaseEvent,
): GamePhase {
  switch (event.type) {
    case 'new-game-selected':
      return phase === 'title' ? 'intro' : phase;
    case 'game-ready':
      return phase === 'title' || phase === 'intro' || phase === 'error'
        ? 'stage'
        : phase;
    case 'start-failed':
      return phase === 'intro' ? 'error' : phase;
    case 'return-to-title':
      return 'title';
  }
}
