// Scoring rules. Kept separate from physics and drawing so they can be tested on their own.

import { CONFIG } from "./config";

/**
 * Turns an impact speed into damage.
 * Below the minimum speed there is no damage. Above it, damage grows faster
 * than speed (power 1.5), so hard hits feel much bigger than soft ones.
 */
export function damageFromSpeed(speed: number): number {
  if (speed < CONFIG.minImpactSpeed) return 0;
  const extra = speed - CONFIG.minImpactSpeed;
  return Math.max(1, Math.round(extra ** 1.5));
}

/**
 * Points for one hit. Thrown hits use the combo multiplier. Hits while the
 * ragdoll is still held score a fraction and ignore the combo, so the best
 * strategy is to actually throw it (shaking it against a wall scored ~12x more
 * than throwing before this rule).
 */
export function pointsForHit(damage: number, multiplier: number, held: boolean): number {
  if (held) return Math.max(1, Math.round(damage * CONFIG.heldHitFactor));
  return Math.round(damage * multiplier);
}

/** The source of a hit, for the variety combo: "throw" or a weapon's id. */
export type HitSource = string;

/**
 * Tracks how many hits landed in quick succession, and which kinds of hit
 * (throws, Bat, Pistol, ...) made them. Each extra kind raises the cap, so
 * mixing weapons can push the combo past x5.
 */
export class Combo {
  count = 0;
  /** How long the player has to land the next hit. The combo upgrade raises this. */
  windowSeconds = CONFIG.comboWindowSeconds;
  /** The different kinds of hit in the current combo. */
  readonly sources = new Set<HitSource>();
  private timeSinceHit = Infinity;

  /** The highest the multiplier can go right now: x5, plus 1 per extra kind of hit. */
  get cap(): number {
    const extraKinds = Math.max(0, this.sources.size - 1);
    return Math.min(CONFIG.maxVarietyMultiplier, CONFIG.maxMultiplier + extraKinds);
  }

  /** Current score multiplier: 1, 1.25, 1.5, ... up to the cap. */
  get multiplier(): number {
    if (this.count <= 1) return 1;
    return Math.min(this.cap, 1 + CONFIG.comboStep * (this.count - 1));
  }

  /** Call when a hit lands. Returns the multiplier for that hit. */
  hit(source: HitSource = "throw"): number {
    if (this.timeSinceHit > this.windowSeconds) this.breakCombo();
    this.count += 1;
    this.sources.add(source);
    this.timeSinceHit = 0;
    return this.multiplier;
  }

  /** Call every frame. Breaks the combo if the player paused too long. */
  update(dtSeconds: number): void {
    this.timeSinceHit += dtSeconds;
    if (this.timeSinceHit > this.windowSeconds) this.breakCombo();
  }

  reset(): void {
    this.breakCombo();
    this.timeSinceHit = Infinity;
  }

  private breakCombo(): void {
    this.count = 0;
    this.sources.clear();
  }
}
