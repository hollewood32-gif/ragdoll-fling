// Game modes and display settings. No drawing or physics here, so the rules
// can be unit tested.
//
// - Timed: the normal game. A round lasts a set time, damage is scored, and
//   coins and best scores are saved at the end.
// - Sandbox: no timer, no score, no coins. Every weapon is unlocked so it's a
//   playground; leave with Esc or the Exit button.

import type { ScoreStorage } from "./bestScore";
import { WEAPONS, type WeaponLevels } from "./weapons";

export type GameMode = "timed" | "sandbox";

/**
 * The weapons a Sandbox round can use: everything, at least level 1. Weapons
 * the player has already levelled up keep their level. Purchases are untouched.
 */
export function sandboxWeapons(owned: WeaponLevels): WeaponLevels {
  return Object.fromEntries(WEAPONS.map((w) => [w.id, Math.max(1, owned[w.id] ?? 0)])) as WeaponLevels;
}

// ---------------------------------------------------------------------------
// Damage numbers On/Off (applies to every mode)
// ---------------------------------------------------------------------------

export const DAMAGE_NUMBERS_KEY = "ragdoll-fling:damage-numbers";

/** Floating damage numbers: on unless the player switched them off. */
export function loadDamageNumbers(storage: ScoreStorage | undefined): boolean {
  try {
    return storage?.getItem(DAMAGE_NUMBERS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveDamageNumbers(storage: ScoreStorage | undefined, on: boolean): void {
  try {
    storage?.setItem(DAMAGE_NUMBERS_KEY, on ? "1" : "0");
  } catch {
    // Can't remember it; it still applies for this visit.
  }
}
