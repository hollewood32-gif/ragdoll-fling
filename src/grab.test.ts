// Tests for picking which part a click or touch grabs. Run with: npm test

import { describe, expect, it } from "vitest";
import { distanceToBounds, GRAB_RADIUS, pickPart } from "./grab";
import { createRagdoll } from "./ragdoll";

const box = { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } };

describe("distanceToBounds", () => {
  it("is 0 inside the box", () => {
    expect(distanceToBounds({ x: 5, y: 5 }, box)).toBe(0);
  });

  it("measures straight out from a side", () => {
    expect(distanceToBounds({ x: 15, y: 5 }, box)).toBe(5);
  });

  it("measures diagonally from a corner", () => {
    expect(distanceToBounds({ x: 13, y: 14 }, box)).toBe(5);
  });
});

describe("pickPart", () => {
  const ragdoll = createRagdoll(400, 300);
  const torso = ragdoll.parts[8];

  it("grabs the exact spot when pressing on a part", () => {
    const target = pickPart(ragdoll.parts, { x: 405, y: 300 }, GRAB_RADIUS.mouse);
    expect(target?.body).toBe(torso);
    expect(target?.offset).toEqual({ x: 5, y: 0 });
  });

  it("lets a finger grab a part it just missed, by its center", () => {
    // 30px to the right of the torso and arms: a miss for a mouse, fine for a finger
    const point = { x: 400 + 17 + 6 + 30, y: 280 };
    expect(pickPart(ragdoll.parts, point, GRAB_RADIUS.mouse)).toBeNull();
    const target = pickPart(ragdoll.parts, point, GRAB_RADIUS.touch);
    expect(target).not.toBeNull();
    expect(target?.offset).toEqual({ x: 0, y: 0 });
  });

  it("grabs nothing when the press is far away", () => {
    expect(pickPart(ragdoll.parts, { x: 50, y: 50 }, GRAB_RADIUS.touch)).toBeNull();
  });
});
