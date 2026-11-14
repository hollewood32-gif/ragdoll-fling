// Ragdoll Fling: the game loop, input, collisions and drawing.

import Matter from "matter-js";
import "./style.css";
import { CONFIG } from "./config";
import { getBrowserStorage, loadBestScore, recordScore } from "./bestScore";
import { createRagdoll, wholeBodySpeed, type Ragdoll } from "./ragdoll";
import { Combo, damageFromSpeed, pointsForHit } from "./scoring";
import { loadMuted, saveMuted, Sound } from "./sound";

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
const newBestBadge = document.getElementById("new-best")!;
const restartButton = document.getElementById("restart")!;
const toMenuButton = document.getElementById("to-menu")!;

const menuScreen = document.getElementById("menu")!;
const menuBestLine = document.getElementById("menu-best")!;
const menuBestScore = document.getElementById("menu-best-score")!;
const playButton = document.getElementById("play")!;
const soundToggle = document.getElementById("sound-toggle")!;

// ---------------------------------------------------------------------------
// Physics world: gravity, four walls, one ragdoll
// ---------------------------------------------------------------------------
const engine = Engine.create();
engine.gravity.y = 1;

// The walls sit just outside the visible area, so the whole canvas is the arena.
const t = CONFIG.wallThickness;
const wallOptions = { isStatic: true, label: "wall" };
Composite.add(engine.world, [
  Bodies.rectangle(W / 2, H + t / 2, W + 2 * t, t, wallOptions), // floor
  Bodies.rectangle(W / 2, -t / 2, W + 2 * t, t, wallOptions), // ceiling
  Bodies.rectangle(-t / 2, H / 2, t, H + 2 * t, wallOptions), // left
  Bodies.rectangle(W + t / 2, H / 2, t, H + 2 * t, wallOptions), // right
]);

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
const flashes = new Map<Matter.Body, number>(); // body -> seconds of flash left
const lastHitAt = new Map<Matter.Body, number>(); // body -> time of last scoring hit (ms)

// ---------------------------------------------------------------------------
// Input: grab and fling with Pointer Events (mouse today, touch later)
// ---------------------------------------------------------------------------
let grab: Matter.Constraint | null = null;

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
  const point = toWorld(e);
  const body = Query.point(ragdoll.parts, point)[0];
  if (!body) return;

  // Keep receiving pointer events even if the pointer leaves the canvas.
  canvas.setPointerCapture(e.pointerId);

  // A springy rope from the pointer to the exact spot that was grabbed.
  grab = Constraint.create({
    pointA: point,
    bodyB: body,
    pointB: Vector.sub(point, body.position),
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
  if (grab) grab.pointA = toWorld(e);
});

function release(): void {
  if (!grab) return;
  Composite.remove(engine.world, grab);
  grab = null; // the ragdoll keeps its speed, which is the "fling"
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

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

  const damage = damageFromSpeed(impactSpeed);
  if (damage <= 0) return;
  lastHitAt.set(part, now);

  // Hits while the ragdoll is still held are worth less and don't build the combo.
  const held = grab !== null;
  const multiplier = held ? 1 : combo.hit();
  const points = pointsForHit(damage, multiplier, held);
  score += points;

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
  shake = Math.max(shake, Math.min(22, 2 + damage * 0.08));
  flashes.set(part, 0.12);
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

  sound.end();
  if (result.isNewBest) sound.newBest();

  resultsScreen.hidden = false;
  restartButton.focus();
}

// Puts everything back to the start of a round.
function resetRound(): void {
  release();
  respawnRagdoll();
  timeLeft = CONFIG.roundSeconds;
  score = 0;
  combo.reset();
  floaters.length = 0;
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

function showMenu(): void {
  resetRound();
  phase = "menu";
  menuBestScore.textContent = bestScore.toLocaleString();
  menuBestLine.hidden = bestScore <= 0;
  menuScreen.hidden = false;
  playButton.focus();
}

function startFromMenu(): void {
  sound.unlock(); // browsers only allow sound after a click like this one
  sound.click();
  menuScreen.hidden = true;
  phase = "ready";
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
  if (e.key === "m" || e.key === "M") toggleMute();
});
updateSoundToggle();

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
