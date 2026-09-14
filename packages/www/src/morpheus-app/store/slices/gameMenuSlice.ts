import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetGame } from '../actions';

export type GameMenuState = {
  open: boolean;
  showDiscoveryDuringPlay: boolean;
  screen: 'main' | 'save-slots';
};

const createInitialState = (): GameMenuState => ({
  open: false,
  showDiscoveryDuringPlay: false,
  screen: 'main',
});

const gameMenuSlice = createSlice({
  name: 'gameMenu',
  initialState: createInitialState(),
  reducers: {
    setShowDiscoveryDuringPlay(state, action: PayloadAction<boolean>) {
      state.showDiscoveryDuringPlay = action.payload;
    },
    openGameMenu(state) {
      state.open = true;
      state.screen = 'main';
    },
    closeGameMenu(state) {
      state.open = false;
      state.screen = 'main';
    },
    showGameMenuMain(state) {
      state.screen = 'main';
    },
    showGameMenuSaveSlots(state) {
      state.screen = 'save-slots';
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetGame, (state) => ({
      ...createInitialState(),
      showDiscoveryDuringPlay: state.showDiscoveryDuringPlay,
    }));
  },
});

export const {
  setShowDiscoveryDuringPlay,
  closeGameMenu,
  openGameMenu,
  showGameMenuMain,
  showGameMenuSaveSlots,
} = gameMenuSlice.actions;

export const gameMenuReducer = gameMenuSlice.reducer;
export default gameMenuSlice.reducer;

export const selectGameMenu = (state: { gameMenu: GameMenuState }) =>
  state.gameMenu;
