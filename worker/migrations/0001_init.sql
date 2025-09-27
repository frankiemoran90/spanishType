-- Migration: initialize SpanishType schema (sentences + leaderboard)
-- Apply with `npx wrangler d1 migrations apply spanish_type`.

CREATE TABLE IF NOT EXISTS sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tatoeba_id INTEGER,
  spanish TEXT NOT NULL,
  english TEXT NOT NULL,
  source TEXT,
  difficulty TEXT,
  UNIQUE(tatoeba_id)
);

CREATE INDEX IF NOT EXISTS idx_sentences_difficulty ON sentences(difficulty);

CREATE TABLE IF NOT EXISTS leaderboard (
  player_name TEXT PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score, updated_at);
