// Per-round stats shown on the results screen.

export class RoundStats {
  biggestHit = 0; // most points from a single hit
  bestMultiplier = 1; // highest combo multiplier reached
  throws = 0; // times the player let go of the ragdoll

  recordHit(points: number, multiplier: number): void {
    this.biggestHit = Math.max(this.biggestHit, points);
    this.bestMultiplier = Math.max(this.bestMultiplier, multiplier);
  }

  recordThrow(): void {
    this.throws += 1;
  }

  reset(): void {
    this.biggestHit = 0;
    this.bestMultiplier = 1;
    this.throws = 0;
  }
}
