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

/** Tracks how many hits landed in quick succession. */
export class Combo {
  count = 0;
  private timeSinceHit = Infinity;

  /** Current score multiplier: 1, 1.25, 1.5, ... up to the max. */
  get multiplier(): number {
    if (this.count <= 1) return 1;
    return Math.min(CONFIG.maxMultiplier, 1 + CONFIG.comboStep * (this.count - 1));
  }

  /** Call when a hit lands. Returns the multiplier for that hit. */
  hit(): number {
    if (this.timeSinceHit > CONFIG.comboWindowSeconds) this.count = 0;
    this.count += 1;
    this.timeSinceHit = 0;
    return this.multiplier;
  }

  /** Call every frame. Breaks the combo if the player paused too long. */
  update(dtSeconds: number): void {
    this.timeSinceHit += dtSeconds;
    if (this.timeSinceHit > CONFIG.comboWindowSeconds) this.count = 0;
  }

  reset(): void {
    this.count = 0;
    this.timeSinceHit = Infinity;
  }
}
