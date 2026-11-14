// The server side of Ragdoll Fling: a tiny API on the same Worker that serves
// the game. Only requests to /api/* reach this code (see run_worker_first in
// wrangler.jsonc); everything else is served straight from the static files.

import { MAX_BODY_BYTES, validateSubmission } from "./validate";

export interface Env {
  DB: D1Database; // the leaderboard database (staging or production)
  SUBMIT_LIMITER: RateLimit; // caps score submissions per visitor
}

export interface LeaderboardRow {
  initials: string;
  score: number;
  created_at: string;
}

const TOP_N = 10;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      return getLeaderboard(env);
    }
    if (url.pathname === "/api/scores" && request.method === "POST") {
      return submitScore(request, env);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

/**
 * Each player's single best score. Players are told apart by initials, so
 * this keeps one row per initials: the highest score (earliest if tied).
 * Every submission is still stored; only what the board shows is filtered.
 */
const BEST_PER_PLAYER = `
  SELECT initials, score, created_at FROM (
    SELECT initials, score, created_at,
      ROW_NUMBER() OVER (PARTITION BY initials ORDER BY score DESC, created_at ASC) AS nth
    FROM scores
  )
  WHERE nth = 1`;

/** GET /api/leaderboard: the top 10 players' best scores, highest first (ties: earliest first). */
async function getLeaderboard(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `${BEST_PER_PLAYER} ORDER BY score DESC, created_at ASC LIMIT ?`,
  )
    .bind(TOP_N)
    .all<LeaderboardRow>();

  // Let browsers and Cloudflare reuse the answer for a few seconds.
  return json({ scores: results }, 200, { "Cache-Control": "public, max-age=10" });
}

/** POST /api/scores with {"initials":"ABC","score":12345}: saves a score and returns its rank. */
async function submitScore(request: Request, env: Env): Promise<Response> {
  // 1. Only JSON, and only small bodies.
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return json({ error: "Send JSON." }, 415);
  }
  const declaredSize = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredSize > MAX_BODY_BYTES) {
    return json({ error: "Request too large." }, 413); // refuse before reading it
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return json({ error: "Request too large." }, 413);
  }

  // 2. Rate limit per visitor. The IP address is only used as a counter key
  //    here; it is never stored in the database.
  const visitor = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.SUBMIT_LIMITER.limit({ key: visitor });
  if (!success) {
    return json({ error: "Too many submissions. Try again in a minute." }, 429);
  }

  // 3. Check the contents.
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Body is not valid JSON." }, 400);
  }
  const result = validateSubmission(body);
  if (!result.ok) {
    return json({ error: result.error }, 400);
  }
  const { initials, score } = result.submission;

  // 4. Save it. The ? placeholders keep user input out of the SQL itself,
  //    which prevents SQL injection.
  await env.DB.prepare("INSERT INTO scores (initials, score) VALUES (?, ?)").bind(initials, score).run();

  // 5. Rank = 1 + how many other players have a best that beats this player's
  //    best. (Their best may be an older score if this one wasn't their highest.)
  const better = await env.DB.prepare(
    `SELECT COUNT(DISTINCT initials) AS n FROM scores
     WHERE initials != ?1 AND score > (SELECT MAX(score) FROM scores WHERE initials = ?1)`,
  )
    .bind(initials)
    .first<{ n: number }>();
  const rank = (better?.n ?? 0) + 1;

  return json({ ok: true, rank, madeTopTen: rank <= TOP_N }, 201);
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
