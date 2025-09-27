-- Migration: create sentences table for SpanishType
-- Run with `wrangler d1 migrations apply SpanishType` once configured.

CREATE TABLE sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tatoeba_id INTEGER,
  spanish TEXT NOT NULL,
  english TEXT NOT NULL,
  source TEXT,
  difficulty TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tatoeba_id)
);

CREATE INDEX idx_sentences_difficulty ON sentences(difficulty);
CREATE INDEX idx_sentences_created_at ON sentences(created_at);
