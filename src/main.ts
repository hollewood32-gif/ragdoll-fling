// Ragdoll Fling: the game loop, input, collisions and drawing.

import Matter from "matter-js";
import "./style.css";
import { CONFIG } from "./config";
import { getBrowserStorage, loadBestScore, PURE_STORAGE_KEY, recordScore } from "./bestScore";
import { coinsForScore, loadCoins, saveCoins } from "./coins";
import { GRAB_RADIUS, pickPart } from "./grab";
import { createRagdoll, wholeBodySpeed, type Ragdoll } from "./ragdoll";
import { Combo, damageFromSpeed, pointsForHit } from "./scoring";
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
  activeWeapons = upgradesEnabled ? weapons : NO_WEAPONS;
  roundStartsPure = !hasAnyUpgrade(active) && activeWeapons.spikes === 0;
  weaponUsed = false;
  combo.windowSeconds = settings.comboWindowSeconds;
  // Matter.js uses the bouncier of the two bodies in a collision, and the
  // ragdoll's parts have the base bounce, so raising the walls' bounce works.
  for (const wall of walls) wall.restitution = settings.wallBounce;
}

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

const stats = new RoundStats();const flashes = new Map<Matter.Body, number>(); // body -> seconds of flash left
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
    // Pressed empty space: pick up the selected weapon (swung or gun).
    const kind = activeWeapons[selectedWeapon] > 0 ? weaponInfo(selectedWeapon).kind : null;
    if (kind === "melee") {
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
    putAwayWeapon();
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
const SWING_STATS: Record<"fist" | "bat" | "axe", { damage: number; knockback: number; cooldownMs: number }> = {
  fist: { damage: CONFIG.fist.damage, knockback: CONFIG.fist.knockback, cooldownMs: CONFIG.swingHitCooldownMs },
  bat: { damage: CONFIG.bat.damage, knockback: CONFIG.bat.knockback, cooldownMs: CONFIG.bat.cooldownMs },
  axe: { damage: CONFIG.axe.damage, knockback: CONFIG.axe.knockback, cooldownMs: CONFIG.axe.cooldownMs },
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
      registerHit(part, damage, CONFIG.hitCooldownMs, wallSparkOrigin(part));
    } else if (hitBy.label === "weapon" && held) {
      const contact = pair.collision.supports?.[0] ?? held.body.position;
      swingHit(part, held, pair.collision.normal, { x: contact.x, y: contact.y });
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
  const landed = registerHit(part, damage, CONFIG.hitCooldownMs, {
    x: contact.x,
    y: contact.y,
    nx: direction.x,
    ny: direction.y,
  });
  if (!landed) return;
  lastSwingHitAt = engine.timing.timestamp;
  weaponUsed = true; // this round no longer counts for Pure best

  Body.setVelocity(part, Vector.add(part.velocity, Vector.mult(direction, hitStats.knockback * power)));
}

// ---------------------------------------------------------------------------
// Guns: hold one and it fires bullets at the dummy
// ---------------------------------------------------------------------------
const GUN_STATS: Record<"pistol" | "revolver", { damage: number; knockback: number; cooldownMs: number }> = {
  pistol: CONFIG.pistol,
  revolver: CONFIG.revolver,
};

function gunStats(id: WeaponId) {
  return GUN_STATS[id as keyof typeof GUN_STATS] ?? null;
}

const GUN_LENGTH = { pistol: 30, revolver: 42 }; // grip to muzzle, for drawing and firing

const lastShotAt = new Map<WeaponId, number>(); // gun -> game time of its last shot (ms)

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
}
const bullets: Bullet[] = [];
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
  gunHeld.angle = aimAt(gunHeld.at);
  gunHeld.recoil *= 0.8;
  if (phase !== "playing") return;

  const gun = gunStats(gunHeld.id);
  if (!gun) return;
  const now = engine.timing.timestamp;
  if (cooldownLeft(now, lastShotAt.get(gunHeld.id) ?? -Infinity, gun.cooldownMs) > 0) return;
  lastShotAt.set(gunHeld.id, now);

  const heavy = gunHeld.id === "revolver";
  const dir = { x: Math.cos(gunHeld.angle), y: Math.sin(gunHeld.angle) };
  const length = heavy ? GUN_LENGTH.revolver : GUN_LENGTH.pistol;
  const muzzle = Vector.add(gunHeld.at, Vector.mult(dir, length));
  if (bullets.length < MAX_BULLETS) {
    bullets.push({ ...muzzle, vx: dir.x * CONFIG.bulletSpeed, vy: dir.y * CONFIG.bulletSpeed, id: gunHeld.id });
  }
  shotFlashes.push({ ...muzzle, life: 0.08, heavy });
  gunHeld.recoil = heavy ? 12 : 5;
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
    if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) {
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
  const landed = registerHit(part, gun.damage * power, 0, { x: bullet.x, y: bullet.y, nx: dir.x, ny: dir.y });
  if (!landed) return;
  weaponUsed = true; // this round no longer counts for Pure best
  // Knock the part along the bullet's path, plus a little lift to keep it airborne.
  const kick = Vector.add(Vector.mult(dir, gun.knockback * power), { x: 0, y: -1.5 });
  Body.setVelocity(part, Vector.add(part.velocity, kick));
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
function registerHit(part: Matter.Body, rawDamage: number, cooldownMs: number, origin: SparkOrigin): boolean {
  const now = engine.timing.timestamp;
  const last = lastHitAt.get(part) ?? -Infinity;
  if (now - last < cooldownMs) return false;

  const damage = Math.round(rawDamage * settings.damageMultiplier);
  if (damage <= 0) return false;
  lastHitAt.set(part, now);

  // Hits while the ragdoll is still held are worth less and don't build the combo.
  const whileHeld = grab !== null;
  const multiplier = whileHeld ? 1 : combo.hit();
  const points = pointsForHit(damage, multiplier, whileHeld);
  score += points;
  stats.recordHit(points, multiplier);

  sound.impact(damage);
  if (!whileHeld && combo.count > 1) sound.combo(combo.count);

  floaters.push({
    x: part.position.x,
    y: part.position.y,
    text: String(points),
    size: whileHeld ? Math.min(28, 14 + points * 0.25) : Math.min(64, 18 + damage * 0.25),
    color: whileHeld ? "#9aa0b8" : "#ffd166",
    life: 0.9,
  });
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
  renderWeaponBar();
  menuBestScore.textContent = bestScore.toLocaleString();
  menuPureBest.textContent = formatRecord(pureBest);
  menuBestLine.hidden = bestScore <= 0;
  menuCoins.textContent = coins.toLocaleString();
  menuScreen.hidden = false;
  playButton.focus();
}

function startFromMenu(): void {
  sound.unlock(); // browsers only allow sound after a click like this one
  sound.click();
  resetRound(); // applies the Upgrades On/Off switch and any purchases
  menuScreen.hidden = true;
  phase = "ready";
  renderWeaponBar();
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
function selectWeapon(id: WeaponId): void {
  if (activeWeapons[id] <= 0 || weaponInfo(id).key === null) return;
  if (id !== selectedWeapon) {
    putAwayWeapon(); // let go of the old one; press again to use the new one
    sound.click();
  }
  selectedWeapon = id;
  saveSelectedWeapon(storage, id);
  renderWeaponBar();
}

// Bar buttons for guns, so their cooldown fill can be updated every frame.
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
      key.textContent = String(weapon.key);
      button.append(key, weapon.name);
      button.setAttribute("aria-pressed", String(weapon.id === selectedWeapon));
      button.addEventListener("click", () => selectWeapon(weapon.id));
      if (weapon.kind === "gun") gunButtons.set(weapon.id, button);
      return button;
    }),
  );
}

// Every frame: a dark fill drains from each gun's button as it reloads.
function updateGunCooldowns(): void {
  const now = engine.timing.timestamp;
  for (const [id, button] of gunButtons) {
    const gun = gunStats(id);
    const left = gun ? cooldownLeft(now, lastShotAt.get(id) ?? -Infinity, gun.cooldownMs) : 0;
    button.style.setProperty("--cooldown", String(left));
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
playButton.addEventListener("click", startFromMenu);
soundToggle.addEventListener("click", toggleMute);
window.addEventListener("keydown", (e) => {
  // Don't treat typing (like initials with an M in them) as a shortcut.
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "m" || e.key === "M") toggleMute();
  // Number keys pick a weapon during a round.
  if (/^[1-9]$/.test(e.key) && (phase === "ready" || phase === "playing")) {
    const weapon = WEAPONS.find((w) => w.key === Number(e.key));
    if (weapon) selectWeapon(weapon.id);
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
  if (phase === "playing") {
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
    ctx.lineWidth = b.id === "revolver" ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.7, b.y - b.vy * 0.7);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.lineCap = "butt";

  if (gunHeld) drawGun(gunHeld);

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
    ctx.fillText(`COMBO x${combo.multiplier.toFixed(2)}`, W / 2, 24);
  }

  if (phase === "ready") {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillText("Grab the ragdoll and fling it into the walls!", W / 2, H * 0.2);
    if (!weaponBar.hidden) {
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      const weapon = weaponInfo(selectedWeapon);
      const hint =
        weapon.kind === "gun"
          ? `Or hold empty space to fire your ${weapon.name}`
          : `Or press empty space to swing your ${weapon.name}`;
      ctx.fillText(hint, W / 2, H * 0.2 + 34);
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

// The held weapon. The Bat and Axe are drawn as their physics shapes (the
// Axe is two shapes: handle and blade), with dark grip tape on the handle.
// The held gun, drawn at the hand and turned toward the dummy. It flips when
// aiming left so the grip always hangs down, and slides back on recoil.
function drawGun(gun: GunHeld): void {
  const heavy = gun.id === "revolver";
  const length = heavy ? GUN_LENGTH.revolver : GUN_LENGTH.pistol;
  ctx.save();
  ctx.translate(gun.at.x, gun.at.y);
  ctx.rotate(gun.angle);
  if (Math.cos(gun.angle) < 0) ctx.scale(1, -1);
  ctx.translate(-gun.recoil, 0);

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
  ctx.restore();
}

function drawHeldWeapon(weapon: HeldWeapon): void {
  if (weapon.id === "fist") {
    drawFist(weapon.body);
    return;
  }
  const { body } = weapon;
  const pieces = body.parts.length > 1 ? body.parts.slice(1) : [body];
  for (const piece of pieces) drawBody(piece);

  const grip = Vector.add(body.position, Vector.rotate(weapon.handle, body.angle));
  const along = Vector.rotate({ x: 1, y: 0 }, body.angle);
  ctx.strokeStyle = "#3a2618";
  ctx.lineWidth = weapon.id === "bat" ? CONFIG.bat.width : CONFIG.axe.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(grip.x - along.x * 6, grip.y - along.y * 6);
  ctx.lineTo(grip.x + along.x * 14, grip.y + along.y * 14);
  ctx.stroke();
  ctx.lineCap = "butt";
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
