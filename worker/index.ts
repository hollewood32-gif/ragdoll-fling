// The server side of Ragdoll Fling: a tiny API on the same Worker that serves
// the game. Only requests to /api/* reach this code (see run_worker_first in
// wrangler.jsonc); everything else is served straight from the static files.

export interface Env {
  DB: D1Database; // the leaderboard database (staging or production)
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

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

/** GET /api/leaderboard: the top 10 scores, highest first (ties: earliest first). */
async function getLeaderboard(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT initials, score, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT ?",
  )
    .bind(TOP_N)
    .all<LeaderboardRow>();

  // Let browsers and Cloudflare reuse the answer for a few seconds.
  return json({ scores: results }, 200, { "Cache-Control": "public, max-age=10" });
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
