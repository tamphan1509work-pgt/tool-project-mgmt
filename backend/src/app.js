import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { transaction } from './db.js';
import { createResource, HttpError, parseId, today, validate } from './resource.js';
import { bugs, ENUMS, meetings, tasks, testCases, testRuns } from './resources.js';

const countBy = (db, table, col) => {
  const rows = db.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM ${table} GROUP BY ${col}`).all();
  return Object.fromEntries(rows.map((r) => [r.k, r.n]));
};

/**
 * Tạo Express app.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ staticDir?: string }} [opts]
 */
export function createApp(db, { staticDir } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.get('/enums', (_req, res) => res.json(ENUMS));

  // ---- Test runs (lịch sử chạy test case) ----
  api.get('/test-cases/:id/runs', (req, res) => {
    const id = parseId(req.params.id);
    res.json(
      db.prepare('SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY executed_at DESC, id DESC').all(id),
    );
  });

  api.post('/test-cases/:id/runs', (req, res) => {
    const id = parseId(req.params.id);
    if (!db.prepare('SELECT 1 FROM test_cases WHERE id = ?').get(id)) {
      throw new HttpError(404, `Không tìm thấy test case #${id}`);
    }
    const data = validate(db, testRuns, req.body);
    const run = transaction(db, () => {
      const info = db
        .prepare('INSERT INTO test_runs (test_case_id, result, note, executed_by) VALUES (?, ?, ?, ?)')
        .run(id, data.result, data.note ?? null, data.executed_by ?? null);
      const row = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(Number(info.lastInsertRowid));
      db.prepare(
        "UPDATE test_cases SET status = ?, last_run_at = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(data.result, row.executed_at, id);
      return row;
    });
    res.status(201).json(run);
  });

  api.delete('/test-runs/:id', (req, res) => {
    const id = parseId(req.params.id);
    const run = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(id);
    if (!run) throw new HttpError(404, `Không tìm thấy lần chạy #${id}`);
    transaction(db, () => {
      db.prepare('DELETE FROM test_runs WHERE id = ?').run(id);
      // Đồng bộ lại trạng thái test case theo lần chạy mới nhất còn lại
      const latest = db
        .prepare('SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY executed_at DESC, id DESC LIMIT 1')
        .get(run.test_case_id);
      db.prepare("UPDATE test_cases SET status = ?, last_run_at = ?, updated_at = datetime('now') WHERE id = ?").run(
        latest?.result ?? 'not_run',
        latest?.executed_at ?? null,
        run.test_case_id,
      );
    });
    res.status(204).end();
  });

  // ---- CRUD ----
  api.use('/meetings', createResource(db, meetings));
  api.use('/tasks', createResource(db, tasks));
  api.use('/test-cases', createResource(db, testCases));
  api.use('/bugs', createResource(db, bugs));

  // ---- Dữ liệu cho dropdown liên kết ----
  api.get('/lookup', (_req, res) => {
    const people = db
      .prepare(
        `SELECT DISTINCT name FROM (
           SELECT assignee AS name FROM tasks UNION
           SELECT assignee FROM bugs UNION
           SELECT reporter FROM bugs UNION
           SELECT facilitator FROM meetings UNION
           SELECT executed_by FROM test_runs
         ) WHERE name IS NOT NULL AND name <> '' ORDER BY name`,
      )
      .all()
      .map((r) => r.name);
    res.json({
      meetings: db.prepare('SELECT id, title, meeting_date FROM meetings ORDER BY meeting_date DESC, id DESC').all(),
      tasks: db.prepare('SELECT id, title, status FROM tasks ORDER BY id DESC').all(),
      testCases: db.prepare('SELECT id, title, status FROM test_cases ORDER BY id DESC').all(),
      modules: db
        .prepare("SELECT DISTINCT module FROM test_cases WHERE module IS NOT NULL AND module <> '' ORDER BY module")
        .all()
        .map((r) => r.module),
      people,
    });
  });

  // ---- Dashboard ----
  api.get('/dashboard', (_req, res) => {
    const d = today();
    const testStatus = countBy(db, 'test_cases', 'status');
    const executed = (testStatus.passed ?? 0) + (testStatus.failed ?? 0) + (testStatus.blocked ?? 0);
    res.json({
      today: d,
      counts: {
        meetings: db.prepare('SELECT COUNT(*) AS n FROM meetings').get().n,
        tasks: db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n,
        testCases: db.prepare('SELECT COUNT(*) AS n FROM test_cases').get().n,
        bugs: db.prepare('SELECT COUNT(*) AS n FROM bugs').get().n,
        openBugs: db.prepare("SELECT COUNT(*) AS n FROM bugs WHERE status IN ('new','in_progress','reopened')").get().n,
        overdueTasks: db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE due_date < ? AND status <> 'done'").get(d).n,
      },
      taskStatus: countBy(db, 'tasks', 'status'),
      testStatus,
      testPassRate: executed ? Math.round(((testStatus.passed ?? 0) / executed) * 1000) / 10 : null,
      bugStatus: countBy(db, 'bugs', 'status'),
      openBugSeverity: Object.fromEntries(
        db
          .prepare(
            "SELECT severity AS k, COUNT(*) AS n FROM bugs WHERE status IN ('new','in_progress','reopened') GROUP BY severity",
          )
          .all()
          .map((r) => [r.k, r.n]),
      ),
      upcomingMeetings: db
        .prepare('SELECT * FROM meetings WHERE meeting_date >= ? ORDER BY meeting_date, start_time LIMIT 5')
        .all(d),
      recentMeetings: db
        .prepare('SELECT * FROM meetings WHERE meeting_date < ? ORDER BY meeting_date DESC, start_time DESC LIMIT 5')
        .all(d),
      overdueTasks: db
        .prepare("SELECT * FROM tasks WHERE due_date < ? AND status <> 'done' ORDER BY due_date LIMIT 8")
        .all(d),
      dueSoonTasks: db
        .prepare(
          "SELECT * FROM tasks WHERE due_date >= ? AND due_date <= date(?, '+7 day') AND status <> 'done' ORDER BY due_date LIMIT 8",
        )
        .all(d, d),
      criticalBugs: db
        .prepare(
          `SELECT * FROM bugs WHERE status IN ('new','in_progress','reopened') AND severity IN ('critical','blocker')
           ORDER BY CASE severity WHEN 'blocker' THEN 0 ELSE 1 END, created_at DESC LIMIT 8`,
        )
        .all(),
    });
  });

  api.use((req, _res) => {
    throw new HttpError(404, `Không tìm thấy API: ${req.method} ${req.originalUrl}`);
  });

  app.use('/api', api);

  // ---- Phục vụ frontend đã build (production) ----
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir));
    app.get('/{*splat}', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }

  // ---- Xử lý lỗi ----
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON không hợp lệ' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn' });
    }
    console.error(err);
    res.status(500).json({ error: 'Lỗi máy chủ' });
  });

  return app;
}
