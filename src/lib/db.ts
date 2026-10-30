// Server-only: better-sqlite3 is a native Node module. Import this from route handlers,
// server components and scripts, never from client components.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

export const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "quiz.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS questions (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL CHECK (category IN ('history', 'science', 'geography', 'general')),
  difficulty   INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  question     TEXT NOT NULL,
  choices      TEXT NOT NULL CHECK (json_valid(choices) AND json_array_length(choices) = 4),
  answer_index INTEGER NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
  explanation  TEXT NOT NULL,
  hint         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired'))
);
CREATE INDEX IF NOT EXISTS idx_questions_category_status ON questions (category, status);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  nickname      TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('history', 'science', 'geography', 'general', 'random')),
  -- NULL for games from before modes existed. They were scored differently, so no board shows them.
  mode          TEXT CHECK (mode IN ('challenge', 'category', 'speed')),
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  total_score   INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0
);
-- Leaderboard = finished sessions of one mode (and one category in category mode),
-- ordered by score, then correct count, then earlier finish.
DROP INDEX IF EXISTS idx_sessions_leaderboard;
DROP INDEX IF EXISTS idx_sessions_board_all;
DROP INDEX IF EXISTS idx_sessions_board_category;
CREATE INDEX IF NOT EXISTS idx_sessions_board
  ON sessions (mode, category, total_score DESC, correct_count DESC, finished_at) WHERE finished_at IS NOT NULL;

-- Which questions a session was dealt, in what order, and how their choices were shuffled.
-- choice_order[shownIndex] = index into questions.choices.
-- revealed_at (epoch ms) is set when the question is sent to the client; the server times answers from it.
-- hint_used_at (epoch ms) is set when the player asks for the hint, which forfeits the no-hint bonus.
CREATE TABLE IF NOT EXISTS session_questions (
  session_id   TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL REFERENCES questions (id),
  position     INTEGER NOT NULL,
  choice_order TEXT NOT NULL,
  revealed_at  INTEGER,
  hint_used_at INTEGER,
  PRIMARY KEY (session_id, question_id),
  UNIQUE (session_id, position)
);

-- selected_index is an index into questions.choices (unshuffled); NULL means timed out.
CREATE TABLE IF NOT EXISTS answers (
  session_id     TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  question_id    TEXT NOT NULL REFERENCES questions (id),
  selected_index INTEGER CHECK (selected_index BETWEEN 0 AND 3),
  is_correct     INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  time_spent_ms  INTEGER NOT NULL,
  score          INTEGER NOT NULL,
  answered_at    TEXT NOT NULL,
  PRIMARY KEY (session_id, question_id)
);
`;

export function openDb(file: string = process.env.QUIZ_DB_PATH ?? DEFAULT_DB_PATH): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  db.exec(SCHEMA);
  return db;
}

/** Brings a database created by an earlier stage up to the current schema before SCHEMA runs. */
function migrate(db: DB) {
  const addColumn = (table: string, column: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.length > 0 && !columns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  addColumn("session_questions", "revealed_at", "INTEGER");
  addColumn("session_questions", "hint_used_at", "INTEGER");
  addColumn("questions", "hint", "TEXT NOT NULL DEFAULT ''");
  addColumn("sessions", "mode", "TEXT CHECK (mode IN ('challenge', 'category', 'speed'))");
}

// Cached on globalThis so Next.js dev-mode hot reloads reuse one connection.
const globalForDb = globalThis as unknown as { quizDb?: DB };

export function getDb(): DB {
  globalForDb.quizDb ??= openDb();
  return globalForDb.quizDb;
}
