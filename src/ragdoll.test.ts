// Tests for the ragdoll's "whole-body speed", which stops a resting ragdoll
// with a twitching limb from scoring free points. Run with: npm test

import Matter from "matter-js";
import { describe, expect, it } from "vitest";
import { CONFIG } from "./config";
import { createRagdoll, wholeBodySpeed } from "./ragdoll";

const { Body } = Matter;

describe("wholeBodySpeed", () => {
  it("is zero for a ragdoll that isn't moving", () => {
    const ragdoll = createRagdoll(100, 100);
    expect(wholeBodySpeed(ragdoll)).toBe(0);
  });

  it("equals the speed when every part moves together", () => {
    const ragdoll = createRagdoll(100, 100);
    for (const part of ragdoll.parts) Body.setVelocity(part, { x: 3, y: 4 });
    expect(wholeBodySpeed(ragdoll)).toBeCloseTo(5);
  });

  it("stays below the scoring threshold when only one lower leg flails", () => {
    const ragdoll = createRagdoll(100, 100);
    const lowerLeg = ragdoll.parts[1];
    // A fast limb (well above the impact threshold) on an otherwise still body
    Body.setVelocity(lowerLeg, { x: 0, y: 10 });
    expect(wholeBodySpeed(ragdoll)).toBeLessThan(CONFIG.minBodySpeed);
  });
});
