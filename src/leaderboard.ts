// Talking to the leaderboard API, plus the initials helpers.
// The API lives on the same site at /api/..., so no extra setup is needed.

import type { ScoreStorage } from "./bestScore";

export interface LeaderboardEntry {
  initials: string;
  score: number;
  created_at: string;
}

export const INITIALS_KEY = "ragdoll-fling:initials";

/** Cleans typed initials: capital letters A to Z only, at most 3. */
export function normalizeInitials(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

export function isValidInitials(initials: string): boolean {
  return /^[A-Z]{3}$/.test(initials);
}

/** The last initials this player used, so the box can be pre-filled. */
export function loadInitials(storage: ScoreStorage | undefined): string {
  try {
    return normalizeInitials(storage?.getItem(INITIALS_KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveInitials(storage: ScoreStorage | undefined, initials: string): void {
  try {
    storage?.setItem(INITIALS_KEY, initials);
  } catch {
    // Not remembered; they can type them again next time.
  }
}

/** Fetches the top 10. Throws if the server can't be reached. */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch("/api/leaderboard");
  if (!response.ok) throw new Error(`Leaderboard unavailable (${response.status})`);
  const data = (await response.json()) as { scores?: LeaderboardEntry[] };
  return data.scores ?? [];
}

export type SubmitResult = { ok: true; rank: number } | { ok: false; error: string };

/** Sends a score. Never throws: problems come back as { ok: false, error }. */
export async function submitScore(initials: string, score: number): Promise<SubmitResult> {
  try {
    const response = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initials, score }),
    });
    const data = (await response.json().catch(() => ({}))) as { rank?: number; error?: string };
    if (response.ok && typeof data.rank === "number") return { ok: true, rank: data.rank };
    return { ok: false, error: data.error ?? `Something went wrong (${response.status}).` };
  } catch {
    return { ok: false, error: "Couldn't reach the leaderboard. Check your connection." };
  }
}
