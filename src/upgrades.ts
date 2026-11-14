// Upgrades: what they cost, what they do, and how they're saved.
// No drawing or physics here, so the rules can be unit tested.

import type { ScoreStorage } from "./bestScore";
import { CONFIG } from "./config";

export type UpgradeId = "roundTime" | "damage" | "comboWindow" | "bounce";
export type UpgradeLevels = Record<UpgradeId, number>;

export const MAX_LEVEL = CONFIG.upgradePrices.length; // 5

export interface UpgradeInfo {
  id: UpgradeId;
  name: string;
  /** What the upgrade does at a given level, for the shop screen. */
  describe: (level: number) => string;
}

export const UPGRADES: UpgradeInfo[] = [
  {
    id: "roundTime",
    name: "Longer rounds",
    describe: (level) => `${CONFIG.roundSeconds + level * CONFIG.upgradeRoundSecondsPerLevel}s rounds`,
  },
  {
    id: "damage",
    name: "Harder hits",
    describe: (level) => `+${Math.round(level * CONFIG.upgradeDamagePerLevel * 100)}% damage`,
  },
  {
    id: "comboWindow",
    name: "Longer combos",
    describe: (level) =>
      `${(CONFIG.comboWindowSeconds + level * CONFIG.upgradeComboWindowPerLevel).toFixed(2)}s to keep a combo`,
  },
  {
    id: "bounce",
    name: "Bouncier walls",
    describe: (level) => `${Math.round((CONFIG.baseWallBounce + level * CONFIG.upgradeBouncePerLevel) * 100)}% bounce`,
  },
];

export const NO_UPGRADES: UpgradeLevels = { roundTime: 0, damage: 0, comboWindow: 0, bounce: 0 };

/** Price of the next level, or null if the upgrade is maxed out. */
export function nextPrice(currentLevel: number): number | null {
  return currentLevel >= MAX_LEVEL ? null : CONFIG.upgradePrices[currentLevel];
}

/**
 * Tries to buy the next level of an upgrade. Returns the new levels and coin
 * balance, or null if it's maxed out or the player can't afford it.
 */
export function buyUpgrade(
  levels: UpgradeLevels,
  id: UpgradeId,
  coins: number,
): { levels: UpgradeLevels; coins: number } | null {
  const price = nextPrice(levels[id]);
  if (price === null || coins < price) return null;
  return { levels: { ...levels, [id]: levels[id] + 1 }, coins: coins - price };
}

/** True if any upgrade has been bought. */
export function hasAnyUpgrade(levels: UpgradeLevels): boolean {
  return Object.values(levels).some((level) => level > 0);
}

/** The numbers the game actually uses for a round, given the active upgrades. */
export interface RoundSettings {
  roundSeconds: number;
  damageMultiplier: number;
  comboWindowSeconds: number;
  wallBounce: number;
}

export function roundSettings(levels: UpgradeLevels): RoundSettings {
  return {
    roundSeconds: CONFIG.roundSeconds + levels.roundTime * CONFIG.upgradeRoundSecondsPerLevel,
    damageMultiplier: 1 + levels.damage * CONFIG.upgradeDamagePerLevel,
    comboWindowSeconds: CONFIG.comboWindowSeconds + levels.comboWindow * CONFIG.upgradeComboWindowPerLevel,
    wallBounce: CONFIG.baseWallBounce + levels.bounce * CONFIG.upgradeBouncePerLevel,
  };
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

export const UPGRADES_KEY = "ragdoll-fling:upgrades";
export const UPGRADES_ENABLED_KEY = "ragdoll-fling:upgrades-enabled";

/** Reads saved levels. Missing, broken or out-of-range values become 0. */
export function loadUpgrades(storage: ScoreStorage | undefined): UpgradeLevels {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(UPGRADES_KEY) ?? "{}");
    const saved = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
    const levels = { ...NO_UPGRADES };
    for (const id of Object.keys(levels) as UpgradeId[]) {
      const value = saved[id];
      if (typeof value === "number" && Number.isInteger(value)) {
        levels[id] = Math.min(MAX_LEVEL, Math.max(0, value));
      }
    }
    return levels;
  } catch {
    return { ...NO_UPGRADES };
  }
}

export function saveUpgrades(storage: ScoreStorage | undefined, levels: UpgradeLevels): void {
  try {
    storage?.setItem(UPGRADES_KEY, JSON.stringify(levels));
  } catch {
    // Storage blocked: upgrades still work for this visit.
  }
}

/** The Upgrades On/Off switch. Defaults to on. */
export function loadUpgradesEnabled(storage: ScoreStorage | undefined): boolean {
  try {
    return storage?.getItem(UPGRADES_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveUpgradesEnabled(storage: ScoreStorage | undefined, enabled: boolean): void {
  try {
    storage?.setItem(UPGRADES_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // Can't remember it; it still applies for this visit.
  }
}
