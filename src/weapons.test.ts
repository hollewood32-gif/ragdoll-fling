// Tests for weapon prices, levels and saving. Run with: npm test

import { describe, expect, it } from "vitest";
import type { ScoreStorage } from "./bestScore";
import {
  buyWeapon,
  loadSelectedWeapon,
  loadWeapons,
  MAX_WEAPON_LEVEL,
  nextWeaponPrice,
  saveSelectedWeapon,
  saveWeapons,
  selectableWeapons,
  spikesMultiplier,
  STARTING_WEAPONS,
  weaponPower,
  WEAPONS_KEY,
} from "./weapons";

function memory(initial: Record<string, string> = {}): ScoreStorage {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("starting weapons", () => {
  it("gives everyone the Fist, and nothing else", () => {
    expect(STARTING_WEAPONS).toEqual({ fist: 1, bat: 0, axe: 0, spikes: 0 });
  });
});

describe("prices", () => {
  it("charges the buy price, then 0.5x, 1x, 1.5x and 2x of it", () => {
    expect(nextWeaponPrice("spikes", 0)).toBe(3000);
    expect(nextWeaponPrice("spikes", 1)).toBe(1500);
    expect(nextWeaponPrice("spikes", 2)).toBe(3000);
    expect(nextWeaponPrice("spikes", 3)).toBe(4500);
    expect(nextWeaponPrice("spikes", 4)).toBe(6000);
    expect(nextWeaponPrice("spikes", MAX_WEAPON_LEVEL)).toBeNull();
  });

  it("prices the free Fist's level-ups like a 1,000-coin weapon", () => {
    expect(nextWeaponPrice("fist", 1)).toBe(500);
    expect(nextWeaponPrice("fist", 4)).toBe(2000);
  });
});

describe("buying", () => {
  it("buys a weapon and takes the coins", () => {
    expect(buyWeapon(STARTING_WEAPONS, "spikes", 3500)).toEqual({ levels: { ...STARTING_WEAPONS, spikes: 1 }, coins: 500 });
  });

  it("refuses when the player can't afford it or it's maxed", () => {
    expect(buyWeapon(STARTING_WEAPONS, "spikes", 2999)).toBeNull();
    expect(buyWeapon({ ...STARTING_WEAPONS, fist: MAX_WEAPON_LEVEL }, "fist", 99999)).toBeNull();
  });
});

describe("power", () => {
  it("adds 15% per level after the first", () => {
    expect(weaponPower(1)).toBe(1);
    expect(weaponPower(5)).toBeCloseTo(1.6);
  });

  it("spiked walls add 25%, then 10% per level, and nothing when not owned", () => {
    expect(spikesMultiplier(0)).toBe(1);
    expect(spikesMultiplier(1)).toBeCloseTo(1.25);
    expect(spikesMultiplier(5)).toBeCloseTo(1.65);
  });
});

describe("selecting", () => {
  it("only lists owned weapons that have a key", () => {
    expect(selectableWeapons({ fist: 1, bat: 0, axe: 2, spikes: 3 }).map((w) => w.id)).toEqual(["fist", "axe"]);
  });

  it("remembers the selected weapon and falls back to the first one", () => {
    const storage = memory();
    expect(loadSelectedWeapon(storage, STARTING_WEAPONS)).toBe("fist");
    saveSelectedWeapon(storage, "spikes"); // not selectable
    expect(loadSelectedWeapon(storage, STARTING_WEAPONS)).toBe("fist");
  });
});

describe("saving", () => {
  it("saves and loads levels", () => {
    const storage = memory();
    saveWeapons(storage, { fist: 3, bat: 1, axe: 0, spikes: 2 });
    expect(loadWeapons(storage)).toEqual({ fist: 3, bat: 1, axe: 0, spikes: 2 });
  });

  it("repairs broken or out-of-range saves", () => {
    expect(loadWeapons(memory({ [WEAPONS_KEY]: "not json" }))).toEqual(STARTING_WEAPONS);
    expect(loadWeapons(memory({ [WEAPONS_KEY]: '{"fist":0,"spikes":99}' }))).toEqual({ ...STARTING_WEAPONS, spikes: 5 });
    expect(loadWeapons(memory({ [WEAPONS_KEY]: '{"fist":2.5,"spikes":"3"}' }))).toEqual(STARTING_WEAPONS);
  });
});

describe("bat and axe", () => {
  it("cost 1,000 and 2,000, and use keys 2 and 3", () => {
    expect(nextWeaponPrice("bat", 0)).toBe(1000);
    expect(nextWeaponPrice("axe", 0)).toBe(2000);
    expect(nextWeaponPrice("axe", 1)).toBe(1000);
    const keys = selectableWeapons({ fist: 1, bat: 1, axe: 1, spikes: 1 }).map((w) => w.key);
    expect(keys).toEqual([1, 2, 3]);
  });
});
