// Save and load: one localStorage slot holding cash, mission progress, the
// player's spot and health. Saving never blocks play — it is a plain JSON
// write, and a corrupt or missing slot just starts a fresh game.
import { SAVE_KEY, BEST_KEY } from './config.js';

export function saveGame(game) {
  try {
    const data = {
      version: 1,
      cash: game.cash,
      missionIndex: game.missions.index,
      player: { x: game.player.x, z: game.player.z, health: game.player.health },
      wanted: game.police.stars,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}

/** Remember the best cash total; returns the best so far. */
export function recordBest(cash) {
  try {
    const prev = Number(localStorage.getItem(BEST_KEY) || 0);
    if (cash > prev) localStorage.setItem(BEST_KEY, String(cash));
    return Math.max(prev, cash);
  } catch {
    return cash;
  }
}

export function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch { return 0; }
}
