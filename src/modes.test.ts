// Tests for game modes and the damage numbers setting. Run with: npm test

import { describe, expect, it } from "vitest";
import type { ScoreStorage } from "./bestScore";
import { DAMAGE_NUMBERS_KEY, loadDamageNumbers, sandboxWeapons, saveDamageNumbers } from "./modes";
import { STARTING_WEAPONS } from "./weapons";

function memory(initial: Record<string, string> = {}): ScoreStorage {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("sandbox weapons", () => {
  it("unlocks every weapon at level 1 at least", () => {
    const levels = sandboxWeapons(STARTING_WEAPONS);
    expect(Object.values(levels).every((level) => level >= 1)).toBe(true);
  });

  it("keeps levels the player already bought", () => {
    expect(sandboxWeapons({ ...STARTING_WEAPONS, bat: 4 }).bat).toBe(4);
  });

  it("doesn't change the player's real purchases", () => {
    const owned = { ...STARTING_WEAPONS };
    sandboxWeapons(owned);
    expect(owned).toEqual(STARTING_WEAPONS);
  });
});

describe("damage numbers setting", () => {
  it("is on by default, and remembers being switched off", () => {
    const storage = memory();
    expect(loadDamageNumbers(storage)).toBe(true);
    saveDamageNumbers(storage, false);
    expect(loadDamageNumbers(storage)).toBe(false);
    expect(loadDamageNumbers(memory({ [DAMAGE_NUMBERS_KEY]: "1" }))).toBe(true);
  });

  it("works without storage", () => {
    expect(loadDamageNumbers(undefined)).toBe(true);
  });
});
