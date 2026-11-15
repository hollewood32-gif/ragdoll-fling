// Weapons: what they cost, how levels work, and how they're saved.
// No drawing or physics here, so the rules can be unit tested.
//
// Every weapon listed in WEAPONS is sold in the shop.

import type { ScoreStorage } from "./bestScore";
import { CONFIG } from "./config";

export type WeaponId =
  | "fist"
  | "bat"
  | "axe"
  | "pistol"
  | "revolver"
  | "grenade"
  | "cluster"
  | "cannon"
  | "rpg"
  | "spikes";

/** "melee" is swung, "thrown" is flung by hand, "gun" fires while held, "passive" is always on once bought. */
export type WeaponKind = "melee" | "thrown" | "gun" | "passive";

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
  {
    id: "pistol",
    name: "Pistol",
    kind: "gun",
    key: 4,
    price: CONFIG.pistol.price,
    describe: (level) => `Hold to fire, fast stream · ${Math.round(CONFIG.pistol.damage * weaponPower(level))} damage a bullet`,
  },
  {
    id: "revolver",
    name: "Revolver",
    kind: "gun",
    key: 5,
    price: CONFIG.revolver.price,
    describe: (level) => `Hold to fire, huge kick · ${Math.round(CONFIG.revolver.damage * weaponPower(level))} damage a bullet`,
  },
  {
    id: "grenade",
    name: "Grenade",
    kind: "thrown",
    key: 6,
    price: CONFIG.grenade.price,
    describe: (level) => `Hold, fling, boom after 1 s · ${Math.round(CONFIG.grenade.damage * weaponPower(level))} blast`,
  },
  {
    id: "cluster",
    name: "Cluster bomb",
    kind: "thrown",
    key: 7,
    price: CONFIG.cluster.price,
    describe: (level) => `Like a grenade, plus ${CONFIG.cluster.bomblets} bomblets · ${Math.round(CONFIG.cluster.damage * weaponPower(level))} blast`,
  },
  {
    id: "cannon",
    name: "Cannon",
    kind: "gun",
    key: 8,
    price: CONFIG.cannon.price,
    describe: (level) => `Hold to lob heavy cannonballs · ${Math.round(weaponPower(level) * 100)}% power`,
  },
  {
    id: "rpg",
    name: "RPG",
    kind: "gun",
    key: 9,
    price: CONFIG.rpg.price,
    describe: (level) => `Hold to fire rockets · ${Math.round(CONFIG.rpg.damage * weaponPower(level))} blast`,
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

// ---------------------------------------------------------------------------
// Guns
// ---------------------------------------------------------------------------

/** How full a weapon's cooldown is: 1 just after firing, 0 when ready. */
export function cooldownLeft(nowMs: number, lastFiredMs: number, cooldownMs: number): number {
  if (cooldownMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - (nowMs - lastFiredMs) / cooldownMs));
}

// ---------------------------------------------------------------------------
// Explosives
// ---------------------------------------------------------------------------

/**
 * How much of a blast reaches something this far from its center: full
 * strength at the center, a quarter at the edge, nothing outside.
 */
export function blastFalloff(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  return 1 - 0.75 * (Math.max(0, distance) / radius);
}

/**
 * The angle to fire a projectile at `speed` so gravity drops it onto a target
 * `dx` across and `dy` down (screen coordinates: +y is down). Picks the lower,
 * flatter of the two possible arcs. Returns null if the target is out of range.
 * Units are per physics step: speed in pixels/step, gravity in pixels/step².
 */
export function launchAngle(dx: number, dy: number, speed: number, gravity: number): number | null {
  if (gravity <= 0) return Math.atan2(dy, dx);
  const up = -dy; // the usual formula wants +y up
  const v2 = speed * speed;
  const root = v2 * v2 - gravity * (gravity * dx * dx + 2 * up * v2);
  if (root < 0) return null;
  const flat = Math.atan2(v2 - Math.sqrt(root), gravity * Math.abs(dx)); // angle above horizontal
  const ux = Math.cos(flat) * Math.sign(dx || 1);
  const uy = -Math.sin(flat); // back to screen coordinates
  return Math.atan2(uy, ux);
}
