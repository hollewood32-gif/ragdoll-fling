// Tests for the results-screen stats. Run with: npm test

import { describe, expect, it } from "vitest";
import { RoundStats } from "./stats";

describe("RoundStats", () => {
  it("starts empty", () => {
    const stats = new RoundStats();
    expect(stats.biggestHit).toBe(0);
    expect(stats.bestMultiplier).toBe(1);
    expect(stats.throws).toBe(0);
  });

  it("keeps the biggest hit and the best multiplier", () => {
    const stats = new RoundStats();
    stats.recordHit(120, 1.5);
    stats.recordHit(80, 3);
    stats.recordHit(300, 2);
    expect(stats.biggestHit).toBe(300);
    expect(stats.bestMultiplier).toBe(3);
  });

  it("counts throws", () => {
    const stats = new RoundStats();
    stats.recordThrow();
    stats.recordThrow();
    expect(stats.throws).toBe(2);
  });

  it("resets for the next round", () => {
    const stats = new RoundStats();
    stats.recordHit(500, 5);
    stats.recordThrow();
    stats.reset();
    expect(stats).toMatchObject({ biggestHit: 0, bestMultiplier: 1, throws: 0 });
  });
});
