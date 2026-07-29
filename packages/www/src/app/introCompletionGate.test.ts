import { describe, expect, it } from 'vitest';

import { createIntroCompletionGate } from './introCompletionGate';

describe('intro completion gate', () => {
  it('waits for both the intro and new-slot creation', () => {
    const gate = createIntroCompletionGate();

    expect(gate.markIntroFinished()).toBe(false);
    expect(gate.markSaveReady()).toBe(true);
  });

  it('resets the previous attempt before another slot starts', () => {
    const gate = createIntroCompletionGate();
    gate.markSaveReady();
    gate.reset();

    expect(gate.markIntroFinished()).toBe(false);
    expect(gate.markSaveReady()).toBe(true);
  });
});
