// Tests for the sound helpers. The audio itself is checked by ear;
// these cover the numbers and the saved mute setting. Run with: npm test

import { describe, expect, it } from "vitest";
import type { ScoreStorage } from "./bestScore";
import { comboPitch, impactPitch, impactVolume, loadMuted, saveMuted } from "./sound";

describe("impactVolume", () => {
  it("is silent for no damage", () => {
    expect(impactVolume(0)).toBe(0);
  });

  it("gets louder with more damage", () => {
    expect(impactVolume(100)).toBeGreaterThan(impactVolume(10));
  });

  it("never goes above full volume", () => {
    expect(impactVolume(1_000_000)).toBe(1);
  });
});

describe("impactPitch", () => {
  it("sounds deeper for harder hits", () => {
    expect(impactPitch(200)).toBeLessThan(impactPitch(5));
  });

  it("never drops below a floor", () => {
    expect(impactPitch(1_000_000)).toBe(55);
  });
});

describe("comboPitch", () => {
  it("starts at 440 Hz (the note A)", () => {
    expect(comboPitch(2)).toBe(440);
  });

  it("rises with the combo", () => {
    expect(comboPitch(5)).toBeGreaterThan(comboPitch(3));
  });

  it("levels off so it doesn't get shrill", () => {
    expect(comboPitch(100)).toBe(comboPitch(18));
  });
});

/** A pretend localStorage that keeps values in memory. */
function memory(): ScoreStorage {
  const data: Record<string, string> = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("mute setting", () => {
  it("defaults to sound on", () => {
    expect(loadMuted(memory())).toBe(false);
    expect(loadMuted(undefined)).toBe(false);
  });

  it("remembers mute and unmute", () => {
    const storage = memory();
    saveMuted(storage, true);
    expect(loadMuted(storage)).toBe(true);
    saveMuted(storage, false);
    expect(loadMuted(storage)).toBe(false);
  });
});
