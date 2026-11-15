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
 * How much of a normal combo step a weapon hit adds after this long on the
 * same weapon: full for the first 2 seconds, then half, a quarter, ...
 * Throws always add a full step.
 */
export function fadeFactor(secondsOnWeapon: number, source: HitSource): number {
  if (source === "throw") return 1;
  return 0.5 ** Math.floor(Math.max(0, secondsOnWeapon) / CONFIG.comboFadeSeconds);
}

/**
 * Tracks the combo: how many hits landed in quick succession, which kinds of
 * hit (throws, Bat, Pistol, ...) made them, and how long the player has kept
 * the same weapon. Each extra kind raises the cap, so mixing weapons can push
 * the combo past x5; staying on one weapon makes each hit add less.
 */
export class Combo {
  count = 0;
  /** How long the player has to land the next hit. The combo upgrade raises this. */
  windowSeconds = CONFIG.comboWindowSeconds;
  /** The different kinds of hit in the current combo. */
  readonly sources = new Set<HitSource>();
  /** Seconds since the player last switched weapon (drives the fade). */
  secondsOnWeapon = 0;
  /** The combo before the cap: 1 on the first hit, then each hit adds a (possibly faded) step. */
  private value = 1;
  private timeSinceHit = Infinity;

  /** The highest the multiplier can go right now: x5, plus 1 per extra kind of hit. */
  get cap(): number {
    const extraKinds = Math.max(0, this.sources.size - 1);
    return Math.min(CONFIG.maxVarietyMultiplier, CONFIG.maxMultiplier + extraKinds);
  }

  /** Current score multiplier: 1, 1.25, 1.5, ... up to the cap. */
  get multiplier(): number {
    if (this.count <= 1) return 1;
    return Math.min(this.cap, this.value);
  }

  /**
   * True when the combo is draining: it has weapon hits in it and the player
   * has stayed on one weapon too long. Throws-only combos never drain.
   */
  get draining(): boolean {
    return this.count > 1 && this.fading && [...this.sources].some((s) => s !== "throw");
  }

  /** True when weapon hits are currently adding less than a full step. */
  get fading(): boolean {
    return fadeFactor(this.secondsOnWeapon, "weapon") < 1;
  }

  /** Call when a hit lands. Returns the multiplier for that hit. */
  hit(source: HitSource = "throw"): number {
    if (this.timeSinceHit > this.windowSeconds) this.breakCombo();
    this.count += 1;
    if (this.count > 1) {
      // While draining nothing adds, wall hits included: only switching weapon helps.
      const step = this.draining ? 0 : CONFIG.comboStep * fadeFactor(this.secondsOnWeapon, source);
      this.value = Math.min(CONFIG.maxVarietyMultiplier, this.value + step);
    }
    this.sources.add(source);
    // Never bank more than the cap, so a drain shows up straight away.
    this.value = Math.min(this.value, this.cap);
    this.timeSinceHit = 0;
    return this.multiplier;
  }

  /** Call when the player switches weapon: the fade starts over. */
  weaponSwitched(): void {
    this.secondsOnWeapon = 0;
  }

  /** Call every frame. Breaks the combo if the player paused too long. */
  update(dtSeconds: number): void {
    this.timeSinceHit += dtSeconds;
    this.secondsOnWeapon += dtSeconds;
    if (this.draining) this.value = Math.max(1, this.value - CONFIG.comboDrainPerSecond * dtSeconds);
    if (this.timeSinceHit > this.windowSeconds) this.breakCombo();
  }

  reset(): void {
    this.breakCombo();
    this.timeSinceHit = Infinity;
    this.secondsOnWeapon = 0;
  }

  private breakCombo(): void {
    this.count = 0;
    this.value = 1;
    this.sources.clear();
  }
}
