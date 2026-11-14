// Tests for coins. Run with: npm test

import { describe, expect, it } from "vitest";
import type { ScoreStorage } from "./bestScore";
import { coinsForScore, COINS_KEY, loadCoins, saveCoins } from "./coins";

function memory(initial: Record<string, string> = {}): ScoreStorage {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("coinsForScore", () => {
  it("gives 1 coin per 100 damage, rounded down", () => {
    expect(coinsForScore(60_278)).toBe(602);
    expect(coinsForScore(199)).toBe(1);
  });

  it("gives nothing for tiny, zero or broken scores", () => {
    expect(coinsForScore(99)).toBe(0);
    expect(coinsForScore(0)).toBe(0);
    expect(coinsForScore(-5)).toBe(0);
    expect(coinsForScore(Number.NaN)).toBe(0);
  });
});

describe("loadCoins / saveCoins", () => {
  it("starts at 0", () => {
    expect(loadCoins(memory())).toBe(0);
    expect(loadCoins(undefined)).toBe(0);
  });

  it("remembers a balance", () => {
    const storage = memory();
    saveCoins(storage, 1234);
    expect(loadCoins(storage)).toBe(1234);
  });

  it("treats garbage as 0", () => {
    expect(loadCoins(memory({ [COINS_KEY]: "lots" }))).toBe(0);
  });

  it("never saves a negative balance", () => {
    const storage = memory();
    saveCoins(storage, -50);
    expect(loadCoins(storage)).toBe(0);
  });
});
