// Sound effects, made in code with the Web Audio API (no audio files).
//
// Browsers won't play sound until the player has clicked something, so the
// audio engine is created in unlock(), which runs on the Play button click.
// If audio isn't available at all, every method quietly does nothing.

import type { ScoreStorage } from "./bestScore";

const MUTED_KEY = "ragdoll-fling:muted";

// ---------------------------------------------------------------------------
// Pure helpers (no audio needed, so they can be unit tested)
// ---------------------------------------------------------------------------

/** How loud an impact is (0 to 1). Grows with damage, but never deafening. */
export function impactVolume(damage: number): number {
  if (damage <= 0) return 0;
  return Math.min(1, 0.15 + Math.sqrt(damage) / 20);
}

/** Starting pitch of the impact thud in Hz. Harder hits sound deeper. */
export function impactPitch(damage: number): number {
  return Math.max(55, 180 - Math.sqrt(Math.max(0, damage)) * 8);
}

/** Pitch of the combo blip in Hz. Rises a musical step per hit, then levels off. */
export function comboPitch(comboCount: number): number {
  const steps = Math.min(Math.max(comboCount - 2, 0), 16);
  return 440 * 2 ** (steps / 12);
}

/** Reads the saved mute setting. Missing or unreadable means sound on. */
export function loadMuted(storage: ScoreStorage | undefined): boolean {
  try {
    return storage?.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(storage: ScoreStorage | undefined, muted: boolean): void {
  try {
    storage?.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // Can't remember the setting; it still applies for this visit.
  }
}

// ---------------------------------------------------------------------------
// The sound player
// ---------------------------------------------------------------------------

export class Sound {
  muted: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastImpactTime = 0;
  private lastImpactVolume = 0;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  /** Call from a click or key press. Creates or wakes up the audio engine. */
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.6;
        this.master.connect(this.ctx.destination);
        this.noise = this.makeNoise(this.ctx);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null; // no audio support: stay silent
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
    }
  }

  /** A thud for a wall hit. Several hits in the same instant play as one. */
  impact(damage: number): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const volume = impactVolume(damage);
    const now = ctx.currentTime;
    // Many body parts can hit in the same frame: keep only the loudest.
    if (now - this.lastImpactTime < 0.03 && volume <= this.lastImpactVolume) return;
    this.lastImpactTime = now;
    this.lastImpactVolume = volume;

    // Low "thump": a sine wave whose pitch drops quickly.
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(impactPitch(damage), now);
    thump.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    const thumpGain = this.envelope(ctx, now, volume, 0.2);
    thump.connect(thumpGain);
    thump.start(now);
    thump.stop(now + 0.22);

    // "Smack": a short burst of noise, muffled by a low-pass filter.
    const smack = ctx.createBufferSource();
    smack.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900 + volume * 2500;
    const smackGain = this.envelope(ctx, now, volume * 0.7, 0.08);
    smack.connect(filter).connect(smackGain);
    smack.start(now);
    smack.stop(now + 0.1);
  }

  /** A gunshot: a sharp crack of noise. Heavy shots add a deep boom. */
  shot(heavy: boolean): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const now = ctx.currentTime;

    const crack = ctx.createBufferSource();
    crack.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = heavy ? 600 : 1500;
    crack.connect(filter).connect(this.envelope(ctx, now, heavy ? 0.6 : 0.35, heavy ? 0.12 : 0.06));
    crack.start(now);
    crack.stop(now + 0.15);

    if (heavy) {
      const boom = ctx.createOscillator();
      boom.type = "sine";
      boom.frequency.setValueAtTime(140, now);
      boom.frequency.exponentialRampToValueAtTime(45, now + 0.2);
      boom.connect(this.envelope(ctx, now, 0.5, 0.22));
      boom.start(now);
      boom.stop(now + 0.25);
    }
  }

  /** A flamethrower's roar: a soft burst of filtered noise, repeated while firing. */
  flame(): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const now = ctx.currentTime;
    const roar = ctx.createBufferSource();
    roar.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.7;
    roar.connect(filter).connect(this.envelope(ctx, now, 0.18, 0.2));
    roar.start(now);
    roar.stop(now + 0.25);
  }

  /** An explosion: a long rumble of muffled noise over a deep falling boom. */
  explosion(big: boolean): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const now = ctx.currentTime;
    const length = big ? 0.6 : 0.35;

    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(big ? 1800 : 2500, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + length);
    rumble.connect(filter).connect(this.envelope(ctx, now, big ? 0.9 : 0.5, length));
    rumble.start(now);
    rumble.stop(now + length + 0.05);

    const boom = ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(big ? 90 : 130, now);
    boom.frequency.exponentialRampToValueAtTime(30, now + length);
    boom.connect(this.envelope(ctx, now, big ? 0.8 : 0.4, length));
    boom.start(now);
    boom.stop(now + length + 0.05);
  }

  /** A short blip that rises in pitch as the combo grows. */
  combo(comboCount: number): void {
    this.tone(comboPitch(comboCount), 0.08, "triangle", 0.18);
  }

  /** Round start: two quick rising notes. */
  start(): void {
    this.tone(523, 0.08, "square", 0.12);
    this.tone(784, 0.12, "square", 0.12, 0.08);
  }

  /** Countdown tick for the last seconds of the round. */
  tick(): void {
    this.tone(1200, 0.04, "square", 0.08);
  }

  /** Round end: a falling three-note chime. */
  end(): void {
    this.tone(784, 0.15, "triangle", 0.25);
    this.tone(659, 0.15, "triangle", 0.25, 0.15);
    this.tone(523, 0.35, "triangle", 0.25, 0.3);
  }

  /** New best score: a quick rising fanfare. */
  newBest(): void {
    [523, 659, 784, 1047].forEach((freq, i) => this.tone(freq, 0.14, "square", 0.14, 0.55 + i * 0.1));
  }

  /** Shop purchase: a bright two-note "ka-ching". */
  buy(): void {
    this.tone(988, 0.08, "square", 0.14);
    this.tone(1319, 0.18, "square", 0.14, 0.07);
  }

  /** Button press. */
  click(): void {
    this.tone(660, 0.05, "triangle", 0.15);
  }

  // --- building blocks -----------------------------------------------------

  /** The audio engine if it's running and sound is on, otherwise null. */
  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || !this.master) return null;
    return this.ctx;
  }

  /** A single note: a basic waveform with a quick fade in and out. */
  private tone(freq: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(this.envelope(ctx, at, volume, duration));
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  /** A volume control that jumps up fast and fades out, wired to the speakers. */
  private envelope(ctx: AudioContext, at: number, volume: number, duration: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.connect(this.master!);
    return gain;
  }

  /** Half a second of random noise, reused for every impact. */
  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
