// Tests for upgrade rules and saving. Run with: npm test

import { describe, expect, it } from "vitest";
import type { ScoreStorage } from "./bestScore";
import { CONFIG } from "./config";
import {
  buyUpgrade,
  hasAnyUpgrade,
  loadUpgrades,
  loadUpgradesEnabled,
  MAX_LEVEL,
  nextPrice,
  NO_UPGRADES,
  roundSettings,
  saveUpgrades,
  saveUpgradesEnabled,
  UPGRADES,
  UPGRADES_KEY,
} from "./upgrades";

function memory(initial: Record<string, string> = {}): ScoreStorage {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("prices", () => {
  it("follows the price list, then stops at the max level", () => {
    expect(nextPrice(0)).toBe(500);
    expect(nextPrice(4)).toBe(5000);
    expect(nextPrice(MAX_LEVEL)).toBeNull();
  });
});

describe("buyUpgrade", () => {
  it("raises the level and takes the coins", () => {
    expect(buyUpgrade(NO_UPGRADES, "damage", 700)).toEqual({
      levels: { ...NO_UPGRADES, damage: 1 },
      coins: 200,
    });
  });

  it("refuses when the player can't afford it", () => {
    expect(buyUpgrade(NO_UPGRADES, "damage", 499)).toBeNull();
  });

  it("refuses when the upgrade is maxed out", () => {
    expect(buyUpgrade({ ...NO_UPGRADES, bounce: MAX_LEVEL }, "bounce", 1_000_000)).toBeNull();
  });

  it("doesn't change the levels it was given", () => {
    const levels = { ...NO_UPGRADES };
    buyUpgrade(levels, "roundTime", 1000);
    expect(levels.roundTime).toBe(0);
  });
});

describe("roundSettings", () => {
  it("matches the normal game with no upgrades", () => {
    expect(roundSettings(NO_UPGRADES)).toEqual({
      roundSeconds: CONFIG.roundSeconds,
      damageMultiplier: 1,
      comboWindowSeconds: CONFIG.comboWindowSeconds,
      wallBounce: CONFIG.baseWallBounce,
    });
  });

  it("gives the designed values at max level", () => {
    const max = { roundTime: 5, damage: 5, comboWindow: 5, bounce: 5 };
    const settings = roundSettings(max);
    expect(settings.roundSeconds).toBe(45);
    expect(settings.damageMultiplier).toBeCloseTo(1.5);
    expect(settings.comboWindowSeconds).toBeCloseTo(1.75);
    expect(settings.wallBounce).toBeCloseTo(0.9);
  });
});

describe("hasAnyUpgrade", () => {
  it("is false until something is bought", () => {
    expect(hasAnyUpgrade(NO_UPGRADES)).toBe(false);
    expect(hasAnyUpgrade({ ...NO_UPGRADES, comboWindow: 1 })).toBe(true);
  });
});

describe("shop text", () => {
  it("describes each upgrade at level 0 and level 5", () => {
    const texts = UPGRADES.map((u) => [u.describe(0), u.describe(5)]);
    expect(texts).toEqual([
      ["30s rounds", "45s rounds"],
      ["+0% damage", "+50% damage"],
      ["1.00s to keep a combo", "1.75s to keep a combo"],
      ["40% bounce", "90% bounce"],
    ]);
  });
});

describe("saving", () => {
  it("starts with no upgrades and the switch on", () => {
    expect(loadUpgrades(memory())).toEqual(NO_UPGRADES);
    expect(loadUpgradesEnabled(memory())).toBe(true);
  });

  it("remembers levels and the switch", () => {
    const storage = memory();
    saveUpgrades(storage, { ...NO_UPGRADES, damage: 3 });
    saveUpgradesEnabled(storage, false);
    expect(loadUpgrades(storage).damage).toBe(3);
    expect(loadUpgradesEnabled(storage)).toBe(false);
  });

  it("ignores broken or out-of-range saved data", () => {
    expect(loadUpgrades(memory({ [UPGRADES_KEY]: "not json" }))).toEqual(NO_UPGRADES);
    const loaded = loadUpgrades(memory({ [UPGRADES_KEY]: '{"damage": 99, "bounce": -2, "roundTime": "3"}' }));
    expect(loaded).toEqual({ ...NO_UPGRADES, damage: MAX_LEVEL });
  });
});
