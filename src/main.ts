// Ragdoll Fling: the game loop, input, collisions and drawing.

import Matter from "matter-js";
import "./style.css";
import { CONFIG } from "./config";
import { getBrowserStorage, loadBestScore, PURE_STORAGE_KEY, recordScore } from "./bestScore";
import { coinsForScore, loadCoins, saveCoins } from "./coins";
import { GRAB_RADIUS, pickPart } from "./grab";
import { createRagdoll, wholeBodySpeed, type Ragdoll } from "./ragdoll";
import { Combo, damageFromSpeed, pointsForHit, type HitSource } from "./scoring";
import { loadMuted, saveMuted, Sound } from "./sound";
import {
  buyUpgrade,
  hasAnyUpgrade,
  loadUpgrades,
  loadUpgradesEnabled,
  MAX_LEVEL,
  nextPrice,
  NO_UPGRADES,
  roundSettings,
  saveUpgrades,
  saveUpgradesEnabled,
  UPGRADES,
  type RoundSettings,
} from "./upgrades";
import { RoundStats } from "./stats";
import { loadDamageNumbers, sandboxWeapons, saveDamageNumbers, type GameMode } from "./modes";
import {
  buyWeapon,
  loadSelectedWeapon,
  loadWeapons,
  MAX_WEAPON_LEVEL,
  nextWeaponPrice,
  saveSelectedWeapon,
  saveWeapons,
  selectableWeapons,
  spikesMultiplier,
  weaponInfo,
  cooldownLeft,
  weaponPower,
  blastFalloff,
  launchAngle,
  WEAPONS,
  type WeaponId,
  type WeaponLevels,
} from "./weapons";
import {
  fetchLeaderboard,
  isValidInitials,
  loadInitials,
  normalizeInitials,
  saveInitials,
  submitScore,
} from "./leaderboard";

const { Engine, Composite, Bodies, Body, Constraint, Events, Query, Vector } = Matter;
const W = CONFIG.width;
const H = CONFIG.height;

// ---------------------------------------------------------------------------
// Page elements
// ---------------------------------------------------------------------------
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
canvas.width = W;
canvas.height = H;

const resultsScreen = document.getElementById("results")!;
const finalScoreText = document.getElementById("final-score")!;
const bestScoreText = document.getElementById("best-score")!;
const pureBestText = document.getElementById("pure-best-score")!;
const coinsEarnedText = document.getElementById("coins-earned")!;
const newBestBadge = document.getElementById("new-best")!;
const statBiggest = document.getElementById("stat-biggest")!;
const statCombo = document.getElementById("stat-combo")!;
const statThrows = document.getElementById("stat-throws")!;
const restartButton = document.getElementById("restart")!;
const toMenuButton = document.getElementById("to-menu")!;

const menuScreen = document.getElementById("menu")!;
const menuBestLine = document.getElementById("menu-best")!;
const menuBestScore = document.getElementById("menu-best-score")!;
const menuPureBest = document.getElementById("menu-pure-best")!;
const menuCoins = document.getElementById("menu-coins")!;
const playButton = document.getElementById("play")!;
const soundToggle = document.getElementById("sound-toggle")!;
const upgradesToggle = document.getElementById("upgrades-toggle")!;
const menuShopButton = document.getElementById("menu-shop")!;
const resultsShopButton = document.getElementById("results-shop")!;

const shopScreen = document.getElementById("shop")!;
const shopCoins = document.getElementById("shop-coins")!;
const shopList = document.getElementById("shop-list")!;
const shopBackButton = document.getElementById("shop-back")!;
const shopNote = document.getElementById("shop-note")!;
const tabUpgrades = document.getElementById("tab-upgrades")!;
const tabWeapons = document.getElementById("tab-weapons")!;
const weaponBar = document.getElementById("weapon-bar")!;
const sandboxButton = document.getElementById("sandbox")!;
const numbersToggle = document.getElementById("numbers-toggle")!;
const exitSandboxButton = document.getElementById("exit-sandbox")!;

const menuLeaderboardButton = document.getElementById("menu-leaderboard")!;
const leaderboardScreen = document.getElementById("leaderboard")!;
const boardList = document.getElementById("board-list")!;
const boardStatus = document.getElementById("board-status")!;
const boardBackButton = document.getElementById("board-back")!;

const submitForm = document.getElementById("submit-score") as HTMLFormElement;
const initialsInput = document.getElementById("initials-input") as HTMLInputElement;
const submitButton = document.getElementById("submit-button") as HTMLButtonElement;
const submitStatus = document.getElementById("submit-status")!;

// ---------------------------------------------------------------------------
// Physics world: gravity, four walls, one ragdoll
// ---------------------------------------------------------------------------
const engine = Engine.create();
engine.gravity.y = 1;

// The walls sit just outside the visible area, so the whole canvas is the arena.
const t = CONFIG.wallThickness;
// Collision categories: swung weapons only touch the ragdoll, not the walls,
// so pushing a fist into a wall doesn't jam it.
const CATEGORY = { ragdoll: 0x0001, weapon: 0x0002, wall: 0x0004 };
const wallOptions = { isStatic: true, label: "wall", collisionFilter: { category: CATEGORY.wall } };
const walls = [
  Bodies.rectangle(W / 2, H + t / 2, W + 2 * t, t, wallOptions), // floor
  Bodies.rectangle(W / 2, -t / 2, W + 2 * t, t, wallOptions), // ceiling
  Bodies.rectangle(-t / 2, H / 2, t, H + 2 * t, wallOptions), // left
  Bodies.rectangle(W + t / 2, H / 2, t, H + 2 * t, wallOptions), // right
];
Composite.add(engine.world, walls);

let ragdoll: Ragdoll = createRagdoll(W / 2, H / 2);
Composite.add(engine.world, ragdoll.composite);

function respawnRagdoll(): void {
  Composite.remove(engine.world, ragdoll.composite);
  ragdoll = createRagdoll(W / 2, H / 2);
  Composite.add(engine.world, ragdoll.composite);
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
type Phase = "menu" | "ready" | "playing" | "results";
let phase: Phase = "menu";
let timeLeft = CONFIG.roundSeconds;
let score = 0;
const combo = new Combo();

// Best score, remembered on this device between visits.
const storage = getBrowserStorage();
let bestScore = loadBestScore(storage);
let pureBest = loadBestScore(storage, PURE_STORAGE_KEY);

// Coins, earned from damage at the end of each round.
let coins = loadCoins(storage);

// Upgrades bought in the shop, and the On/Off switch on the menu.
let upgrades = loadUpgrades(storage);
let upgradesEnabled = loadUpgradesEnabled(storage);
// The numbers used for the current round (set at the start of each round).
let settings: RoundSettings = roundSettings(NO_UPGRADES);
// True when no upgrade or passive weapon is active this round. A round only
// counts for Pure best if this is true AND no weapon hit landed.
let roundStartsPure = true;
let weaponUsed = false;

// Weapons bought in the shop (level 0 = not owned) and the selected one.
// The Upgrades On/Off switch turns weapons off too.
let weapons: WeaponLevels = loadWeapons(storage);
let selectedWeapon: WeaponId = loadSelectedWeapon(storage, weapons);
const NO_WEAPONS = Object.fromEntries(WEAPONS.map((w) => [w.id, 0])) as WeaponLevels;
let activeWeapons: WeaponLevels = NO_WEAPONS; // what this round can use

function applyRoundSettings(): void {
  const active = upgradesEnabled ? upgrades : NO_UPGRADES;
  settings = roundSettings(active);
  // Sandbox unlocks every weapon; a timed round uses what's owned (if switched on).
  if (mode === "sandbox") activeWeapons = sandboxWeapons(weapons);
  else activeWeapons = upgradesEnabled ? weapons : NO_WEAPONS;
  roundStartsPure = !hasAnyUpgrade(active) && activeWeapons.spikes === 0;
  weaponUsed = false;
  combo.windowSeconds = settings.comboWindowSeconds;
  // Matter.js uses the bouncier of the two bodies in a collision, and the
  // ragdoll's parts have the base bounce, so raising the walls' bounce works.
  for (const wall of walls) wall.restitution = settings.wallBounce;
}

// Timed rounds or Sandbox (no timer, no score). Chosen on the menu.
let mode: GameMode = "timed";

// Floating damage numbers On/Off, remembered. Applies to every mode.
let damageNumbers = loadDamageNumbers(storage);

// Sound effects. The mute setting is remembered like the best score.
const sound = new Sound(loadMuted(storage));

// "Juice": floating damage numbers, screen shake, and white flashes on hit parts.
interface FloatingText {
  x: number;
  y: number;
  text: string;
  size: number;
  color: string; // gold for thrown hits, grey for held hits
  life: number; // seconds left
}
const floaters: FloatingText[] = [];
let shake = 0;

// Sparks: little particles that burst off the wall on impact.
interface Spark {
  x: number;
  y: number;
  vx: number; // pixels per second
  vy: number;
  life: number; // seconds left
  maxLife: number;
  size: number;
  color: string;
}
const sparks: Spark[] = [];
const MAX_SPARKS = 300;

// Accessibility: if the device asks for reduced motion, keep screen shake small.
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const shakeScale = (): number => (reducedMotionQuery.matches ? 0.15 : 1);

const stats = new RoundStats();
const flashes = new Map<Matter.Body, number>(); // body -> seconds of flash left
const lastHitAt = new Map<Matter.Body, number>(); // body -> time of last scoring hit (ms)
let lastSwingHitAt = -Infinity; // time of the last scoring swing hit (ms)

// ---------------------------------------------------------------------------
// Input: grab and fling with Pointer Events (mouse today, touch later)
// ---------------------------------------------------------------------------
let grab: Matter.Constraint | null = null;
let grabPointerId: number | null = null; // the finger or mouse holding the ragdoll

// Converts a pointer position on screen into game-world coordinates.
function toWorld(e: PointerEvent): Matter.Vector {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H,
  };
}

// A swung weapon (Fist, Bat, Axe) held in the player's "hand".
interface HeldWeapon {
  id: WeaponId;
  body: Matter.Body;
  hold: Matter.Vector; // the hitting end, under the pointer (from the center, at angle 0)
  handle: Matter.Vector; // where the grip tape is drawn
  target: Matter.Vector; // where the pointer is: the hitting end chases it
  trailAngle: number; // long weapons turn toward this so the handle trails
  pointerId: number;
}
let held: HeldWeapon | null = null;

// Keep receiving pointer events even if the pointer leaves the canvas.
function capturePointer(e: PointerEvent): void {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Not supported for this pointer: dragging still works inside the canvas.
  }
}

function startClock(): void {
  if (phase === "ready") {
    phase = "playing"; // the first grab or swing starts the clock
    sound.start();
  }
}

canvas.addEventListener("pointerdown", (e) => {
  if (phase === "menu" || phase === "results") return;
  if (grab || held || gunHeld) return; // already holding something: ignore a second finger

  // Fingers are less precise than a mouse, so touches get a bigger grab radius.
  const point = toWorld(e);
  const radius = e.pointerType === "mouse" ? GRAB_RADIUS.mouse : GRAB_RADIUS.touch;
  const target = pickPart(ragdoll.parts, point, radius);
  if (!target) {
    // Pressed empty space: pick up the selected weapon (swung, thrown or gun).
    const kind = activeWeapons[selectedWeapon] > 0 ? weaponInfo(selectedWeapon).kind : null;
    if (kind === "melee" || (kind === "thrown" && weaponReady(selectedWeapon))) {
      capturePointer(e);
      pickUpWeapon(selectedWeapon, point, e.pointerId);
      startClock();
    } else if (kind === "gun") {
      capturePointer(e);
      gunHeld = { id: selectedWeapon, pointerId: e.pointerId, at: point, angle: aimAt(point), recoil: 0 };
      startClock();
    }
    return;
  }

  capturePointer(e);
  grabPointerId = e.pointerId;

  // A springy rope from the pointer to the grabbed spot.
  grab = Constraint.create({
    pointA: point,
    bodyB: target.body,
    pointB: target.offset,
    length: 0,
    stiffness: 0.2,
    damping: 0.05,
  });
  Composite.add(engine.world, grab);
  startClock();
});

canvas.addEventListener("pointermove", (e) => {
  if (grab && e.pointerId === grabPointerId) grab.pointA = toWorld(e);
  if (held && e.pointerId === held.pointerId) held.target = toWorld(e);
  if (gunHeld && e.pointerId === gunHeld.pointerId) gunHeld.at = toWorld(e);
});

function release(): void {
  grabPointerId = null;
  putAwayWeapon();
  gunHeld = null;
  if (!grab) return;
  Composite.remove(engine.world, grab);
  grab = null; // the ragdoll keeps its speed, which is the "fling"
}

// The player letting go counts as a throw (release() is also used for resets).
function onPointerUp(e: PointerEvent): void {
  if (held && e.pointerId === held.pointerId) {
    // Letting go of a grenade throws it; letting go of anything else puts it away.
    if (weaponInfo(held.id).kind === "thrown") throwBomb();
    else putAwayWeapon();
    return;
  }
  if (gunHeld && e.pointerId === gunHeld.pointerId) {
    gunHeld = null; // stop firing and put the gun away
    return;
  }
  if (e.pointerId !== grabPointerId) return; // a different finger lifted
  if (grab && phase === "playing") stats.recordThrow();
  release();
}
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", (e) => {
  if (e.pointerId === grabPointerId || e.pointerId === held?.pointerId || e.pointerId === gunHeld?.pointerId) {
    release();
  }
});

// ---------------------------------------------------------------------------
// Swung weapons: a real physics body whose hitting end follows the pointer
// ---------------------------------------------------------------------------
// How each swung weapon hits, from config.ts.
const SWING_STATS: Record<"fist" | "bat" | "axe" | "katana", { damage: number; knockback: number; cooldownMs: number }> = {
  fist: { damage: CONFIG.fist.damage, knockback: CONFIG.fist.knockback, cooldownMs: CONFIG.swingHitCooldownMs },
  bat: { damage: CONFIG.bat.damage, knockback: CONFIG.bat.knockback, cooldownMs: CONFIG.bat.cooldownMs },
  axe: { damage: CONFIG.axe.damage, knockback: CONFIG.axe.knockback, cooldownMs: CONFIG.axe.cooldownMs },
  katana: CONFIG.katana,
};

function swingStats(id: WeaponId) {
  return SWING_STATS[id as keyof typeof SWING_STATS] ?? SWING_STATS.fist;
}

const weaponFilter = { category: CATEGORY.weapon, mask: CATEGORY.ragdoll };

/** A swung weapon's shape. Offsets are from the body's center, at angle 0. */
interface BuiltWeapon {
  body: Matter.Body;
  hold: Matter.Vector; // the point that sits under the pointer (the hitting end)
  handle: Matter.Vector; // where the grip tape is drawn
}

/**
 * Builds a swung weapon at `at`. Long weapons lie along +x from the handle to
 * the hitting end, so their angle is the direction from handle to head.
 */
function buildWeapon(id: WeaponId, at: Matter.Vector): BuiltWeapon {
  if (id === "katana") {
    const { length, width } = CONFIG.katana;
    const body = Bodies.rectangle(at.x, at.y, length, width, {
      label: "weapon",
      density: 0.002, // light: quick to swing
      collisionFilter: weaponFilter,
      render: { fillStyle: "#e5e9f0" },
    });
    // The blade near the tip sits under the pointer; the handle trails.
    return { body, hold: { x: length / 2 - 20, y: 0 }, handle: { x: -length / 2 + 8, y: 0 } };
  }
  if (id === "bat") {
    const { length, width } = CONFIG.bat;
    const body = Bodies.rectangle(at.x, at.y, length, width, {
      label: "weapon",
      density: 0.004,
      chamfer: { radius: width / 2 },
      collisionFilter: weaponFilter,
      render: { fillStyle: "#c68642" },
    });
    // Held near the thick end (the barrel), so the barrel is under the pointer.
    return { body, hold: { x: length / 2 - 18, y: 0 }, handle: { x: -length / 2 + 8, y: 0 } };
  }
  if (id === "axe") {
    const { length, width, headWidth, headHeight } = CONFIG.axe;
    const handle = Bodies.rectangle(at.x, at.y, length, width, {
      label: "weapon",
      collisionFilter: weaponFilter,
      render: { fillStyle: "#8d5a3b" },
    });
    // The blade sits across the far end, sticking out to one side.
    const headCenter = { x: at.x + length / 2 - headWidth / 2, y: at.y - headHeight / 4 };
    const head = Bodies.rectangle(headCenter.x, headCenter.y, headWidth, headHeight, {
      label: "weapon",
      collisionFilter: weaponFilter,
      render: { fillStyle: "#c9d1d9" },
    });
    const body = Body.create({ parts: [handle, head], label: "weapon", collisionFilter: weaponFilter });
    Body.setDensity(body, 0.006);
    return {
      body,
      hold: Vector.sub(headCenter, body.position), // the blade is under the pointer
      handle: Vector.sub({ x: at.x - length / 2 + 6, y: at.y }, body.position),
    };
  }
  if (id === "boomerang") {
    // Held in the hand like a grenade (a "bomb" body, so it does no swing damage).
    const body = Bodies.rectangle(at.x, at.y, 34, 8, {
      label: "bomb",
      density: 0.003,
      collisionFilter: weaponFilter,
      render: { fillStyle: "#c68642" },
    });
    return { body, hold: { x: 0, y: 0 }, handle: { x: 0, y: 0 } };
  }
  if (id === "grenade" || id === "cluster") {
    // Labelled "bomb", not "weapon": a held bomb doesn't deal swing damage.
    const body = Bodies.circle(at.x, at.y, id === "grenade" ? CONFIG.grenade.radius : CONFIG.cluster.radius, {
      label: "bomb",
      density: 0.004,
      collisionFilter: weaponFilter,
      render: { fillStyle: id === "grenade" ? "#3d6b45" : "#7a2e3b" },
    });
    return { body, hold: { x: 0, y: 0 }, handle: { x: 0, y: 0 } };
  }
  const body = Bodies.circle(at.x, at.y, CONFIG.fist.radius, {
    label: "weapon",
    density: 0.01, // heavier than the ragdoll, so punches push it around
    collisionFilter: weaponFilter,
    render: { fillStyle: "#f4c095" },
  });
  return { body, hold: { x: 0, y: 0 }, handle: { x: 0, y: 0 } };
}

function pickUpWeapon(id: WeaponId, point: Matter.Vector, pointerId: number): void {
  const { body, hold, handle } = buildWeapon(id, point);
  body.frictionAir = 0;
  body.restitution = 0.2;
  // Long weapons start upright: the head under the pointer, the handle below it.
  const angle = hold.x === 0 && hold.y === 0 ? 0 : -Math.PI / 2;
  Body.setAngle(body, angle);
  Body.setPosition(body, Vector.sub(point, Vector.rotate(hold, angle)));
  Composite.add(engine.world, body);
  held = { id, body, hold, handle, target: point, pointerId, trailAngle: angle };
}

function putAwayWeapon(): void {
  if (!held) return;
  Composite.remove(engine.world, held.body);
  held = null;
}

/** Shortest signed angle from a to b, between -PI and PI. */
function angleBetween(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** Velocity of one point on a spinning, moving body (per physics step). */
function pointVelocity(body: Matter.Body, point: Matter.Vector): Matter.Vector {
  const r = Vector.sub(point, body.position);
  const w = body.angularVelocity;
  return { x: body.velocity.x - w * r.y, y: body.velocity.y + w * r.x };
}

// Every physics step: move the hitting end toward the pointer, ignoring gravity.
// Setting velocities (not positions) lets the physics engine see how fast the
// weapon is moving, so a fast swing hits harder. Long weapons also turn so the
// handle trails behind the motion: sweeping sideways swings the weapon's side
// through the dummy, like a real swing.
Events.on(engine, "beforeUpdate", () => {
  if (!held) return;
  const { body, target, hold } = held;
  const r = Vector.rotate(hold, body.angle); // hitting end, measured from the center
  const holdWorld = Vector.add(body.position, r);

  let hand = Vector.mult(Vector.sub(target, holdWorld), CONFIG.swingFollow);
  const speed = Vector.magnitude(hand);
  if (speed > CONFIG.maxSwingSpeed) hand = Vector.mult(hand, CONFIG.maxSwingSpeed / speed);

  let spin = 0;
  const isLong = hold.x !== 0 || hold.y !== 0;
  if (isLong) {
    // Handle behind, head ahead: the weapon points the way the hand moves.
    if (speed > 2) held.trailAngle = Math.atan2(hand.y, hand.x);
    const turn = angleBetween(body.angle, held.trailAngle) * CONFIG.swingTurnRate;
    spin = Math.max(-CONFIG.maxSwingTurn, Math.min(CONFIG.maxSwingTurn, turn));
  }

  // The center's velocity that makes the hitting end itself move at `hand` while spinning.
  Body.setVelocity(body, { x: hand.x + spin * r.y, y: hand.y - spin * r.x });
  Body.setAngularVelocity(body, spin);
  // Cancel gravity so the weapon doesn't sag below the pointer.
  body.force.y -= body.mass * engine.gravity.y * engine.gravity.scale;
});

// ---------------------------------------------------------------------------
// Collisions: turn wall impacts and swings into damage
// ---------------------------------------------------------------------------
Events.on(engine, "collisionStart", (event) => {
  if (phase !== "playing") return;

  // A resting ragdoll can twitch a limb against the floor. Wall hits only
  // count when the body as a whole is actually flying.
  const flying = wholeBodySpeed(ragdoll) >= CONFIG.minBodySpeed;

  for (const pair of event.pairs) {
    const { bodyA, bodyB } = pair;
    const part = bodyA.label === "ragdoll" ? bodyA : bodyB.label === "ragdoll" ? bodyB : null;
    if (!part) continue;
    const hitBy = part === bodyA ? bodyB : bodyA;

    if (hitBy.label === "wall" && flying) {
      // Only the speed straight INTO the wall counts, not sliding along it.
      const impactSpeed = Math.abs(Vector.dot(part.velocity, pair.collision.normal));
      const damage = damageFromSpeed(impactSpeed) * spikesMultiplier(activeWeapons.spikes);
      registerHit(part, damage, CONFIG.hitCooldownMs, wallSparkOrigin(part), "throw");
    } else if (hitBy.label === "weapon" && held) {
      const contact = pair.collision.supports?.[0] ?? held.body.position;
      swingHit(part, held, pair.collision.normal, { x: contact.x, y: contact.y });
    } else if (hitBy.label === "cannonball") {
      cannonballHit(part, hitBy, pair.collision.normal);
    }
  }
});

// A swung weapon hit a body part: damage from how fast the touching point closed in.
function swingHit(part: Matter.Body, weapon: HeldWeapon, normal: Matter.Vector, contact: Matter.Vector): void {
  const hitStats = swingStats(weapon.id);
  if (engine.timing.timestamp - lastSwingHitAt < hitStats.cooldownMs) return;

  const weaponVelocity = pointVelocity(weapon.body, contact);
  const relative = Vector.sub(weaponVelocity, part.velocity);
  // Capped, so a lucky whip can't produce a silly number.
  const swingSpeed = Math.min(CONFIG.maxSwingSpeed, Math.abs(Vector.dot(relative, normal)));
  const power = weaponPower(activeWeapons[weapon.id]);
  const damage = damageFromSpeed(swingSpeed) * hitStats.damage * power;
  // Sparks and knockback go the way the weapon was moving.
  const direction = Vector.normalise(weaponVelocity);
  const landed = registerHit(
    part,
    damage,
    CONFIG.hitCooldownMs,
    { x: contact.x, y: contact.y, nx: direction.x, ny: direction.y },
    weapon.id,
  );
  if (!landed) return;
  lastSwingHitAt = engine.timing.timestamp;
  weaponUsed = true; // this round no longer counts for Pure best

  Body.setVelocity(part, Vector.add(part.velocity, Vector.mult(direction, hitStats.knockback * power)));
}

// ---------------------------------------------------------------------------
// Guns: hold one and it fires bullets at the dummy
// ---------------------------------------------------------------------------
const GUN_STATS: Record<"pistol" | "revolver" | "shotgun", { damage: number; knockback: number; cooldownMs: number }> = {
  pistol: CONFIG.pistol,
  revolver: CONFIG.revolver,
  shotgun: CONFIG.shotgun,
};

function gunStats(id: WeaponId) {
  return GUN_STATS[id as keyof typeof GUN_STATS] ?? null;
}

// How far each held gun kicks back when it fires (pixels).
const RECOIL: Partial<Record<WeaponId, number>> = { pistol: 5, revolver: 12, shotgun: 14, cannon: 16, rpg: 10, flamethrower: 1 };

// Grip to muzzle, for drawing and firing.
const GUN_LENGTH: Partial<Record<WeaponId, number>> = {
  pistol: 30,
  revolver: 42,
  shotgun: 50,
  cannon: 48,
  rpg: 60,
  flamethrower: 44,
};

// Time between uses for weapons that fire or get thrown (swung weapons have none).
const COOLDOWN_MS: Partial<Record<WeaponId, number>> = {
  pistol: CONFIG.pistol.cooldownMs,
  revolver: CONFIG.revolver.cooldownMs,
  shotgun: CONFIG.shotgun.cooldownMs,
  flamethrower: CONFIG.flamethrower.cooldownMs,
  boomerang: CONFIG.boomerang.cooldownMs,
  cannon: CONFIG.cannon.cooldownMs,
  rpg: CONFIG.rpg.cooldownMs,
  grenade: CONFIG.grenade.cooldownMs,
  cluster: CONFIG.cluster.cooldownMs,
};

const lastShotAt = new Map<WeaponId, number>(); // weapon -> game time it was last fired or thrown (ms)

/** How much of a weapon's cooldown is left: 1 just used, 0 ready. */
function cooldownFraction(id: WeaponId): number {
  const ms = COOLDOWN_MS[id];
  return ms ? cooldownLeft(engine.timing.timestamp, lastShotAt.get(id) ?? -Infinity, ms) : 0;
}

function weaponReady(id: WeaponId): boolean {
  return cooldownFraction(id) === 0;
}

// The gun in the player's hand.
interface GunHeld {
  id: WeaponId;
  pointerId: number;
  at: Matter.Vector; // the hand: where the pointer is
  angle: number; // where it's aimed (always at the dummy)
  recoil: number; // pixels the gun is kicked back after a shot
}
let gunHeld: GunHeld | null = null;

// Bullets in flight. They aren't physics bodies: each step they move in a
// straight line and check that whole segment for a hit, so a fast bullet
// can't skip through a thin arm between steps.
interface Bullet {
  x: number;
  y: number;
  vx: number; // pixels per physics step
  vy: number;
  id: WeaponId; // which gun fired it
  stepsLeft: number; // removed when this reaches 0 (shotgun pellets fly a short way)
  shot: number; // which shotgun blast it came from (0 for other guns)
}
const bullets: Bullet[] = [];
let shotCount = 0; // numbers each shotgun blast
let lastComboShot = 0; // the last blast that already stepped the combo
const MAX_BULLETS = 60;

// Short-lived flashes at the muzzle.
interface ShotFlash {
  x: number;
  y: number;
  life: number; // seconds left
  heavy: boolean;
}
const shotFlashes: ShotFlash[] = [];

/** The dummy's center of mass: what the gun aims at. */
function dummyCenter(): Matter.Vector {
  let mass = 0;
  let x = 0;
  let y = 0;
  for (const part of ragdoll.parts) {
    mass += part.mass;
    x += part.mass * part.position.x;
    y += part.mass * part.position.y;
  }
  return { x: x / mass, y: y / mass };
}

function aimAt(from: Matter.Vector): number {
  const center = dummyCenter();
  return Math.atan2(center.y - from.y, center.x - from.x);
}

// Every physics step while a gun is held: aim at the dummy and fire when reloaded.
function updateGun(): void {
  if (!gunHeld) return;
  const { id } = gunHeld;
  // The Cannon aims high so gravity drops its ball onto the dummy.
  gunHeld.angle = id === "cannon" ? cannonAngle(gunHeld.at) : aimAt(gunHeld.at);
  gunHeld.recoil *= 0.8;
  if (phase !== "playing" || !weaponReady(id)) return;
  lastShotAt.set(id, engine.timing.timestamp);

  const dir = { x: Math.cos(gunHeld.angle), y: Math.sin(gunHeld.angle) };
  const muzzle = Vector.add(gunHeld.at, Vector.mult(dir, GUN_LENGTH[id] ?? 30));
  if (id === "flamethrower") {
    emitFlames(muzzle, gunHeld.angle); // no muzzle flash or big kick, just fire
    gunHeld.recoil = RECOIL.flamethrower ?? 1;
    return;
  }
  const heavy = id !== "pistol";
  if (id === "cannon") {
    fireCannonball(muzzle, dir);
  } else if (id === "rpg") {
    rockets.push({ ...muzzle, angle: gunHeld.angle, speed: CONFIG.rpg.startSpeed });
  } else if (id === "shotgun") {
    // A fan of pellets, evenly spread across the cone, that fly a short way.
    const s = CONFIG.shotgun;
    shotCount += 1;
    for (let p = 0; p < s.pellets && bullets.length < MAX_BULLETS; p++) {
      const angle = gunHeld.angle + (p / (s.pellets - 1) - 0.5) * s.spread;
      const speed = CONFIG.bulletSpeed * (0.9 + Math.random() * 0.2);
      bullets.push({
        ...muzzle,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        id,
        stepsLeft: s.rangeSteps,
        shot: shotCount,
      });
    }
  } else if (bullets.length < MAX_BULLETS) {
    const v = { vx: dir.x * CONFIG.bulletSpeed, vy: dir.y * CONFIG.bulletSpeed };
    bullets.push({ ...muzzle, ...v, id, stepsLeft: Infinity, shot: 0 });
  }
  shotFlashes.push({ ...muzzle, life: 0.08, heavy });
  gunHeld.recoil = RECOIL[id] ?? 5;
  shake = Math.max(shake, (heavy ? 5 : 1.5) * shakeScale());
  sound.shot(heavy);
}

// Every physics step: move bullets, and score the first body part each one crosses.
function updateBullets(): void {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const from = { x: b.x, y: b.y };
    const to = { x: b.x + b.vx, y: b.y + b.vy };

    const crossed = Query.ray(ragdoll.parts, from, to, 6)
      .map((c) => ragdoll.parts.find((p) => p === c.bodyA || p === c.bodyB))
      .filter((p): p is Matter.Body => p !== undefined);
    if (crossed.length > 0) {
      // The part nearest the bullet's start is the one it reached first.
      const distance = (p: Matter.Body) => Vector.magnitude(Vector.sub(p.position, from));
      const part = crossed.reduce((a, c) => (distance(c) < distance(a) ? c : a));
      bulletHit(part, b);
      bullets.splice(i, 1);
      continue;
    }

    b.x = to.x;
    b.y = to.y;
    b.stepsLeft -= 1;
    if (b.stepsLeft <= 0) {
      bullets.splice(i, 1); // out of range: a shotgun pellet just fades
    } else if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) {
      puff({ x: Math.min(W, Math.max(0, b.x)), y: Math.min(H, Math.max(0, b.y)) }, 4); // hit a wall
      bullets.splice(i, 1);
    }
  }
}

function bulletHit(part: Matter.Body, bullet: Bullet): void {
  const gun = gunStats(bullet.id);
  if (!gun || phase !== "playing") return;
  const dir = Vector.normalise({ x: bullet.vx, y: bullet.vy });
  const power = weaponPower(activeWeapons[bullet.id]);
  // Only the first pellet of a shotgun blast to land steps the combo, like an
  // explosion; the rest still score at the current multiplier.
  const stepsCombo = bullet.shot === 0 || bullet.shot !== lastComboShot;
  if (bullet.shot !== 0) lastComboShot = bullet.shot;
  const origin = { x: bullet.x, y: bullet.y, nx: dir.x, ny: dir.y };
  const landed = registerHit(part, gun.damage * power, 0, origin, bullet.id, stepsCombo);
  if (!landed) return;
  weaponUsed = true; // this round no longer counts for Pure best
  // Knock the part along the bullet's path, plus a little lift to keep it airborne.
  const kick = Vector.add(Vector.mult(dir, gun.knockback * power), { x: 0, y: -1.5 });
  Body.setVelocity(part, Vector.add(part.velocity, kick));
}

// ---------------------------------------------------------------------------
// Explosives: grenades, cluster bombs, cannonballs and rockets
// ---------------------------------------------------------------------------
type BombKind = "grenade" | "cluster" | "bomblet";

// A live bomb: a physics body that bounces around until its fuse runs out.
interface Bomb {
  body: Matter.Body;
  kind: BombKind;
  fuseLeft: number; // seconds
  power: number; // the weapon's level multiplier when it was thrown
}
const bombs: Bomb[] = [];

// Cannonballs are heavy physics bodies; they hurt on impact, not by exploding.
interface Cannonball {
  body: Matter.Body;
  life: number; // seconds until it's cleaned up
}
const cannonballs: Cannonball[] = [];

// Rockets fly straight, speeding up, and explode on the first thing they reach.
// Like bullets, they check their whole path each step instead of being bodies.
interface Rocket {
  x: number;
  y: number;
  angle: number;
  speed: number; // pixels per step
}
const rockets: Rocket[] = [];

// The expanding fireball drawn for each explosion.
interface Blast {
  x: number;
  y: number;
  radius: number;
  life: number; // seconds left
}
const blasts: Blast[] = [];
const BLAST_SECONDS = 0.35;

const bombFilter = { category: CATEGORY.weapon, mask: CATEGORY.ragdoll | CATEGORY.wall };

/** Gravity's pull per physics step, in pixels per step squared. */
function gravityPerStep(): number {
  const stepMs = 1000 / 60;
  return engine.gravity.y * engine.gravity.scale * stepMs * stepMs;
}

/** Letting go of a held grenade: it keeps the hand's speed and its fuse starts. */
function throwBomb(): void {
  if (!held) return;
  const { body, id } = held;
  held = null;
  if (id === "boomerang") {
    // A boomerang is not a bomb: it flies on its own path and curves back.
    Composite.remove(engine.world, body);
    launchBoomerang(body);
    lastShotAt.set(id, engine.timing.timestamp);
    return;
  }
  const speed = Vector.magnitude(body.velocity);
  if (speed > CONFIG.maxThrowSpeed) Body.setVelocity(body, Vector.mult(body.velocity, CONFIG.maxThrowSpeed / speed));
  body.collisionFilter = { ...bombFilter, group: 0 };
  body.frictionAir = 0.005;
  body.restitution = 0.5;
  const kind = id === "cluster" ? "cluster" : "grenade";
  const fuseMs = kind === "cluster" ? CONFIG.cluster.fuseMs : CONFIG.grenade.fuseMs;
  bombs.push({ body, kind, fuseLeft: fuseMs / 1000, power: weaponPower(activeWeapons[id]) });
  lastShotAt.set(id, engine.timing.timestamp);
}

// Every physics step: burn down fuses and set off any bomb that's ready.
function updateBombs(dt: number): void {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const bomb = bombs[i];
    bomb.fuseLeft -= dt;
    const { x, y } = bomb.body.position;
    const escaped = x < -50 || x > W + 50 || y < -50 || y > H + 50;
    if (bomb.fuseLeft > 0 && !escaped) continue;

    bombs.splice(i, 1);
    Composite.remove(engine.world, bomb.body);
    if (escaped) continue;
    const at = { x, y };
    if (bomb.kind === "bomblet") {
      const c = CONFIG.cluster;
      explode(at, c.bombletBlastRadius, c.bombletDamage, c.bombletKnockback, bomb.power, false, "cluster");
    } else if (bomb.kind === "cluster") {
      const c = CONFIG.cluster;
      explode(at, c.blastRadius, c.damage, c.knockback, bomb.power, true, "cluster");
      scatterBomblets(at, bomb.power);
    } else {
      const g = CONFIG.grenade;
      explode(at, g.blastRadius, g.damage, g.knockback, bomb.power, true, "grenade");
    }
  }
}

// A cluster bomb's blast throws out small bombs in a fan, mostly upward.
function scatterBomblets(at: Matter.Vector, power: number): void {
  const c = CONFIG.cluster;
  for (let i = 0; i < c.bomblets; i++) {
    const angle = -Math.PI / 2 + (i - (c.bomblets - 1) / 2) * 0.6;
    const body = Bodies.circle(at.x, at.y, c.bombletRadius, {
      label: "bomb",
      density: 0.004,
      frictionAir: 0.005,
      restitution: 0.5,
      collisionFilter: bombFilter,
      render: { fillStyle: "#c0485a" },
    });
    Body.setVelocity(body, { x: Math.cos(angle) * c.bombletSpeed, y: Math.sin(angle) * c.bombletSpeed });
    Composite.add(engine.world, body);
    bombs.push({ body, kind: "bomblet", fuseLeft: c.bombletFuseMs / 1000 + i * 0.08, power });
  }
}

/**
 * A blast: every body part within `radius` takes damage (less further out)
 * and is thrown outward. The total counts as ONE hit, so a single explosion
 * can't max out the combo by touching ten body parts.
 */
function explode(
  at: Matter.Vector,
  radius: number,
  damage: number,
  knockback: number,
  power: number,
  big: boolean,
  source: HitSource, // which weapon, for the variety combo
): void {
  blasts.push({ x: at.x, y: at.y, radius, life: BLAST_SECONDS });
  shake = Math.max(shake, (big ? 16 : 8) * shakeScale());
  sound.explosion(big);
  puff(at, big ? 14 : 7);
  if (phase !== "playing") return;

  let total = 0;
  let nearest: Matter.Body | null = null;
  let nearestDistance = Infinity;
  for (const part of ragdoll.parts) {
    const away = Vector.sub(part.position, at);
    const distance = Vector.magnitude(away);
    const strength = blastFalloff(distance, radius);
    if (strength <= 0) continue;
    total += damage * strength * power;
    if (distance < nearestDistance) {
      nearest = part;
      nearestDistance = distance;
    }
    // Throw the part outward, with some lift so blasts launch the dummy.
    const direction = distance > 1 ? Vector.normalise(away) : { x: 0, y: -1 };
    const push = Vector.add(Vector.mult(direction, knockback * strength * power), { x: 0, y: -3 * strength });
    Body.setVelocity(part, Vector.add(part.velocity, push));
  }

  if (nearest && registerHit(nearest, total, 0, { x: at.x, y: at.y, nx: 0, ny: -1 }, source)) {
    weaponUsed = true; // this round no longer counts for Pure best
  }
}

/** The Cannon's barrel angle: high enough that gravity drops the ball on the dummy. */
function cannonAngle(from: Matter.Vector): number {
  const target = dummyCenter();
  const angle = launchAngle(target.x - from.x, target.y - from.y, CONFIG.cannon.ballSpeed, gravityPerStep());
  return angle ?? aimAt(from); // out of range: just point at it
}

function fireCannonball(at: Matter.Vector, dir: Matter.Vector): void {
  const body = Bodies.circle(at.x, at.y, CONFIG.cannon.ballRadius, {
    label: "cannonball",
    density: 0.02, // very heavy: it shoves the dummy hard
    frictionAir: 0,
    restitution: 0.3,
    collisionFilter: bombFilter,
    render: { fillStyle: "#2b2d42" },
  });
  Body.setVelocity(body, Vector.mult(dir, CONFIG.cannon.ballSpeed));
  Composite.add(engine.world, body);
  cannonballs.push({ body, life: 4 });
}

// A cannonball hit a body part: damage from how fast it struck, plus a shove.
function cannonballHit(part: Matter.Body, ball: Matter.Body, normal: Matter.Vector): void {
  const relative = Vector.sub(ball.velocity, part.velocity);
  const impactSpeed = Math.min(CONFIG.maxSwingSpeed, Math.abs(Vector.dot(relative, normal)));
  const power = weaponPower(activeWeapons.cannon);
  const damage = damageFromSpeed(impactSpeed) * CONFIG.cannon.damage * power;
  const direction = Vector.magnitude(ball.velocity) > 0.5 ? Vector.normalise(ball.velocity) : { x: 0, y: -1 };
  const origin = { x: ball.position.x, y: ball.position.y, nx: direction.x, ny: direction.y };
  if (!registerHit(part, damage, CONFIG.hitCooldownMs, origin, "cannon")) return;
  weaponUsed = true;
  Body.setVelocity(part, Vector.add(part.velocity, Vector.mult(direction, CONFIG.cannon.knockback * power)));
}

// Every physics step: clear away old cannonballs, move rockets, fade blasts.
function updateProjectiles(dt: number): void {
  for (let i = cannonballs.length - 1; i >= 0; i--) {
    const ball = cannonballs[i];
    ball.life -= dt;
    const { x, y } = ball.body.position;
    if (ball.life <= 0 || x < -50 || x > W + 50 || y < -50 || y > H + 50) {
      Composite.remove(engine.world, ball.body);
      cannonballs.splice(i, 1);
    }
  }

  const r = CONFIG.rpg;
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rocket = rockets[i];
    rocket.speed = Math.min(r.maxSpeed, rocket.speed + r.acceleration);
    const from = { x: rocket.x, y: rocket.y };
    const to = {
      x: rocket.x + Math.cos(rocket.angle) * rocket.speed,
      y: rocket.y + Math.sin(rocket.angle) * rocket.speed,
    };
    const hitDummy = Query.ray(ragdoll.parts, from, to, 10).length > 0;
    const hitWall = to.x < 0 || to.x > W || to.y < 0 || to.y > H;
    if (hitDummy || hitWall) {
      const at = { x: Math.min(W, Math.max(0, to.x)), y: Math.min(H, Math.max(0, to.y)) };
      explode(at, r.blastRadius, r.damage, r.knockback, weaponPower(activeWeapons.rpg), true, "rpg");
      rockets.splice(i, 1);
      continue;
    }
    rocket.x = to.x;
    rocket.y = to.y;
    // A smoky orange trail.
    if (sparks.length < MAX_SPARKS) {
      sparks.push({
        x: from.x,
        y: from.y,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        life: 0.3,
        maxLife: 0.3,
        size: 3 + Math.random() * 3,
        color: Math.random() < 0.5 ? "#f78c6b" : "#9aa0b8",
      });
    }
  }

  for (let i = blasts.length - 1; i >= 0; i--) {
    blasts[i].life -= dt;
    if (blasts[i].life <= 0) blasts.splice(i, 1);
  }
}

/** Removes every bomb, cannonball, rocket and blast (for a new round). */
function clearExplosives(): void {
  for (const bomb of bombs) Composite.remove(engine.world, bomb.body);
  for (const ball of cannonballs) Composite.remove(engine.world, ball.body);
  bombs.length = 0;
  cannonballs.length = 0;
  rockets.length = 0;
  blasts.length = 0;
}

// ---------------------------------------------------------------------------
// Flamethrower: flame puffs set body parts on fire
// ---------------------------------------------------------------------------
// A puff of flame: drifts forward, slows, grows and fades. Not a physics body.
interface Flame {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds left
}
const flames: Flame[] = [];
const MAX_FLAMES = 120;

// Body part -> seconds of burning left. Refreshed whenever a flame touches it.
const burning = new Map<Matter.Body, number>();
let burnTickIn = 0; // seconds until the next burn tick
let lastFlameSound = -Infinity;

function emitFlames(muzzle: Matter.Vector, angle: number): void {
  const f = CONFIG.flamethrower;
  for (let i = 0; i < 2 && flames.length < MAX_FLAMES; i++) {
    const a = angle + (Math.random() - 0.5) * f.spread;
    const speed = f.flameSpeed * (0.8 + Math.random() * 0.4);
    flames.push({ ...muzzle, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: f.flameSeconds });
  }
  // A soft roar, not one per puff.
  const now = engine.timing.timestamp;
  if (now - lastFlameSound > 150) {
    lastFlameSound = now;
    sound.flame();
  }
}

// Every physics step: move flames, light anything they touch, and tick the fire.
function updateFlames(dt: number): void {
  const f = CONFIG.flamethrower;
  for (let i = flames.length - 1; i >= 0; i--) {
    const flame = flames[i];
    flame.x += flame.vx;
    flame.y += flame.vy;
    flame.vx *= 0.93; // flames slow down and float up a little
    flame.vy = flame.vy * 0.93 - 0.15;
    flame.life -= dt;
    if (flame.life <= 0) {
      flames.splice(i, 1);
      continue;
    }
    if (phase !== "playing") continue;
    const touched = pickPart(ragdoll.parts, flame, 6);
    if (touched) {
      burning.set(touched.body, f.burnSeconds);
      const push = Vector.mult(Vector.normalise({ x: flame.vx, y: flame.vy }), f.knockback);
      Body.setVelocity(touched.body, Vector.add(touched.body.velocity, push));
    }
  }

  for (const [part, left] of burning) {
    if (left - dt <= 0) burning.delete(part);
    else burning.set(part, left - dt);
    // Now and then an ember floats up off the burning part.
    if (Math.random() < 0.15 && sparks.length < MAX_SPARKS) {
      sparks.push({
        x: part.position.x + (Math.random() - 0.5) * 10,
        y: part.position.y,
        vx: (Math.random() - 0.5) * 30,
        vy: -60 - Math.random() * 60,
        life: 0.5,
        maxLife: 0.5,
        size: 2 + Math.random() * 2,
        color: Math.random() < 0.5 ? "#ffd166" : "#f78c6b",
      });
    }
  }

  // Each tick, every burning part adds its damage, and the total is one hit.
  burnTickIn -= dt;
  if (burnTickIn > 0) return;
  burnTickIn = f.burnTickMs / 1000;
  if (burning.size === 0 || phase !== "playing") return;
  const power = weaponPower(activeWeapons.flamethrower);
  let hottest: Matter.Body | null = null;
  for (const part of burning.keys()) hottest ??= part;
  const total = f.burnDamage * power * burning.size;
  const { x, y } = hottest!.position;
  if (registerHit(hottest!, total, 0, { x, y, nx: 0, ny: -1 }, "flamethrower")) weaponUsed = true;
}

// ---------------------------------------------------------------------------
// Boomerang: flung by hand, curves back toward where it was thrown from
// ---------------------------------------------------------------------------
interface Boomerang {
  x: number;
  y: number;
  vx: number; // pixels per step
  vy: number;
  home: Matter.Vector; // where it was thrown from: it curves back here
  age: number; // seconds since the throw
  spin: number; // angle, for drawing
}
const boomerangs: Boomerang[] = [];

/** Letting go of a held boomerang: it flies off with the hand's speed (at least a minimum, aimed at the dummy). */
function launchBoomerang(body: Matter.Body): void {
  const b = CONFIG.boomerang;
  let velocity = { x: body.velocity.x, y: body.velocity.y };
  const speed = Vector.magnitude(velocity);
  if (speed < b.minSpeed) {
    // A gentle release still sends it toward the dummy.
    const toward = Vector.normalise(Vector.sub(dummyCenter(), body.position));
    velocity = Vector.mult(toward, b.minSpeed);
  } else if (speed > b.maxSpeed) {
    velocity = Vector.mult(velocity, b.maxSpeed / speed);
  }
  const at = { x: body.position.x, y: body.position.y };
  boomerangs.push({ ...at, vx: velocity.x, vy: velocity.y, home: at, age: 0, spin: 0 });
}

// Every physics step: pull each boomerang back home, and hit what it crosses.
function updateBoomerangs(dt: number): void {
  const b = CONFIG.boomerang;
  for (let i = boomerangs.length - 1; i >= 0; i--) {
    const boom = boomerangs[i];
    boom.age += dt;
    boom.spin += 0.5;
    const pull = Vector.mult(Vector.normalise(Vector.sub(boom.home, boom)), b.returnPull);
    boom.vx += pull.x;
    boom.vy += pull.y;
    const from = { x: boom.x, y: boom.y };
    const to = { x: boom.x + boom.vx, y: boom.y + boom.vy };

    if (phase === "playing") {
      for (const hit of Query.ray(ragdoll.parts, from, to, 16)) {
        const part = ragdoll.parts.find((p) => p === hit.bodyA || p === hit.bodyB);
        if (part) boomerangHit(part, boom);
      }
    }

    // Bounce off the walls instead of leaving the arena.
    boom.x = Math.min(W - 5, Math.max(5, to.x));
    boom.y = Math.min(H - 5, Math.max(5, to.y));
    if (boom.x !== to.x) boom.vx = -boom.vx * 0.6;
    if (boom.y !== to.y) boom.vy = -boom.vy * 0.6;

    const home = Vector.magnitude(Vector.sub(boom.home, boom)) < b.catchRadius && boom.age > 0.4;
    if (home || boom.age > b.maxSeconds) boomerangs.splice(i, 1); // caught (or gave up)
  }
}

function boomerangHit(part: Matter.Body, boom: Boomerang): void {
  const b = CONFIG.boomerang;
  const power = weaponPower(activeWeapons.boomerang);
  const direction = Vector.normalise({ x: boom.vx, y: boom.vy });
  const origin = { x: boom.x, y: boom.y, nx: direction.x, ny: direction.y };
  if (!registerHit(part, b.damage * power, b.hitCooldownMs, origin, "boomerang")) return;
  weaponUsed = true;
  Body.setVelocity(part, Vector.add(part.velocity, Vector.mult(direction, b.knockback * power)));
}

/** Clears flames, fire and boomerangs (for a new round). */
function clearFireAndBoomerangs(): void {
  flames.length = 0;
  burning.clear();
  burnTickIn = 0;
  boomerangs.length = 0;
}

// Grey dust where a bullet hits a wall.
function puff(at: Matter.Vector, count: number): void {
  for (let i = 0; i < count && sparks.length < MAX_SPARKS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 80;
    const life = 0.2 + Math.random() * 0.2;
    sparks.push({
      x: at.x,
      y: at.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: 2 + Math.random() * 2,
      color: "#9aa0b8",
    });
  }
}

/** Where sparks fly from, and the direction they fly in. */
interface SparkOrigin {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

/**
 * Scores one hit. `rawDamage` is before upgrades; hits on the same part closer
 * together than `cooldownMs` are ignored. Returns true if it scored.
 */
function registerHit(
  part: Matter.Body,
  rawDamage: number,
  cooldownMs: number,
  origin: SparkOrigin,
  source: HitSource,
  stepsCombo = true, // false for the extra pellets of one shotgun blast
): boolean {
  const now = engine.timing.timestamp;
  const last = lastHitAt.get(part) ?? -Infinity;
  if (now - last < cooldownMs) return false;

  const damage = Math.round(rawDamage * settings.damageMultiplier);
  if (damage <= 0) return false;
  lastHitAt.set(part, now);

  // Hits while the ragdoll is still held are worth less and don't build the combo.
  const whileHeld = grab !== null;
  // Sandbox has no combo, so its damage numbers show each hit on its own.
  let multiplier = 1;
  if (!whileHeld && mode !== "sandbox") multiplier = stepsCombo ? combo.hit(source) : combo.multiplier;
  const points = pointsForHit(damage, multiplier, whileHeld);
  score += points;
  stats.recordHit(points, multiplier);

  sound.impact(damage);
  if (!whileHeld && combo.count > 1) sound.combo(combo.count);

  if (damageNumbers) {
    floaters.push({
      x: part.position.x,
      y: part.position.y,
      text: String(points),
      size: whileHeld ? Math.min(28, 14 + points * 0.25) : Math.min(64, 18 + damage * 0.25),
      color: whileHeld ? "#9aa0b8" : "#ffd166",
      life: 0.9,
    });
  }
  shake = Math.max(shake, Math.min(22, 2 + damage * 0.08) * shakeScale());
  flashes.set(part, 0.12);
  spawnSparks(part, damage, whileHeld, origin);
  return true;
}

// Sparks for a wall hit start at the nearest wall and point back into the arena.
function wallSparkOrigin(part: Matter.Body): SparkOrigin {
  const { x, y } = part.position;
  const edges = [
    { dist: x, x: 0, y, nx: 1, ny: 0 }, // left
    { dist: W - x, x: W, y, nx: -1, ny: 0 }, // right
    { dist: y, x, y: 0, nx: 0, ny: 1 }, // ceiling
    { dist: H - y, x, y: H, nx: 0, ny: -1 }, // floor
  ];
  return edges.reduce((a, b) => (b.dist < a.dist ? b : a));
}

// Bursts sparks from where the hit happened.
function spawnSparks(part: Matter.Body, damage: number, whileHeld: boolean, origin: SparkOrigin): void {
  const count = whileHeld ? 3 : Math.min(24, 4 + Math.floor(damage / 10));
  const color = whileHeld ? "#9aa0b8" : (part.render.fillStyle ?? "#ffd166");
  for (let i = 0; i < count && sparks.length < MAX_SPARKS; i++) {
    const angle = Math.atan2(origin.ny, origin.nx) + (Math.random() - 0.5) * 2.2; // spread ~125 degrees
    const speed = 120 + Math.random() * (150 + damage * 3);
    const life = 0.3 + Math.random() * 0.4;
    sparks.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: 2 + Math.random() * (whileHeld ? 2 : 4),
      color: Math.random() < 0.35 ? "#ffffff" : color,
    });
  }
}

// Speed cap: stops parts moving so fast that they tunnel through a wall.
Events.on(engine, "beforeUpdate", () => {
  for (const part of ragdoll.parts) {
    const speed = Vector.magnitude(part.velocity);
    if (speed > CONFIG.maxSpeed) {
      Body.setVelocity(part, Vector.mult(part.velocity, CONFIG.maxSpeed / speed));
    }
  }
});

// ---------------------------------------------------------------------------
// Round flow: menu -> ready -> playing -> results -> (Play again) ready
//                                                  -> (Menu) menu
// ---------------------------------------------------------------------------
function endRound(): void {
  phase = "results";
  renderWeaponBar();
  timeLeft = 0;
  release();
  finalScoreText.textContent = score.toLocaleString();

  const result = recordScore(storage, score, bestScore);
  bestScore = result.best;
  bestScoreText.textContent = bestScore.toLocaleString();
  newBestBadge.hidden = !result.isNewBest;

  // Pure best only counts rounds with no active upgrades and no weapon hits.
  const roundIsPure = roundStartsPure && !weaponUsed;
  let isNewPureBest = false;
  if (roundIsPure) {
    const pureResult = recordScore(storage, score, pureBest, PURE_STORAGE_KEY);
    pureBest = pureResult.best;
    isNewPureBest = pureResult.isNewBest;
  }
  pureBestText.textContent = formatRecord(pureBest) + (roundIsPure ? "" : " (upgrades or weapons used: not counted)");

  const earned = coinsForScore(score);
  coins += earned;
  saveCoins(storage, coins);
  coinsEarnedText.textContent = `+${earned.toLocaleString()} coins`;

  statBiggest.textContent = stats.biggestHit.toLocaleString();
  statCombo.textContent = `x${stats.bestMultiplier.toFixed(2)}`;
  statThrows.textContent = String(stats.throws);

  sound.end();
  if (result.isNewBest) sound.newBest();

  resultsScreen.hidden = false;
  if (isNewPureBest) {
    offerSubmit(score);
  } else {
    submitForm.hidden = true;
    restartButton.focus();
  }
}

// A record that hasn't been set yet shows as a dash instead of 0.
function formatRecord(value: number): string {
  return value > 0 ? value.toLocaleString() : "–";
}

// Puts everything back to the start of a round.
function resetRound(): void {
  release();
  respawnRagdoll();
  applyRoundSettings(); // picks up anything bought or switched since last round
  timeLeft = settings.roundSeconds;
  score = 0;
  combo.reset();
  stats.reset();
  floaters.length = 0;
  sparks.length = 0;
  flashes.clear();
  lastHitAt.clear();
  lastSwingHitAt = -Infinity;
  lastShotAt.clear();
  shotFlashes.length = 0;
  bullets.length = 0;
  clearExplosives();
  clearFireAndBoomerangs();
  shake = 0;
  resultsScreen.hidden = true;
}

function restart(): void {
  sound.click();
  resetRound();
  phase = "ready"; // the clock starts on the first grab
  renderWeaponBar();
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
let scoreToSubmit = 0;

// Shows the submit form on the results screen after a new Pure best.
function offerSubmit(newPureBest: number): void {
  scoreToSubmit = newPureBest;
  initialsInput.value = loadInitials(storage);
  initialsInput.disabled = false;
  submitButton.disabled = false;
  submitStatus.textContent = "";
  submitForm.hidden = false;
  initialsInput.focus();
}

async function sendScore(): Promise<void> {
  const initials = normalizeInitials(initialsInput.value);
  if (!isValidInitials(initials)) {
    submitStatus.textContent = "Enter 3 letters.";
    initialsInput.focus();
    return;
  }
  sound.click();
  submitButton.disabled = true;
  submitStatus.textContent = "Sending…";

  const result = await submitScore(initials, scoreToSubmit);
  if (result.ok) {
    saveInitials(storage, initials);
    initialsInput.disabled = true;
    submitStatus.textContent =
      result.rank <= 10 ? `You're #${result.rank} on the leaderboard!` : `Submitted! You're #${result.rank}.`;
    sound.buy();
    restartButton.focus();
  } else {
    submitStatus.textContent = result.error;
    submitButton.disabled = false;
  }
}

async function openLeaderboard(): Promise<void> {
  sound.unlock();
  sound.click();
  menuScreen.hidden = true;
  leaderboardScreen.hidden = false;
  boardList.replaceChildren();
  boardStatus.textContent = "Loading…";
  boardBackButton.focus();

  try {
    const entries = await fetchLeaderboard();
    boardList.replaceChildren(
      ...entries.map((entry) => {
        const row = document.createElement("li");
        const initials = document.createElement("span");
        initials.className = "initials";
        initials.textContent = entry.initials; // textContent, never HTML, so names can't inject code
        const points = document.createElement("span");
        points.textContent = entry.score.toLocaleString();
        row.append(initials, points);
        return row;
      }),
    );
    boardStatus.textContent = entries.length === 0 ? "No scores yet. Be the first!" : "";
  } catch {
    boardStatus.textContent = "Couldn't load the leaderboard. Try again later.";
  }
}

function showMenu(): void {
  resetRound();
  phase = "menu";
  exitSandboxButton.hidden = true;
  renderWeaponBar();
  menuBestScore.textContent = bestScore.toLocaleString();
  menuPureBest.textContent = formatRecord(pureBest);
  menuBestLine.hidden = bestScore <= 0;
  menuCoins.textContent = coins.toLocaleString();
  menuScreen.hidden = false;
  playButton.focus();
}

function startFromMenu(chosen: GameMode): void {
  sound.unlock(); // browsers only allow sound after a click like this one
  sound.click();
  mode = chosen;
  resetRound(); // applies the mode, the Upgrades On/Off switch and any purchases
  menuScreen.hidden = true;
  phase = "ready";
  exitSandboxButton.hidden = mode !== "sandbox";
  // Re-pick the saved weapon now that this round's weapons are known (Sandbox unlocks more).
  selectedWeapon = loadSelectedWeapon(storage, activeWeapons);
  renderWeaponBar();
}

// Leaving Sandbox: nothing is scored or saved, it just goes back to the menu.
function exitSandbox(): void {
  if (mode !== "sandbox" || (phase !== "ready" && phase !== "playing")) return;
  sound.click();
  showMenu();
}

function updateNumbersToggle(): void {
  numbersToggle.textContent = damageNumbers ? "Numbers: On" : "Numbers: Off";
  numbersToggle.setAttribute("aria-pressed", String(damageNumbers));
}

function toggleNumbers(): void {
  sound.unlock();
  sound.click();
  damageNumbers = !damageNumbers;
  saveDamageNumbers(storage, damageNumbers);
  updateNumbersToggle();
}

// ---------------------------------------------------------------------------
// Shop and the Upgrades On/Off switch
// ---------------------------------------------------------------------------
let shopOpenedFrom: HTMLElement = menuScreen; // the screen to go back to

function openShop(from: HTMLElement): void {
  sound.unlock();
  sound.click();
  shopOpenedFrom = from;
  from.hidden = true;
  renderShop();
  shopScreen.hidden = false;
  shopBackButton.focus();
}

function closeShop(): void {
  sound.click();
  shopScreen.hidden = true;
  if (shopOpenedFrom === menuScreen) showMenu();
  else shopOpenedFrom.hidden = false;
}

type ShopTab = "upgrades" | "weapons";
let shopTab: ShopTab = "upgrades";

function showShopTab(tab: ShopTab): void {
  if (tab !== shopTab) sound.click();
  shopTab = tab;
  renderShop();
}

/** One shop row: name, optional key badge, level, effect, and a buy button. */
interface ShopRow {
  name: string;
  key: number | null;
  level: number;
  maxLevel: number;
  ownable: boolean; // weapons: level 0 reads "Not owned" instead of "Lv 0"
  effect: string;
  price: number | null; // null when maxed out
  buyLabel: string; // "Buy" or "Level up"
  onBuy: () => void;
}

function shopRow(row: ShopRow): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "shop-item";

  const info = document.createElement("div");
  if (row.key !== null) {
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = String(row.key);
    key.title = `Press ${row.key} to select`;
    info.append(key);
  }
  const name = document.createElement("strong");
  name.textContent = row.name;
  const levelText = document.createElement("span");
  levelText.className = "level";
  levelText.textContent = row.level > 0 || !row.ownable ? `Lv ${row.level}/${row.maxLevel}` : "Not owned";
  const effect = document.createElement("span");
  effect.className = "effect";
  effect.textContent = row.effect;
  info.append(name, levelText, effect);

  const buy = document.createElement("button");
  if (row.price === null) {
    buy.textContent = "Maxed";
    buy.disabled = true;
  } else {
    buy.textContent = `${row.buyLabel} · ${row.price.toLocaleString()}`;
    buy.disabled = coins < row.price;
    buy.addEventListener("click", () => {
      row.onBuy();
      saveCoins(storage, coins);
      sound.buy();
      renderShop();
    });
  }

  item.append(info, buy);
  return item;
}

function renderShop(): void {
  shopCoins.textContent = coins.toLocaleString();
  tabUpgrades.setAttribute("aria-selected", String(shopTab === "upgrades"));
  tabWeapons.setAttribute("aria-selected", String(shopTab === "weapons"));
  shopNote.textContent =
    shopTab === "upgrades"
      ? "Upgrades apply from your next round. Rounds with upgrades on don't count for Pure best."
      : "Rounds where a weapon lands a hit (or spiked walls are on) don't count for Pure best. Upgrades: Off turns weapons off too.";
  shopList.replaceChildren(...(shopTab === "upgrades" ? upgradeRows() : weaponRows()));
}

function upgradeRows(): HTMLLIElement[] {
  return UPGRADES.map((upgrade) => {
    const level = upgrades[upgrade.id];
    const price = nextPrice(level);
    return shopRow({
      name: upgrade.name,
      key: null,
      level,
      maxLevel: MAX_LEVEL,
      ownable: false,
      effect: price === null ? upgrade.describe(level) : `${upgrade.describe(level)} → ${upgrade.describe(level + 1)}`,
      price,
      buyLabel: "Buy",
      onBuy: () => {
        const result = buyUpgrade(upgrades, upgrade.id, coins);
        if (!result) return;
        upgrades = result.levels;
        coins = result.coins;
        saveUpgrades(storage, upgrades);
      },
    });
  });
}

function weaponRows(): HTMLLIElement[] {
  return WEAPONS.map((weapon) => {
    const level = weapons[weapon.id];
    const price = nextWeaponPrice(weapon.id, level);
    const effect =
      level === 0 || price === null
        ? weapon.describe(Math.max(level, 1))
        : `${weapon.describe(level)} → ${weapon.describe(level + 1)}`;
    return shopRow({
      name: weapon.name,
      key: weapon.key,
      level,
      maxLevel: MAX_WEAPON_LEVEL,
      ownable: true,
      effect,
      price,
      buyLabel: level === 0 ? "Buy" : "Level up",
      onBuy: () => {
        const result = buyWeapon(weapons, weapon.id, coins);
        if (!result) return;
        weapons = result.levels;
        coins = result.coins;
        saveWeapons(storage, weapons);
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Weapon bar and the 1-9 keys
// ---------------------------------------------------------------------------
// Mouse wheel or Q / E: step to the next or previous owned weapon, wrapping around.
function cycleWeapon(step: number): void {
  const options = selectableWeapons(activeWeapons);
  if (options.length < 2) return;
  const index = options.findIndex((w) => w.id === selectedWeapon);
  const next = options[(index + step + options.length) % options.length];
  selectWeapon(next.id);
}

// The wheel only switches weapons during a round, and then it does not scroll the page.
canvas.addEventListener(
  "wheel",
  (e) => {
    if (phase !== "ready" && phase !== "playing") return;
    e.preventDefault();
    cycleWeapon(e.deltaY > 0 ? 1 : -1);
  },
  { passive: false },
);

function selectWeapon(id: WeaponId): void {
  if (activeWeapons[id] <= 0 || weaponInfo(id).kind === "passive") return;
  if (id !== selectedWeapon) {
    putAwayWeapon(); // let go of the old one; press again to use the new one
    sound.click();
    combo.weaponSwitched(); // the combo fade starts over
  }
  selectedWeapon = id;
  saveSelectedWeapon(storage, id);
  renderWeaponBar();
}

// Bar buttons for weapons with a cooldown, so their fill can be updated every frame.
const gunButtons = new Map<WeaponId, HTMLButtonElement>();

// Shown during a round when weapons are on. One button per owned weapon.
function renderWeaponBar(): void {
  const options = selectableWeapons(activeWeapons);
  weaponBar.hidden = (phase !== "ready" && phase !== "playing") || options.length === 0;
  gunButtons.clear();
  if (!weaponBar.hidden && !options.some((w) => w.id === selectedWeapon)) selectedWeapon = options[0].id;
  // A crosshair cursor while a gun is out.
  canvas.style.cursor = !weaponBar.hidden && weaponInfo(selectedWeapon).kind === "gun" ? "crosshair" : "";
  if (weaponBar.hidden) return;

  weaponBar.replaceChildren(
    ...options.map((weapon) => {
      const button = document.createElement("button");
      const key = document.createElement("span");
      key.className = "key";
      key.textContent = weapon.key === null ? "" : String(weapon.key);
      button.append(key, weapon.name);
      button.setAttribute("aria-pressed", String(weapon.id === selectedWeapon));
      button.addEventListener("click", () => selectWeapon(weapon.id));
      if (COOLDOWN_MS[weapon.id]) gunButtons.set(weapon.id, button);
      return button;
    }),
  );
}

// Every frame: a dark fill drains from each button as its weapon reloads.
function updateGunCooldowns(): void {
  for (const [id, button] of gunButtons) {
    button.style.setProperty("--cooldown", String(cooldownFraction(id)));
  }
}

function updateUpgradesToggle(): void {
  upgradesToggle.textContent = upgradesEnabled ? "Upgrades: On" : "Upgrades: Off";
  upgradesToggle.setAttribute("aria-pressed", String(upgradesEnabled));
}

function toggleUpgrades(): void {
  sound.unlock();
  sound.click();
  upgradesEnabled = !upgradesEnabled;
  saveUpgradesEnabled(storage, upgradesEnabled);
  updateUpgradesToggle();
}

function updateSoundToggle(): void {
  soundToggle.textContent = sound.muted ? "Sound: Off" : "Sound: On";
  soundToggle.setAttribute("aria-pressed", String(!sound.muted));
}

function toggleMute(): void {
  sound.unlock();
  sound.setMuted(!sound.muted);
  saveMuted(storage, sound.muted);
  updateSoundToggle();
  sound.click(); // only heard when turning sound back on
}

restartButton.addEventListener("click", restart);
toMenuButton.addEventListener("click", () => {
  sound.click();
  showMenu();
});
playButton.addEventListener("click", () => startFromMenu("timed"));
sandboxButton.addEventListener("click", () => startFromMenu("sandbox"));
exitSandboxButton.addEventListener("click", exitSandbox);
soundToggle.addEventListener("click", toggleMute);
numbersToggle.addEventListener("click", toggleNumbers);
updateNumbersToggle();
window.addEventListener("keydown", (e) => {
  // Don't treat typing (like initials with an M in them) as a shortcut.
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "m" || e.key === "M") toggleMute();
  if (e.key === "Escape") exitSandbox();
  // During a round: number keys pick a weapon directly, Q and E cycle through them.
  if (phase === "ready" || phase === "playing") {
    if (/^[0-9]$/.test(e.key)) {
      const weapon = WEAPONS.find((w) => w.key === Number(e.key));
      if (weapon) selectWeapon(weapon.id);
    }
    if (e.key === "q" || e.key === "Q") cycleWeapon(-1);
    if (e.key === "e" || e.key === "E") cycleWeapon(1);
  }
});
updateSoundToggle();

menuShopButton.addEventListener("click", () => openShop(menuScreen));
menuLeaderboardButton.addEventListener("click", openLeaderboard);
boardBackButton.addEventListener("click", () => {
  sound.click();
  leaderboardScreen.hidden = true;
  showMenu();
});
initialsInput.addEventListener("input", () => {
  initialsInput.value = normalizeInitials(initialsInput.value);
});
submitForm.addEventListener("submit", (e) => {
  e.preventDefault(); // handle it here instead of reloading the page
  void sendScore();
});
resultsShopButton.addEventListener("click", () => openShop(resultsScreen));
shopBackButton.addEventListener("click", closeShop);
tabUpgrades.addEventListener("click", () => showShopTab("upgrades"));
tabWeapons.addEventListener("click", () => showShopTab("weapons"));
upgradesToggle.addEventListener("click", toggleUpgrades);
updateUpgradesToggle();

showMenu(); // the game opens on the start menu

// ---------------------------------------------------------------------------
// Update: game rules that run every physics step
// ---------------------------------------------------------------------------
function update(dt: number): void {
  if (phase === "playing" && mode === "timed") {
    const secondsBefore = Math.ceil(timeLeft);
    timeLeft -= dt;
    const secondsAfter = Math.ceil(timeLeft);
    // Tick once per second during the last 5 seconds.
    if (secondsAfter < secondsBefore && secondsAfter >= 1 && secondsAfter <= 5) sound.tick();
    if (timeLeft <= 0) endRound();
  }

  combo.update(dt);

  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.y -= 50 * dt; // drift upward
    f.life -= dt;
    if (f.life <= 0) floaters.splice(i, 1);
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.vy += 900 * dt; // gravity
    s.vx *= 0.97; // air drag
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) sparks.splice(i, 1);
  }

  for (let i = shotFlashes.length - 1; i >= 0; i--) {
    shotFlashes[i].life -= dt;
    if (shotFlashes[i].life <= 0) shotFlashes.splice(i, 1);
  }
  updateGun();
  updateBullets();
  updateBombs(dt);
  updateProjectiles(dt);
  updateFlames(dt);
  updateBoomerangs(dt);
  updateGunCooldowns();

  shake *= 0.88; // fade the shake out quickly

  for (const [body, left] of flashes) {
    if (left - dt <= 0) flashes.delete(body);
    else flashes.set(body, left - dt);
  }

  // Safety net: if the ragdoll ever escapes the arena, bring it back.
  const escaped = ragdoll.parts.some(
    (p) => p.position.x < -50 || p.position.x > W + 50 || p.position.y < -50 || p.position.y > H + 50,
  );
  if (escaped) {
    release();
    respawnRagdoll();
  }
}

// ---------------------------------------------------------------------------
// Draw: paint the current state onto the canvas
// ---------------------------------------------------------------------------
function drawBody(body: Matter.Body): void {
  ctx.fillStyle = flashes.has(body) ? "#ffffff" : (body.render.fillStyle ?? "#fff");
  ctx.beginPath();
  if (body.circleRadius) {
    ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
  } else {
    const [first, ...rest] = body.vertices;
    ctx.moveTo(first.x, first.y);
    for (const v of rest) ctx.lineTo(v.x, v.y);
    ctx.closePath();
  }
  ctx.fill();
}

function draw(): void {
  ctx.save();

  // Screen shake: nudge everything by a small random offset.
  ctx.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake);

  // Background and arena border
  ctx.fillStyle = "#1b1b2f";
  ctx.fillRect(-30, -30, W + 60, H + 60);
  ctx.strokeStyle = "#3a3a5c";
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  if (activeWeapons.spikes > 0) drawSpikes();

  // The "rope" between the pointer and the grabbed spot
  if (grab && grab.bodyB) {
    const anchor = Vector.add(grab.bodyB.position, grab.pointB);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(grab.pointA.x, grab.pointA.y);
    ctx.lineTo(anchor.x, anchor.y);
    ctx.stroke();
  }

  for (const part of ragdoll.parts) drawBody(part);
  if (held) drawHeldWeapon(held);

  // Bullets: bright streaks pointing back along their path
  ctx.lineCap = "round";
  for (const b of bullets) {
    ctx.strokeStyle = "#fff4c2";
    ctx.lineWidth = b.id === "revolver" ? 5 : b.id === "shotgun" ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.7, b.y - b.vy * 0.7);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  if (gunHeld) drawGun(gunHeld);
  drawExplosives();
  drawFireAndBoomerangs();

  // Sparks fade out as they die
  for (const s of sparks) {
    ctx.globalAlpha = s.life / s.maxLife;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
  }
  ctx.globalAlpha = 1;

  // Muzzle flashes: a bright burst that shrinks and fades
  for (const f of shotFlashes) {
    const left = f.life / 0.08; // 1 when fired, 0 when gone
    ctx.globalAlpha = left;
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(f.x, f.y, (f.heavy ? 16 : 10) * left, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(f.x, f.y, (f.heavy ? 8 : 5) * left, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Floating damage numbers
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life / 0.4);
    ctx.font = `800 ${f.size}px system-ui, sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#1b1b2f";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
  drawHud();
}

// Score, timer and combo. Drawn without shake so they stay readable.
function drawHud(): void {
  if (phase === "menu") return; // the menu covers the screen
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  ctx.font = "800 28px system-ui, sans-serif";

  ctx.textAlign = "left";
  if (mode === "sandbox") {
    // No score or timer: just say which mode this is (Exit sits top right).
    ctx.fillText("Sandbox", 28, 24);
    drawReadyHint();
    return;
  }
  ctx.fillText(`Damage: ${score.toLocaleString()}`, 28, 24);
  if (bestScore > 0) {
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(`Best: ${bestScore.toLocaleString()}`, 28, 60);
    ctx.font = "800 28px system-ui, sans-serif";
  }

  ctx.textAlign = "right";
  ctx.fillStyle = timeLeft <= 5 && phase === "playing" ? "#ef476f" : "#ffffff";
  ctx.fillText(`${Math.ceil(timeLeft)}s`, W - 28, 24);

  if (combo.count > 1) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#06d6a0";
    // With two or more kinds of hit in the combo, show how many (they raise the cap).
    const kinds = combo.sources.size;
    let label = kinds > 1 ? `COMBO x${combo.multiplier.toFixed(2)} · ${kinds} weapons` : `COMBO x${combo.multiplier.toFixed(2)}`;
    // Weapon hits are adding less: nudge the player to switch (turns orange).
    const usingWeapons = [...combo.sources].some((s) => s !== "throw");
    if (usingWeapons && combo.fading) {
      label += " · switch!";
      ctx.fillStyle = "#f78c6b";
    }
    if (label.length > 24) ctx.font = "800 22px system-ui, sans-serif"; // long labels: smaller, so they clear the score
    ctx.fillText(label, W / 2, 24);
    ctx.font = "800 28px system-ui, sans-serif";
  }

  drawReadyHint();
}

// Before the first grab: how to play, and how to use the selected weapon.
function drawReadyHint(): void {
  if (phase === "ready") {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillText("Grab the ragdoll and fling it into the walls!", W / 2, H * 0.38); // below the weapon bar, even when it wraps
    if (!weaponBar.hidden) {
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      const weapon = weaponInfo(selectedWeapon);
      const hint =
        weapon.kind === "gun"
          ? `Or hold empty space to fire your ${weapon.name}`
          : weapon.kind === "thrown"
            ? `Or hold empty space, then fling your ${weapon.name}`
            : `Or press empty space to swing your ${weapon.name}`;
      ctx.fillText(hint, W / 2, H * 0.38 + 34);
    }
  }
}

// Spiked walls: a row of grey triangles along the inside of the border.
function drawSpikes(): void {
  const inner = 12; // inside edge of the border
  const size = 10;
  const gap = 30;
  ctx.fillStyle = "#9aa0b8";
  ctx.beginPath();
  for (let x = inner + gap / 2; x < W - inner; x += gap) {
    spike(x, inner, 0, 1); // ceiling
    spike(x, H - inner, 0, -1); // floor
  }
  for (let y = inner + gap / 2; y < H - inner; y += gap) {
    spike(inner, y, 1, 0); // left
    spike(W - inner, y, -1, 0); // right
  }
  ctx.fill();

  // One triangle: base on the wall, point aimed into the arena along (nx, ny).
  function spike(x: number, y: number, nx: number, ny: number): void {
    ctx.moveTo(x - ny * size * 0.6, y - nx * size * 0.6);
    ctx.lineTo(x + nx * size, y + ny * size);
    ctx.lineTo(x + ny * size * 0.6, y + nx * size * 0.6);
  }
}

// The held gun, drawn at the hand and turned the way it's aiming. It flips
// when aiming left so the grip always hangs down, and slides back on recoil.
function drawGun(gun: GunHeld): void {
  const length = GUN_LENGTH[gun.id] ?? 30;
  ctx.save();
  ctx.translate(gun.at.x, gun.at.y);
  ctx.rotate(gun.angle);
  if (Math.cos(gun.angle) < 0) ctx.scale(1, -1);
  ctx.translate(-gun.recoil, 0);

  if (gun.id === "cannon") {
    ctx.fillStyle = "#2b2d42"; // a fat black barrel with a rim
    ctx.fillRect(-10, -10, length + 10, 20);
    ctx.fillStyle = "#4a4e69";
    ctx.fillRect(length - 6, -12, 8, 24);
  } else if (gun.id === "shotgun") {
    ctx.fillStyle = "#8d5a3b"; // wooden stock
    ctx.fillRect(-16, -4, 22, 10);
    ctx.fillStyle = "#4a4e69"; // dark barrel
    ctx.fillRect(6, -6, length - 6, 8);
  } else if (gun.id === "flamethrower") {
    ctx.fillStyle = "#ef476f"; // fuel tank
    ctx.beginPath();
    ctx.arc(-4, 6, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6c7086"; // nozzle
    ctx.fillRect(0, -5, length, 8);
    ctx.fillStyle = "#ffd166"; // pilot light
    ctx.fillRect(length - 4, -7, 4, 3);
  } else if (gun.id === "rpg") {
    ctx.fillStyle = "#556b2f"; // a long green tube
    ctx.fillRect(-20, -7, length + 20, 14);
    ctx.fillStyle = "#4a4e69"; // grip
    ctx.fillRect(4, 6, 8, 12);
  } else {
    const heavy = gun.id === "revolver";
    ctx.fillStyle = "#4a4e69"; // grip
    ctx.save();
    ctx.rotate(0.35);
    ctx.fillRect(-4, 0, 9, 16);
    ctx.restore();
    ctx.fillStyle = "#9aa0b8"; // body and barrel
    ctx.fillRect(-6, -6, length + 6, heavy ? 8 : 7);
    if (heavy) {
      ctx.fillStyle = "#6c7086"; // the revolver's cylinder
      ctx.beginPath();
      ctx.arc(6, -2, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// A bomb: its body, a dark band, and (once thrown) a fuse spark that blinks
// faster as it burns down.
function drawBomb(body: Matter.Body, fuseLeft: number | null): void {
  drawBody(body);
  const r = body.circleRadius ?? 8;
  const { x, y } = body.position;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(x - r, y - r * 0.2, r * 2, r * 0.4);
  if (fuseLeft === null) return;
  const blinkRate = fuseLeft < 0.3 ? 30 : 12;
  if (Math.sin(performance.now() / 1000 * blinkRate) > 0) {
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(x, y - r - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Bombs, cannonballs, rockets and fireballs.
// A boomerang: two wooden arms in a wide V.
function drawBoomerangShape(at: Matter.Vector, angle: number): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  ctx.strokeStyle = "#c68642";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-16, 8);
  ctx.lineTo(0, -6);
  ctx.lineTo(16, 8);
  ctx.stroke();
  ctx.restore();
}

// Flames, fire on burning parts, and boomerangs in flight.
function drawFireAndBoomerangs(): void {
  // Burning parts glow and flicker orange.
  for (const part of burning.keys()) {
    ctx.globalAlpha = 0.35 + Math.random() * 0.3;
    ctx.fillStyle = "#f78c6b";
    ctx.beginPath();
    if (part.circleRadius) {
      ctx.arc(part.position.x, part.position.y, part.circleRadius + 2, 0, Math.PI * 2);
    } else {
      const [first, ...rest] = part.vertices;
      ctx.moveTo(first.x, first.y);
      for (const v of rest) ctx.lineTo(v.x, v.y);
      ctx.closePath();
    }
    ctx.fill();
  }

  // Flame puffs grow as they age, and fade from yellow to orange.
  const maxLife = CONFIG.flamethrower.flameSeconds;
  for (const flame of flames) {
    const age = 1 - flame.life / maxLife; // 0 new, 1 gone
    ctx.globalAlpha = 0.8 * (1 - age);
    ctx.fillStyle = age < 0.35 ? "#ffd166" : "#f78c6b";
    ctx.beginPath();
    ctx.arc(flame.x, flame.y, 5 + age * 16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const boom of boomerangs) drawBoomerangShape(boom, boom.spin);
}

function drawExplosives(): void {
  for (const bomb of bombs) drawBomb(bomb.body, bomb.fuseLeft);
  for (const ball of cannonballs) drawBody(ball.body);

  for (const rocket of rockets) {
    ctx.save();
    ctx.translate(rocket.x, rocket.y);
    ctx.rotate(rocket.angle);
    ctx.fillStyle = "#c9d1d9";
    ctx.fillRect(-16, -4, 16, 8); // body
    ctx.fillStyle = "#ef476f";
    ctx.beginPath(); // nose
    ctx.moveTo(0, -4);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, 4);
    ctx.fill();
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(-22, -2, 6, 4); // flame
    ctx.restore();
  }

  // Fireballs: an orange disc that grows and fades, with a white-hot core.
  for (const blast of blasts) {
    const age = 1 - blast.life / BLAST_SECONDS; // 0 new, 1 gone
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = "#f78c6b";
    ctx.beginPath();
    ctx.arc(blast.x, blast.y, blast.radius * (0.3 + 0.7 * age), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff4c2";
    ctx.beginPath();
    ctx.arc(blast.x, blast.y, blast.radius * 0.3 * (1 - age), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// The held weapon. The Bat and Axe are drawn as their physics shapes (the
// Axe is two shapes: handle and blade), with dark grip tape on the handle.
function drawHeldWeapon(weapon: HeldWeapon): void {
  if (weapon.id === "fist") {
    drawFist(weapon.body);
    return;
  }
  if (weapon.id === "boomerang") {
    drawBoomerangShape(weapon.body.position, weapon.body.angle);
    return;
  }
  if (weaponInfo(weapon.id).kind === "thrown") {
    drawBomb(weapon.body, null);
    return;
  }
  const { body } = weapon;
  const pieces = body.parts.length > 1 ? body.parts.slice(1) : [body];
  for (const piece of pieces) drawBody(piece);

  const grip = Vector.add(body.position, Vector.rotate(weapon.handle, body.angle));
  const along = Vector.rotate({ x: 1, y: 0 }, body.angle);
  ctx.strokeStyle = "#3a2618";
  const gripWidth = { bat: CONFIG.bat.width, axe: CONFIG.axe.width, katana: CONFIG.katana.width + 2 };
  ctx.lineWidth = gripWidth[weapon.id as keyof typeof gripWidth] ?? 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(grip.x - along.x * 6, grip.y - along.y * 6);
  ctx.lineTo(grip.x + along.x * 14, grip.y + along.y * 14);
  ctx.stroke();
  ctx.lineCap = "butt";

  if (weapon.id === "katana") {
    // The guard between handle and blade: a short gold bar across it.
    const guard = Vector.add(grip, Vector.mult(along, 18));
    const across = { x: -along.y, y: along.x };
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(guard.x - across.x * 7, guard.y - across.y * 7);
    ctx.lineTo(guard.x + across.x * 7, guard.y + across.y * 7);
    ctx.stroke();
  }
}

// The Fist: a skin-colored ball with knuckle lines on the side it's moving toward.
function drawFist(body: Matter.Body): void {
  drawBody(body);
  const r = CONFIG.fist.radius;
  const { x, y } = body.position;
  const speed = Vector.magnitude(body.velocity);
  const angle = speed > 0.5 ? Math.atan2(body.velocity.y, body.velocity.x) : -Math.PI / 2;
  ctx.strokeStyle = "#c98a5e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  for (const offset of [-0.5, 0, 0.5]) {
    const a = angle + offset;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
    ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// The game loop
// Physics runs in fixed 1/60-second steps so it behaves the same on every
// computer. Drawing happens once per screen refresh.
// ---------------------------------------------------------------------------
const STEP_MS = 1000 / 60;
let lastTime = performance.now();
let accumulator = 0;

function frame(now: number): void {
  // Cap the catch-up time so switching tabs doesn't cause a huge jump.
  accumulator += Math.min(now - lastTime, 250);
  lastTime = now;

  while (accumulator >= STEP_MS) {
    update(STEP_MS / 1000);
    Engine.update(engine, STEP_MS);
    accumulator -= STEP_MS;
  }

  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
