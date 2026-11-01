import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  start_date   TEXT,
  end_date     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Danh bạ thành viên (dùng chung giữa các dự án)
CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  phone       TEXT,
  position    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Thành viên của từng dự án và vai trò trong dự án
CREATE TABLE IF NOT EXISTS project_members (
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'developer',
  joined_at   TEXT NOT NULL DEFAULT (date('now')),
  PRIMARY KEY (project_id, member_id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
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
  project_id     INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'todo',
  priority       TEXT NOT NULL DEFAULT 'medium',
  assignee       TEXT,
  start_date     TEXT,
  due_date       TEXT,
  estimate_hours REAL,
  meeting_id     INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
  parent_id      INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  completed_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_meeting ON tasks(meeting_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS test_cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER REFERENCES projects(id) ON DELETE CASCADE,
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
  project_id         INTEGER REFERENCES projects(id) ON DELETE CASCADE,
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

-- Tài liệu dự án: thiết kế, tài liệu đặc tả
CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'specification',
  version      TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',
  url          TEXT,
  author       TEXT,
  description  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- File đính kèm (nội dung lưu trong DB): thuộc một biên bản họp HOẶC một lần chạy test
CREATE TABLE IF NOT EXISTS attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id   INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
  test_run_id  INTEGER REFERENCES test_runs(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  mime_type    TEXT NOT NULL DEFAULT 'application/octet-stream',
  size         INTEGER NOT NULL,
  data         BLOB NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((meeting_id IS NULL) <> (test_run_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_attachments_meeting ON attachments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_attachments_test_run ON attachments(test_run_id);

-- Liên kết giữa các task: depends_on (task_id phụ thuộc other_task_id) hoặc relates (liên quan)
CREATE TABLE IF NOT EXISTS task_links (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  other_task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (task_id, other_task_id, type)
);
CREATE INDEX IF NOT EXISTS idx_task_links_other ON task_links(other_task_id);

-- Liên kết nhiều-nhiều giữa task và tài liệu
CREATE TABLE IF NOT EXISTS task_documents (
  task_id      INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_task_documents_doc ON task_documents(document_id);
`;

const SCOPED_TABLES = ['meetings', 'tasks', 'test_cases', 'bugs', 'documents'];

/**
 * Nâng cấp database tạo từ phiên bản cũ (chưa có dự án):
 * thêm cột project_id và gom dữ liệu cũ vào "Dự án mặc định".
 */
function migrate(db) {
  const memberCols = db.prepare('PRAGMA table_info(members)').all().map((c) => c.name);
  if (!memberCols.includes('position')) db.exec('ALTER TABLE members ADD COLUMN position TEXT');
  const taskCols = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
  if (!taskCols.includes('parent_id')) {
    db.exec('ALTER TABLE tasks ADD COLUMN parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id)');

  // Phiên bản trước lưu file biên bản họp ở bảng riêng -> chuyển sang bảng attachments dùng chung
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meeting_attachments'").get()) {
    db.exec(`
      INSERT INTO attachments (meeting_id, name, mime_type, size, data, created_at)
        SELECT meeting_id, name, mime_type, size, data, created_at FROM meeting_attachments ORDER BY id;
      DROP TABLE meeting_attachments;
    `);
  }

  for (const table of SCOPED_TABLES) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes('project_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE`);
    }
  }
  const orphans = SCOPED_TABLES.some(
    (t) => db.prepare(`SELECT 1 FROM ${t} WHERE project_id IS NULL LIMIT 1`).get() !== undefined,
  );
  if (orphans) {
    let project = db.prepare("SELECT id FROM projects WHERE code = 'DEFAULT'").get();
    if (!project) {
      const info = db
        .prepare("INSERT INTO projects (code, name, description) VALUES ('DEFAULT', 'Dự án mặc định', ?)")
        .run('Dữ liệu từ phiên bản trước khi có quản lý theo dự án');
      project = { id: Number(info.lastInsertRowid) };
    }
    for (const t of SCOPED_TABLES) db.prepare(`UPDATE ${t} SET project_id = ? WHERE project_id IS NULL`).run(project.id);
  }
  for (const t of SCOPED_TABLES) db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_project ON ${t}(project_id)`);
}

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
  migrate(db);
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
