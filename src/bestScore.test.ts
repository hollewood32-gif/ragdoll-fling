// Tests for best-score memory. Run with: npm test

import { describe, expect, it } from "vitest";
import { loadBestScore, recordScore, type ScoreStorage } from "./bestScore";

/** A pretend localStorage that keeps values in memory. */
function fakeStorage(initial: Record<string, string> = {}): ScoreStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

/** A storage that throws on every call, like a blocked localStorage. */
const brokenStorage: ScoreStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("loadBestScore", () => {
  it("is 0 when nothing has been saved yet", () => {
    expect(loadBestScore(fakeStorage())).toBe(0);
  });

  it("reads a saved score", () => {
    expect(loadBestScore(fakeStorage({ "ragdoll-fling:best-score": "4460" }))).toBe(4460);
  });

  it("treats garbage or negative values as 0", () => {
    expect(loadBestScore(fakeStorage({ "ragdoll-fling:best-score": "banana" }))).toBe(0);
    expect(loadBestScore(fakeStorage({ "ragdoll-fling:best-score": "-50" }))).toBe(0);
  });

  it("is 0 when storage is missing or blocked", () => {
    expect(loadBestScore(undefined)).toBe(0);
    expect(loadBestScore(brokenStorage)).toBe(0);
  });
});

describe("recordScore", () => {
  it("saves a score that beats the previous best", () => {
    const storage = fakeStorage();
    expect(recordScore(storage, 500, 100)).toEqual({ best: 500, isNewBest: true });
    expect(loadBestScore(storage)).toBe(500);
  });

  it("keeps the old best when the score is lower or equal", () => {
    const storage = fakeStorage({ "ragdoll-fling:best-score": "500" });
    expect(recordScore(storage, 300, 500)).toEqual({ best: 500, isNewBest: false });
    expect(recordScore(storage, 500, 500)).toEqual({ best: 500, isNewBest: false });
    expect(loadBestScore(storage)).toBe(500);
  });

  it("doesn't count a score of 0 as a new best", () => {
    expect(recordScore(fakeStorage(), 0, 0).isNewBest).toBe(false);
  });

  it("still reports a new best when storage is blocked", () => {
    expect(recordScore(brokenStorage, 900, 100)).toEqual({ best: 900, isNewBest: true });
  });
});
