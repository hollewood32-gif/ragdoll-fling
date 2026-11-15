// Tests for the scoring rules. Run with: npm test

import { describe, expect, it } from "vitest";
import { CONFIG } from "./config";
import { Combo, damageFromSpeed, fadeFactor, pointsForHit } from "./scoring";

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

/** Lands `n` hits from the same source. */
function many(combo: Combo, n: number, source: string): void {
  for (let i = 0; i < n; i++) combo.hit(source);
}

describe("variety combo", () => {

  it("stays capped at x5 with throws only (so Pure rounds don't change)", () => {
    const combo = new Combo();
    many(combo, 100, "throw");
    expect(combo.multiplier).toBe(CONFIG.maxMultiplier);
  });

  it("raises the cap by 1 for each extra kind of hit", () => {
    const combo = new Combo();
    many(combo, 50, "throw");
    combo.hit("bat");
    expect(combo.cap).toBe(6);
    many(combo, 10, "pistol");
    expect(combo.cap).toBe(7);
    expect(combo.multiplier).toBe(7);
  });

  it("never goes past x10", () => {
    const combo = new Combo();
    for (const source of ["throw", "fist", "bat", "axe", "pistol", "revolver", "grenade", "rpg"]) {
      many(combo, 10, source);
    }
    expect(combo.cap).toBe(CONFIG.maxVarietyMultiplier);
    expect(combo.multiplier).toBe(CONFIG.maxVarietyMultiplier);
  });

  it("forgets the kinds of hit when the combo breaks", () => {
    const combo = new Combo();
    combo.hit("throw");
    combo.hit("bat");
    combo.update(combo.windowSeconds + 0.1);
    expect(combo.sources.size).toBe(0);
    combo.hit("pistol");
    expect(combo.cap).toBe(CONFIG.maxMultiplier);
  });

  it("counts the same weapon only once", () => {
    const combo = new Combo();
    many(combo, 20, "bat");
    expect(combo.cap).toBe(CONFIG.maxMultiplier);
  });
});

describe("combo fade", () => {
  it("halves a weapon's combo step for every 2 seconds without switching", () => {
    expect(fadeFactor(0, "bat")).toBe(1);
    expect(fadeFactor(1.9, "bat")).toBe(1);
    expect(fadeFactor(2, "bat")).toBe(0.5);
    expect(fadeFactor(4.5, "bat")).toBe(0.25);
  });

  it("never fades throws, so Pure rounds don't change", () => {
    expect(fadeFactor(10, "throw")).toBe(1);
    const combo = new Combo();
    combo.update(10); // a long time without switching
    many(combo, 5, "throw");
    expect(combo.multiplier).toBe(1 + 4 * CONFIG.comboStep);
  });

  it("makes weapon hits add less after 2 seconds on one weapon", () => {
    const combo = new Combo();
    combo.hit("bat"); // x1
    combo.secondsOnWeapon = 2.5; // kept the bat 2.5 s
    combo.hit("bat");
    expect(combo.multiplier).toBe(1 + CONFIG.comboStep / 2);
    expect(combo.fading).toBe(true);
  });

  it("goes back to full steps after switching weapon", () => {
    const combo = new Combo();
    combo.hit("bat");
    combo.secondsOnWeapon = 5;
    combo.weaponSwitched();
    combo.hit("pistol");
    expect(combo.multiplier).toBe(1 + CONFIG.comboStep);
    expect(combo.fading).toBe(false);
  });
});
