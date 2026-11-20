// Saving: progress lives in localStorage — missions done, cash, tokens,
// best cash — so a player can close the tab and pick up where they left off.
// A save is written on every mission completion and every 30 seconds of play.
import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return {
    version: 1,
    missionsDone: 0,
    cash: 40,
    tokens: [],
    bestCash: 40,
    playSeconds: 0,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return { ...defaultSave(), ...data };
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      missionsDone: state.missionsDone,
      cash: state.player.cash,
      tokens: state.tokensCollected,
      bestCash: Math.max(state.bestCash || 0, state.player.cash),
      playSeconds: Math.floor(state.time),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    state.bestCash = data.bestCash;
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: nothing to clear.
  }
}
