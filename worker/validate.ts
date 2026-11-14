// Rules for a leaderboard submission. Kept apart from the server plumbing so
// every rule can be unit tested.

/** A Pure round (no upgrades) can't realistically score more than this.
 *  The best human Pure rounds so far are around 60,000; this is ~5x that. */
export const MAX_SCORE = 300_000;

/** Biggest request body we'll read, in bytes. A real submission is ~40. */
export const MAX_BODY_BYTES = 1024;

export interface Submission {
  initials: string;
  score: number;
}

export type ValidationResult = { ok: true; submission: Submission } | { ok: false; error: string };

/** Checks a parsed JSON body. Returns the clean submission or the reason it was rejected. */
export function validateSubmission(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const { initials, score } = body as Record<string, unknown>;

  if (typeof initials !== "string" || !/^[A-Z]{3}$/.test(initials)) {
    return { ok: false, error: "Initials must be exactly 3 capital letters A to Z." };
  }
  if (typeof score !== "number" || !Number.isInteger(score)) {
    return { ok: false, error: "Score must be a whole number." };
  }
  if (score < 1 || score > MAX_SCORE) {
    return { ok: false, error: `Score must be between 1 and ${MAX_SCORE.toLocaleString("en-US")}.` };
  }
  return { ok: true, submission: { initials, score } };
}
