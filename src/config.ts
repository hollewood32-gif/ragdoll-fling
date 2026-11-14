// All the "feel" numbers live here so they are easy to tweak.

export const CONFIG = {
  // Size of the game world in pixels. The canvas is scaled to fit the window.
  width: 960,
  height: 600,

  // Length of one round, in seconds.
  roundSeconds: 30,

  // Walls are thick so a fast-moving ragdoll can't slip through them.
  wallThickness: 200,

  // Impacts slower than this deal no damage (stops tiny bumps from scoring).
  minImpactSpeed: 4,

  // The ragdoll as a whole (its center of mass) must be moving at least this
  // fast for a hit to count. This stops a resting ragdoll whose limb is
  // twitching against the floor from earning free points.
  minBodySpeed: 1.5,

  // Hits while the player is still holding the ragdoll score this fraction of
  // normal and don't build the combo, so throwing beats shaking it against a wall.
  heldHitFactor: 0.25,

  // A combo continues if the next hit lands within this many seconds.
  comboWindowSeconds: 1.0,
  // Each hit in a combo adds this much to the multiplier, up to maxMultiplier.
  comboStep: 0.25,
  maxMultiplier: 5,

  // The same body part can't score again until this many milliseconds pass.
  hitCooldownMs: 120,

  // Currency: one coin for every this-many points of damage in a round.
  damagePerCoin: 100,

  // Upgrades: price of levels 1 to 5 (each about x1.75 the one before).
  upgradePrices: [500, 900, 1600, 2800, 5000],
  // What one level of each upgrade adds.
  upgradeRoundSecondsPerLevel: 3,
  upgradeDamagePerLevel: 0.1, // +10% damage
  upgradeComboWindowPerLevel: 0.15, // seconds
  upgradeBouncePerLevel: 0.1, // wall bounciness ("restitution"), from 0.4 up to 0.9
  baseWallBounce: 0.4,

  // Speed cap for ragdoll parts, so they don't fly through walls.
  maxSpeed: 45,
};
