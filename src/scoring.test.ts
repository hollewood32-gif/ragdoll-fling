// Tests for the scoring rules. Run with: npm test

import { describe, expect, it } from "vitest";
import { CONFIG } from "./config";
import { Combo, damageFromSpeed, pointsForHit } from "./scoring";

describe("pointsForHit", () => {
  it("multiplies thrown hits by the combo", () => {
    expect(pointsForHit(100, 2.5, false)).toBe(250);
  });

  it("scores held hits at a fraction and ignores the combo", () => {
    expect(pointsForHit(100, 5, true)).toBe(100 * CONFIG.heldHitFactor);
  });

  it("always gives a held hit at least 1 point", () => {
    expect(pointsForHit(1, 1, true)).toBe(1);
  });

  it("makes throwing worth more than holding for the same hit", () => {
    expect(pointsForHit(80, 1, false)).toBeGreaterThan(pointsForHit(80, 1, true));
  });
});

describe("damageFromSpeed", () => {
  it("gives no damage for impacts below the minimum speed", () => {
    expect(damageFromSpeed(0)).toBe(0);
    expect(damageFromSpeed(CONFIG.minImpactSpeed - 0.01)).toBe(0);
  });

  it("gives at least 1 damage right at the minimum speed", () => {
    expect(damageFromSpeed(CONFIG.minImpactSpeed)).toBe(1);
  });

  it("grows faster than speed, so hard hits feel big", () => {
    // 9 above the minimum -> 9^1.5 = 27
    expect(damageFromSpeed(CONFIG.minImpactSpeed + 9)).toBe(27);
    const soft = damageFromSpeed(CONFIG.minImpactSpeed + 5);
    const hard = damageFromSpeed(CONFIG.minImpactSpeed + 10);
    expect(hard).toBeGreaterThan(soft * 2);
  });
});

describe("Combo", () => {
  it("starts at a x1 multiplier", () => {
    const combo = new Combo();
    expect(combo.multiplier).toBe(1);
    expect(combo.hit()).toBe(1);
  });

  it("grows by one step for each quick hit", () => {
    const combo = new Combo();
    combo.hit();
    expect(combo.hit()).toBe(1 + CONFIG.comboStep);
    expect(combo.hit()).toBe(1 + 2 * CONFIG.comboStep);
  });

  it("never goes above the maximum multiplier", () => {
    const combo = new Combo();
    for (let i = 0; i < 100; i++) combo.hit();
    expect(combo.multiplier).toBe(CONFIG.maxMultiplier);
  });

  it("breaks if the player waits longer than the combo window", () => {
    const combo = new Combo();
    combo.hit();
    combo.hit();
    combo.update(CONFIG.comboWindowSeconds + 0.1);
    expect(combo.count).toBe(0);
    expect(combo.hit()).toBe(1);
  });

  it("keeps going if the next hit lands inside the window", () => {
    const combo = new Combo();
    combo.hit();
    combo.update(CONFIG.comboWindowSeconds - 0.1);
    expect(combo.hit()).toBe(1 + CONFIG.comboStep);
  });

  it("keeps a combo alive longer when the window is widened", () => {
    const combo = new Combo();
    combo.windowSeconds = 1.75;
    combo.hit();
    combo.update(1.5); // too slow for the normal 1s window
    expect(combo.hit()).toBe(1 + CONFIG.comboStep);
  });

  it("resets back to the start", () => {
    const combo = new Combo();
    combo.hit();
    combo.hit();
    combo.reset();
    expect(combo.count).toBe(0);
    expect(combo.multiplier).toBe(1);
  });
});
