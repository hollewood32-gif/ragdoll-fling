// Tests for the leaderboard client: initials helpers and API calls
// (with a pretend fetch, so no real network is used). Run with: npm test

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScoreStorage } from "./bestScore";
import {
  fetchLeaderboard,
  isValidInitials,
  loadInitials,
  normalizeInitials,
  saveInitials,
  submitScore,
} from "./leaderboard";

function memory(): ScoreStorage {
  const data: Record<string, string> = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("initials", () => {
  it("capitalizes, strips non-letters and keeps 3", () => {
    expect(normalizeInitials("jd")).toBe("JD");
    expect(normalizeInitials("j.d-x!")).toBe("JDX");
    expect(normalizeInitials("abcdef")).toBe("ABC");
    expect(normalizeInitials("12 3")).toBe("");
  });

  it("only accepts exactly 3 letters", () => {
    expect(isValidInitials("JDX")).toBe(true);
    expect(isValidInitials("JD")).toBe(false);
    expect(isValidInitials("jdx")).toBe(false);
  });

  it("remembers the last initials", () => {
    const storage = memory();
    expect(loadInitials(storage)).toBe("");
    saveInitials(storage, "JDX");
    expect(loadInitials(storage)).toBe("JDX");
  });
});

/** A pretend fetch that always answers with this status and JSON body. */
function reply(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("API calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the top scores", async () => {
    vi.stubGlobal("fetch", reply(200, { scores: [{ initials: "JDX", score: 60278, created_at: "x" }] }));
    expect(await fetchLeaderboard()).toEqual([{ initials: "JDX", score: 60278, created_at: "x" }]);
  });

  it("throws when the leaderboard is unavailable", async () => {
    vi.stubGlobal("fetch", reply(404, { error: "Not found" }));
    await expect(fetchLeaderboard()).rejects.toThrow("unavailable");
  });

  it("sends a score as JSON and returns the rank", async () => {
    const fetchMock = reply(201, { ok: true, rank: 4 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await submitScore("JDX", 51234)).toEqual({ ok: true, rank: 4 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/scores");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ initials: "JDX", score: 51234 });
  });

  it("passes on the server's reason when a score is rejected", async () => {
    vi.stubGlobal("fetch", reply(429, { error: "Too many submissions. Try again in a minute." }));
    expect(await submitScore("JDX", 10)).toEqual({ ok: false, error: "Too many submissions. Try again in a minute." });
  });

  it("explains a network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await submitScore("JDX", 10);
    expect(result.ok).toBe(false);
  });
});
