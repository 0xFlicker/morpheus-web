export interface IntroCompletionGate {
  reset: () => void;
  markSaveReady: () => boolean;
  markIntroFinished: () => boolean;
}

export const createIntroCompletionGate = (): IntroCompletionGate => {
  let saveReady = false;
  let introFinished = false;

  const isComplete = () => saveReady && introFinished;

  return {
    reset: () => {
      saveReady = false;
      introFinished = false;
    },
    markSaveReady: () => {
      saveReady = true;
      return isComplete();
    },
    markIntroFinished: () => {
      introFinished = true;
      return isComplete();
    },
  };
};
