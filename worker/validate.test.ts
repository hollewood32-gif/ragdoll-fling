// Tests for leaderboard submission rules. Run with: npm test

import { describe, expect, it } from "vitest";
import { MAX_SCORE, validateSubmission } from "./validate";

describe("validateSubmission", () => {
  it("accepts a normal submission", () => {
    expect(validateSubmission({ initials: "JDX", score: 60278 })).toEqual({
      ok: true,
      submission: { initials: "JDX", score: 60278 },
    });
  });

  it("ignores extra fields", () => {
    const result = validateSubmission({ initials: "ABC", score: 10, admin: true });
    expect(result).toEqual({ ok: true, submission: { initials: "ABC", score: 10 } });
  });

  it.each([
    ["not an object", "hello"],
    ["null", null],
    ["an array", [1, 2, 3]],
  ])("rejects a body that is %s", (_label, body) => {
    expect(validateSubmission(body).ok).toBe(false);
  });

  it.each([
    ["too short", "AB"],
    ["too long", "ABCD"],
    ["lowercase", "abc"],
    ["digits", "A1C"],
    ["symbols", "A<C"],
    ["accented letters", "ÀBC"],
    ["missing", undefined],
    ["a number", 123],
  ])("rejects initials that are %s", (_label, initials) => {
    expect(validateSubmission({ initials, score: 100 }).ok).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["a fraction", 12.5],
    ["a string", "500"],
    ["too high", MAX_SCORE + 1],
    ["infinite", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
  ])("rejects a score that is %s", (_label, score) => {
    expect(validateSubmission({ initials: "ABC", score }).ok).toBe(false);
  });

  it("accepts the maximum score exactly", () => {
    expect(validateSubmission({ initials: "MAX", score: MAX_SCORE }).ok).toBe(true);
  });
});
