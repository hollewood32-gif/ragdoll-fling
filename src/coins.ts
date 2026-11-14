// Coins: earned from damage at the end of each round, spent in the shop.
// Saved separately from best scores, so a future best-score reset
// (a new "-v3" key) never wipes anyone's coins.

import type { ScoreStorage } from "./bestScore";
import { CONFIG } from "./config";

export const COINS_KEY = "ragdoll-fling:coins";

/** Coins earned for a round's total damage: 1 per CONFIG.damagePerCoin, rounded down. */
export function coinsForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.floor(score / CONFIG.damagePerCoin);
}

/** Reads the coin balance. Anything missing or invalid counts as 0. */
export function loadCoins(storage: ScoreStorage | undefined): number {
  try {
    const raw = storage?.getItem(COINS_KEY);
    if (raw == null) return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function saveCoins(storage: ScoreStorage | undefined, coins: number): void {
  try {
    storage?.setItem(COINS_KEY, String(Math.max(0, Math.floor(coins))));
  } catch {
    // Storage blocked: coins still work for this visit.
  }
}
