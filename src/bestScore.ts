// Remembers the best score on this device using the browser's localStorage.
// Storage can be missing or blocked (some private browsing modes), so every
// access is wrapped in try/catch and the game keeps working without it.

// The "-v2" resets everyone's best score. Bump the version whenever a scoring
// change makes old records unfair (v2: held hits now score 25%).
export const STORAGE_KEY = "ragdoll-fling:best-score-v2";

// "Pure best" only counts rounds played with upgrades switched off, so it
// measures skill rather than how much someone has played.
export const PURE_STORAGE_KEY = "ragdoll-fling:pure-best-v2";

/** The two localStorage methods we use. Tests pass a fake with the same shape. */
export interface ScoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Returns the browser's localStorage, or undefined if it's blocked. */
export function getBrowserStorage(): ScoreStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Reads a saved best score. Anything missing or invalid counts as 0. */
export function loadBestScore(storage: ScoreStorage | undefined, key = STORAGE_KEY): number {
  try {
    const raw = storage?.getItem(key);
    if (raw == null) return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

/**
 * Call when a round ends. Saves the score if it beats the previous best.
 * Returns the (possibly new) best and whether this round set it.
 */
export function recordScore(
  storage: ScoreStorage | undefined,
  score: number,
  previousBest: number,
  key = STORAGE_KEY,
): { best: number; isNewBest: boolean } {
  if (score <= previousBest) return { best: previousBest, isNewBest: false };
  try {
    storage?.setItem(key, String(score));
  } catch {
    // Storage is full or blocked: still celebrate, just don't remember it.
  }
  return { best: score, isNewBest: true };
}
