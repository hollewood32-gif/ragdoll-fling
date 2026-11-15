// Weapons: what they cost, how levels work, and how they're saved.
// No drawing or physics here, so the rules can be unit tested.
//
// Weapons arrive over several PRs. Only the ones listed in WEAPONS are in the
// shop; later PRs add the guns and explosives to this list.

import type { ScoreStorage } from "./bestScore";
import { CONFIG } from "./config";

export type WeaponId = "fist" | "bat" | "axe" | "spikes";

/** "melee" is swung, "passive" is always on once bought. Later: "tap" (guns, explosives). */
export type WeaponKind = "melee" | "passive";

export interface WeaponInfo {
  id: WeaponId;
  name: string;
  kind: WeaponKind;
  /** Number key that selects it (none for passive weapons). */
  key: number | null;
  /** Price to buy level 1. 0 means everyone owns it from the start. */
  price: number;
  /** What the weapon does at a given level, for the shop screen. */
  describe: (level: number) => string;
}

/** Level 0 means not owned. Buying gives level 1; the max is 5. */
export type WeaponLevels = Record<WeaponId, number>;
export const MAX_WEAPON_LEVEL = 1 + CONFIG.weaponLevelUpFactors.length; // 5

// Listed in key order (1, 2, 3...), which is also the order of the weapon bar.
export const WEAPONS: WeaponInfo[] = [
  {
    id: "fist",
    name: "Fist",
    kind: "melee",
    key: 1,
    price: CONFIG.fist.price,
    describe: (level) => `Swing to punch · ${Math.round(weaponPower(level) * 100)}% power`,
  },
  {
    id: "bat",
    name: "Bat",
    kind: "melee",
    key: 2,
    price: CONFIG.bat.price,
    describe: (level) => `Long reach, huge knockback · ${Math.round(weaponPower(level) * 100)}% power`,
  },
  {
    id: "axe",
    name: "Axe",
    kind: "melee",
    key: 3,
    price: CONFIG.axe.price,
    describe: (level) => `Heavy, big damage · ${Math.round(weaponPower(level) * 100)}% power`,
  },
  // Passive weapons have no key and go last.
  {
    id: "spikes",
    name: "Spiked walls",
    kind: "passive",
    key: null,
    price: CONFIG.spikesPrice,
    describe: (level) => `Wall hits +${Math.round((spikesMultiplier(Math.max(level, 1)) - 1) * 100)}% damage`,
  },
];

export function weaponInfo(id: WeaponId): WeaponInfo {
  return WEAPONS.find((w) => w.id === id)!;
}

/** What a new player owns: every free weapon at level 1. */
export const STARTING_WEAPONS: WeaponLevels = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w.price === 0 ? 1 : 0]),
) as WeaponLevels;

/** Damage and knockback multiplier: 1 at level 1, +15% for each level after. */
export function weaponPower(level: number): number {
  return 1 + Math.max(0, level - 1) * CONFIG.weaponPowerPerLevel;
}

/** Wall-hit damage multiplier from spiked walls (1 when not owned). */
export function spikesMultiplier(level: number): number {
  if (level <= 0) return 1;
  return 1 + CONFIG.spikesBaseBonus + (level - 1) * CONFIG.spikesBonusPerLevel;
}

/** Price of the next level (buying is level 1), or null when maxed out. */
export function nextWeaponPrice(id: WeaponId, level: number): number | null {
  if (level >= MAX_WEAPON_LEVEL) return null;
  const price = weaponInfo(id).price;
  if (level === 0) return price;
  // A free weapon still costs coins to level up, priced like a 1,000-coin one.
  const base = price > 0 ? price : 1000;
  return Math.round(base * CONFIG.weaponLevelUpFactors[level - 1]);
}

/** Buys a weapon or its next level. Null if maxed out or the player can't afford it. */
export function buyWeapon(
  levels: WeaponLevels,
  id: WeaponId,
  coins: number,
): { levels: WeaponLevels; coins: number } | null {
  const price = nextWeaponPrice(id, levels[id]);
  if (price === null || coins < price) return null;
  return { levels: { ...levels, [id]: levels[id] + 1 }, coins: coins - price };
}

/** Weapons the player can select with keys or the weapon bar, in key order. */
export function selectableWeapons(levels: WeaponLevels): WeaponInfo[] {
  return WEAPONS.filter((w) => w.key !== null && levels[w.id] > 0);
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export const WEAPONS_KEY = "ragdoll-fling:weapons";
export const SELECTED_WEAPON_KEY = "ragdoll-fling:weapon-selected";

/** Reads saved levels. Missing, broken or out-of-range values fall back to the start. */
export function loadWeapons(storage: ScoreStorage | undefined): WeaponLevels {
  const levels = { ...STARTING_WEAPONS };
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(WEAPONS_KEY) ?? "{}");
    const saved = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    for (const id of Object.keys(levels) as WeaponId[]) {
      const value = saved[id];
      if (typeof value === "number" && Number.isInteger(value)) {
        const min = STARTING_WEAPONS[id]; // free weapons can't drop below level 1
        levels[id] = Math.min(MAX_WEAPON_LEVEL, Math.max(min, value));
      }
    }
  } catch {
    // Broken save: start over with the free weapons.
  }
  return levels;
}

export function saveWeapons(storage: ScoreStorage | undefined, levels: WeaponLevels): void {
  try {
    storage?.setItem(WEAPONS_KEY, JSON.stringify(levels));
  } catch {
    // Storage blocked: purchases still work for this visit.
  }
}

/** The selected weapon, if it's still owned and selectable; otherwise the first one. */
export function loadSelectedWeapon(storage: ScoreStorage | undefined, levels: WeaponLevels): WeaponId {
  const options = selectableWeapons(levels);
  let saved: string | null = null;
  try {
    saved = storage?.getItem(SELECTED_WEAPON_KEY) ?? null;
  } catch {
    // Can't read it: use the default.
  }
  return options.find((w) => w.id === saved)?.id ?? options[0]?.id ?? "fist";
}

export function saveSelectedWeapon(storage: ScoreStorage | undefined, id: WeaponId): void {
  try {
    storage?.setItem(SELECTED_WEAPON_KEY, id);
  } catch {
    // Can't remember it; it still applies for this visit.
  }
}
