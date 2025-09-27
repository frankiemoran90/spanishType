-- Migration: create leaderboard table for persistent high scores
-- Apply with `npx wrangler d1 migrations apply spanish_type` after deployment.

CREATE TABLE IF NOT EXISTS leaderboard (
  player_name TEXT PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score, updated_at);
