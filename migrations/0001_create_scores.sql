-- Migration 0001: the leaderboard table.
-- Migrations run in number order, once each, and Cloudflare records which
-- ones have been applied. Never edit a migration that has already run;
-- add a new numbered file instead.

CREATE TABLE scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  initials   TEXT    NOT NULL CHECK (length(initials) = 3),
  score      INTEGER NOT NULL CHECK (score > 0),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Makes "top 10 by score" fast even with many rows.
CREATE INDEX idx_scores_score ON scores (score DESC);
