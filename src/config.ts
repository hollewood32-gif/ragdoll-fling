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
  // Variety combo: each extra weapon type used in the current combo raises
  // the cap by 1 (throws only stay at maxMultiplier), up to this.
  maxVarietyMultiplier: 10,

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
  // Guns: press empty space to hold one; it aims at the dummy and fires while
  // held. Bullets fly across the arena. A hit does fixed damage and knocks the
  // part along the bullet's path, so steady fire juggles the dummy in the air.
  bulletSpeed: 28, // pixels per physics step (about 1,700 per second)
  pistol: {
    price: 1500,
    damage: 50, // small bullets...
    knockback: 5,
    cooldownMs: 120, // ...in a fast stream (about 8 a second)
  },
  revolver: {
    price: 3000,
    damage: 200, // huge bullets...
    knockback: 18, // ...with a huge kick...
    cooldownMs: 600, // ...fired slowly
  },

  // Explosions hurt every body part within the blast radius (less further
  // out) and throw them outward. A whole blast counts as one hit for scoring.
  // Grenades and cluster bombs are held like the Fist and thrown by letting
  // go: they keep the hand's speed. The fuse starts when they leave the hand.
  maxThrowSpeed: 30, // pixels per step
  grenade: {
    price: 2500,
    radius: 9,
    fuseMs: 1000,
    blastRadius: 150,
    damage: 220,
    knockback: 16,
    cooldownMs: 700, // time before the next one is ready
  },
  cluster: {
    price: 5000,
    radius: 11,
    fuseMs: 1000,
    blastRadius: 120,
    damage: 150,
    knockback: 12,
    cooldownMs: 1400,
    bomblets: 4, // thrown out by the first blast...
    bombletSpeed: 9,
    bombletFuseMs: 500, // ...and each explodes this long after
    bombletRadius: 6,
    bombletBlastRadius: 90,
    bombletDamage: 100,
    bombletKnockback: 9,
  },
  // Cannon and RPG are held and auto-aimed like the guns.
  cannon: {
    price: 4000,
    cooldownMs: 1200,
    ballRadius: 14,
    ballSpeed: 20, // the Cannon aims high enough for gravity to drop the ball onto the dummy
    damage: 1.6, // times a thrown hit at the same speed
    knockback: 6,
  },
  rpg: {
    price: 7500,
    cooldownMs: 2000,
    startSpeed: 6, // rockets speed up as they fly
    acceleration: 1,
    maxSpeed: 30,
    blastRadius: 180,
    damage: 350,
    knockback: 22,
  },
  // Katana: a light, fast swung blade. Short cooldown so quick slashes chain.
  katana: {
    price: 2000,
    length: 110,
    width: 6,
    damage: 0.7,
    knockback: 1.5, // slices more than it shoves
    cooldownMs: 150,
  },
  // Shotgun: held and auto-aimed. Each shot is a spread of pellets that only
  // fly a short way, so it's strongest up close.
  shotgun: {
    price: 3500,
    pellets: 6,
    spread: 0.5, // radians between the outermost pellets
    damage: 35, // per pellet
    knockback: 6, // per pellet
    rangeSteps: 18, // pellets vanish after this many physics steps (~500 px)
    cooldownMs: 900,
  },
  // Flamethrower: held and auto-aimed. Sprays a short cone of flame; body
  // parts the flames touch catch fire. Each burn tick adds up every burning
  // part's damage and counts as ONE hit, so fire can't flood the combo.
  flamethrower: {
    price: 6000,
    cooldownMs: 50, // a new puff of flame this often
    flameSpeed: 11, // pixels per step
    spread: 0.35, // radians across the cone
    flameSeconds: 0.35, // how long a puff lives (sets the range, about 230 px)
    burnSeconds: 2.5,
    burnTickMs: 250,
    burnDamage: 8, // per burning part, per tick
    knockback: 0.3, // flames barely push
  },
  // Boomerang: held like a grenade, then flung. It curves back toward where it
  // was thrown from and can hit on the way out and on the way back.
  boomerang: {
    price: 3000,
    cooldownMs: 1000,
    minSpeed: 14, // a weak flick still sends it toward the dummy
    maxSpeed: 26,
    returnPull: 0.6, // pixels per step squared, back toward the thrower
    damage: 90,
    knockback: 8,
    hitCooldownMs: 400, // the same part can be hit once on the way out and once back
    maxSeconds: 3,
    catchRadius: 30,
  },
  spikesPrice: 3000,
};
