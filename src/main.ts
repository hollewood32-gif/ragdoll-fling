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
  fetchLeaderboard,
  isValidInitials,
  loadInitials,
  normalizeInitials,
  saveInitials,
  submitScore,
} from "./leaderboard";

const { Engine, Composite, Bodies, Body, Constraint, Events, Vector } = Matter;
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
const wallOptions = { isStatic: true, label: "wall" };
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
// True when no upgrade is active this round, so it counts for Pure best.
let roundIsPure = true;

function applyRoundSettings(): void {
  const active = upgradesEnabled ? upgrades : NO_UPGRADES;
  settings = roundSettings(active);
  roundIsPure = !hasAnyUpgrade(active);
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

canvas.addEventListener("pointerdown", (e) => {
  if (phase === "menu" || phase === "results") return;
  if (grab) return; // already holding it: ignore a second finger

  // Fingers are less precise than a mouse, so touches get a bigger grab radius.
  const point = toWorld(e);
  const radius = e.pointerType === "mouse" ? GRAB_RADIUS.mouse : GRAB_RADIUS.touch;
  const target = pickPart(ragdoll.parts, point, radius);
  if (!target) return;

  // Keep receiving pointer events even if the pointer leaves the canvas.
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // Not supported for this pointer: dragging still works inside the canvas.
  }
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

  if (phase === "ready") {
    phase = "playing"; // the first grab starts the clock
    sound.start();
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (grab && e.pointerId === grabPointerId) grab.pointA = toWorld(e);
});

function release(): void {
  grabPointerId = null;
  if (!grab) return;
  Composite.remove(engine.world, grab);
  grab = null; // the ragdoll keeps its speed, which is the "fling"
}

// The player letting go counts as a throw (release() is also used for resets).
function onPointerUp(e: PointerEvent): void {
  if (e.pointerId !== grabPointerId) return; // a different finger lifted
  if (grab && phase === "playing") stats.recordThrow();
  release();
}
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", (e) => {
  if (e.pointerId === grabPointerId) release();
});

// ---------------------------------------------------------------------------
// Collisions: turn wall impacts into damage
// ---------------------------------------------------------------------------
Events.on(engine, "collisionStart", (event) => {
  if (phase !== "playing") return;

  // A resting ragdoll can twitch a limb against the floor. Only count hits
  // when the body as a whole is actually flying.
  if (wholeBodySpeed(ragdoll) < CONFIG.minBodySpeed) return;

  for (const pair of event.pairs) {
    const { bodyA, bodyB } = pair;
    let part: Matter.Body;
    if (bodyA.label === "wall" && bodyB.label === "ragdoll") part = bodyB;
    else if (bodyB.label === "wall" && bodyA.label === "ragdoll") part = bodyA;
    else continue;

    // Only the speed straight INTO the wall counts, not sliding along it.
    const impactSpeed = Math.abs(Vector.dot(part.velocity, pair.collision.normal));
    registerHit(part, impactSpeed);
  }
});

function registerHit(part: Matter.Body, impactSpeed: number): void {
  const now = engine.timing.timestamp;
  const last = lastHitAt.get(part) ?? -Infinity;
  if (now - last < CONFIG.hitCooldownMs) return;

  const damage = Math.round(damageFromSpeed(impactSpeed) * settings.damageMultiplier);
  if (damage <= 0) return;
  lastHitAt.set(part, now);

  // Hits while the ragdoll is still held are worth less and don't build the combo.
  const held = grab !== null;
  const multiplier = held ? 1 : combo.hit();
  const points = pointsForHit(damage, multiplier, held);
  score += points;
  stats.recordHit(points, multiplier);

  sound.impact(damage);
  if (!held && combo.count > 1) sound.combo(combo.count);

  floaters.push({
    x: part.position.x,
    y: part.position.y,
    text: String(points),
    size: held ? Math.min(28, 14 + points * 0.25) : Math.min(64, 18 + damage * 0.25),
    color: held ? "#9aa0b8" : "#ffd166",
    life: 0.9,
  });
  shake = Math.max(shake, Math.min(22, 2 + damage * 0.08) * shakeScale());
  flashes.set(part, 0.12);
  spawnSparks(part, damage, held);
}

// Bursts sparks from the wall the part hit, pointing back into the arena.
function spawnSparks(part: Matter.Body, damage: number, held: boolean): void {
  const { x, y } = part.position;
  // Which wall is closest? Its inward direction is where the sparks fly.
  const edges = [
    { dist: x, ox: 0, oy: y, nx: 1, ny: 0 }, // left
    { dist: W - x, ox: W, oy: y, nx: -1, ny: 0 }, // right
    { dist: y, ox: x, oy: 0, nx: 0, ny: 1 }, // ceiling
    { dist: H - y, ox: x, oy: H, nx: 0, ny: -1 }, // floor
  ];
  const wall = edges.reduce((a, b) => (b.dist < a.dist ? b : a));

  const count = held ? 3 : Math.min(24, 4 + Math.floor(damage / 10));
  const color = held ? "#9aa0b8" : (part.render.fillStyle ?? "#ffd166");
  for (let i = 0; i < count && sparks.length < MAX_SPARKS; i++) {
    const angle = Math.atan2(wall.ny, wall.nx) + (Math.random() - 0.5) * 2.2; // spread ~125 degrees
    const speed = 120 + Math.random() * (150 + damage * 3);
    const life = 0.3 + Math.random() * 0.4;
    sparks.push({
      x: wall.ox,
      y: wall.oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: 2 + Math.random() * (held ? 2 : 4),
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
  timeLeft = 0;
  release();
  finalScoreText.textContent = score.toLocaleString();

  const result = recordScore(storage, score, bestScore);
  bestScore = result.best;
  bestScoreText.textContent = bestScore.toLocaleString();
  newBestBadge.hidden = !result.isNewBest;

  // Pure best only counts rounds played without any active upgrades.
  let isNewPureBest = false;
  if (roundIsPure) {
    const pureResult = recordScore(storage, score, pureBest, PURE_STORAGE_KEY);
    pureBest = pureResult.best;
    isNewPureBest = pureResult.isNewBest;
  }
  pureBestText.textContent = formatRecord(pureBest) + (roundIsPure ? "" : " (upgrades on: not counted)");

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
  shake = 0;
  resultsScreen.hidden = true;
}

function restart(): void {
  sound.click();
  resetRound();
  phase = "ready"; // the clock starts on the first grab
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

// Builds one row per upgrade: name, level, what it does now and next, and a Buy button.
function renderShop(): void {
  shopCoins.textContent = coins.toLocaleString();
  shopList.replaceChildren(
    ...UPGRADES.map((upgrade) => {
      const level = upgrades[upgrade.id];
      const price = nextPrice(level);

      const item = document.createElement("li");
      item.className = "shop-item";

      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = upgrade.name;
      const levelText = document.createElement("span");
      levelText.className = "level";
      levelText.textContent = `Lv ${level}/${MAX_LEVEL}`;
      const effect = document.createElement("span");
      effect.className = "effect";
      effect.textContent =
        price === null ? upgrade.describe(level) : `${upgrade.describe(level)} → ${upgrade.describe(level + 1)}`;
      info.append(name, levelText, effect);

      const buy = document.createElement("button");
      if (price === null) {
        buy.textContent = "Maxed";
        buy.disabled = true;
      } else {
        buy.textContent = `${price.toLocaleString()} coins`;
        buy.disabled = coins < price;
        buy.addEventListener("click", () => {
          const result = buyUpgrade(upgrades, upgrade.id, coins);
          if (!result) return;
          upgrades = result.levels;
          coins = result.coins;
          saveUpgrades(storage, upgrades);
          saveCoins(storage, coins);
          sound.buy();
          renderShop();
        });
      }

      item.append(info, buy);
      return item;
    }),
  );
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

  // Sparks fade out as they die
  for (const s of sparks) {
    ctx.globalAlpha = s.life / s.maxLife;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
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
