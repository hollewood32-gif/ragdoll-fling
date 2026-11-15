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

  // Weapons. Level-up prices are these multiples of the weapon's buy price
  // (buying gives level 1, so these are levels 2 to 5).
  weaponLevelUpFactors: [0.5, 1, 1.5, 2],
  // Each level after the first adds this much damage and knockback (+15%).
  weaponPowerPerLevel: 0.15,
  // Spiked walls: wall hits deal +25% at level 1, then +10% more per level.
  spikesBaseBonus: 0.25,
  spikesBonusPerLevel: 0.1,

  // Swung (melee) weapons follow the pointer like a hand. Each physics step
  // they cover this fraction of the gap to the pointer, up to a top speed.
  swingFollow: 0.8,
  maxSwingSpeed: 40,
  // A swung weapon can land at most one scoring hit per this many milliseconds
  // (across all body parts), so fast swipes over a lying dummy cannot farm points.
  swingHitCooldownMs: 250,
  fist: {
    price: 0, // free: everyone starts with it
    radius: 16,
    damage: 0.6, // fraction of a thrown hit at the same speed
    knockback: 2, // extra push on the part that was hit
  },
  // Long weapons (Bat, Axe): the hitting end sits under the pointer and the
  // handle trails behind the motion, so a sideways sweep swings the side of the
  // weapon through the dummy. Each step it turns this fraction of the way to the
  // trailing angle, up to a cap (radians per step).
  swingTurnRate: 0.15,
  maxSwingTurn: 0.3,
  bat: {
    price: 1000,
    length: 100,
    width: 12,
    damage: 0.8,
    knockback: 7, // huge: sends the dummy flying into walls
    cooldownMs: 400, // min time between scoring hits
  },
  axe: {
    price: 2000,
    length: 80, // handle
    width: 8,
    headWidth: 26, // the blade at the far end
    headHeight: 30,
    damage: 1.5, // big hits...
    knockback: 1.5, // ...that don't push the dummy far
    cooldownMs: 600, // slow and heavy
  },
  spikesPrice: 3000,
};
