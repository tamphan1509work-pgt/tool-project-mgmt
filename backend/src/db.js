import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meetings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  meeting_date  TEXT NOT NULL,
  start_time    TEXT,
  location      TEXT,
  facilitator   TEXT,
  attendees     TEXT,
  agenda        TEXT,
  notes         TEXT,
  decisions     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'todo',
  priority       TEXT NOT NULL DEFAULT 'medium',
  assignee       TEXT,
  start_date     TEXT,
  due_date       TEXT,
  estimate_hours REAL,
  meeting_id     INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
  completed_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_meeting ON tasks(meeting_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS test_cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  module          TEXT,
  type            TEXT NOT NULL DEFAULT 'functional',
  priority        TEXT NOT NULL DEFAULT 'medium',
  status          TEXT NOT NULL DEFAULT 'not_run',
  preconditions   TEXT,
  steps           TEXT,
  expected_result TEXT,
  task_id         INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  last_run_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_test_cases_task ON test_cases(task_id);

CREATE TABLE IF NOT EXISTS test_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  test_case_id  INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  result        TEXT NOT NULL,
  note          TEXT,
  executed_by   TEXT,
  executed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_test_runs_case ON test_runs(test_case_id);

CREATE TABLE IF NOT EXISTS bugs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  title              TEXT NOT NULL,
  description        TEXT,
  steps_to_reproduce TEXT,
  expected_result    TEXT,
  actual_result      TEXT,
  environment        TEXT,
  severity           TEXT NOT NULL DEFAULT 'major',
  priority           TEXT NOT NULL DEFAULT 'medium',
  status             TEXT NOT NULL DEFAULT 'new',
  assignee           TEXT,
  reporter           TEXT,
  test_case_id       INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
  task_id            INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  resolved_at        TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
CREATE INDEX IF NOT EXISTS idx_bugs_test_case ON bugs(test_case_id);
CREATE INDEX IF NOT EXISTS idx_bugs_task ON bugs(task_id);
`;

/**
 * Mở (hoặc tạo) database SQLite và đảm bảo schema tồn tại.
 * @param {string} file đường dẫn file DB, hoặc ':memory:'
 */
export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Chạy fn trong một transaction. */
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
