import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { transaction } from './db.js';
import { createResource, HttpError, parseId, today, validate } from './resource.js';
import {
  ASSIGNED,
  bugs,
  documents,
  ENUMS,
  meetings,
  members,
  projectMember,
  projectMembers,
  projects,
  taskLinks,
  tasks,
  testCases,
  testRuns,
} from './resources.js';

const DEFAULT_MAX_UPLOAD = 10 * 1024 * 1024; // 10 MB / file

/** base64 -> bytes (chạy được cả trên Node lẫn trình duyệt của bản demo) */
function decodeBase64(b64) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const fmtMB = (bytes) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

const countBy = (db, table, col, projectId) => {
  const rows = db
    .prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM ${table} WHERE project_id = ? GROUP BY ${col}`)
    .all(projectId);
  return Object.fromEntries(rows.map((r) => [r.k, r.n]));
};

/** Lấy project_id bắt buộc từ query (?project_id=) */
const requireProject = (db, query) => {
  const id = Number(query.project_id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Thiếu tham số project_id');
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) throw new HttpError(404, `Không tìm thấy dự án #${id}`);
  return project;
};

/**
 * Tạo Express app.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ staticDir?: string }} [opts]
 */
export function createApp(db, { staticDir, maxUploadBytes = DEFAULT_MAX_UPLOAD } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // File đính kèm gửi dạng base64 trong JSON (lớn hơn file gốc ~33%)
  app.use(express.json({ limit: Math.ceil(maxUploadBytes * 1.4) + 64 * 1024 }));

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.get('/enums', (_req, res) => res.json(ENUMS));
  api.get('/config', (_req, res) => res.json({ maxUploadBytes }));

  // ---- File đính kèm biên bản họp ----
  api.post('/meetings/:id/attachments', (req, res) => {
    const meetingId = parseId(req.params.id);
    if (!db.prepare('SELECT 1 FROM meetings WHERE id = ?').get(meetingId)) {
      throw new HttpError(404, `Không tìm thấy cuộc họp #${meetingId}`);
    }
    const body = req.body ?? {};
    const name = typeof body.name === 'string' ? body.name.replace(/[\\/\u0000-\u001f]/g, '_').trim() : '';
    if (!name || name.length > 255) throw new HttpError(400, 'Dữ liệu không hợp lệ', { name: 'Tên file không hợp lệ' });
    const mime =
      typeof body.mime_type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(body.mime_type)
        ? body.mime_type
        : 'application/octet-stream';
    const data = decodeBase64(body.data);
    if (!data || data.length === 0) throw new HttpError(400, 'Dữ liệu không hợp lệ', { data: 'File rỗng hoặc lỗi' });
    if (data.length > maxUploadBytes) {
      throw new HttpError(400, 'Dữ liệu không hợp lệ', { data: `File vượt quá ${fmtMB(maxUploadBytes)}` });
    }
    const info = db
      .prepare('INSERT INTO meeting_attachments (meeting_id, name, mime_type, size, data) VALUES (?, ?, ?, ?, ?)')
      .run(meetingId, name, mime, data.length, data);
    res
      .status(201)
      .json(
        db
          .prepare('SELECT id, meeting_id, name, mime_type, size, created_at FROM meeting_attachments WHERE id = ?')
          .get(Number(info.lastInsertRowid)),
      );
  });

  api.get('/attachments/:id/download', (req, res) => {
    const id = parseId(req.params.id);
    const file = db.prepare('SELECT * FROM meeting_attachments WHERE id = ?').get(id);
    if (!file) throw new HttpError(404, `Không tìm thấy file #${id}`);
    // Chỉ cho xem trực tiếp ảnh (không gồm SVG) để tránh chạy nội dung do người dùng tải lên
    const inline = req.query.inline === '1' && /^image\/(png|jpe?g|gif|webp|bmp)$/.test(file.mime_type);
    const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    res.status(200);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.end(file.data);
  });

  api.delete('/attachments/:id', (req, res) => {
    const info = db.prepare('DELETE FROM meeting_attachments WHERE id = ?').run(parseId(req.params.id));
    if (!info.changes) throw new HttpError(404, 'Không tìm thấy file');
    res.status(204).end();
  });

  // ---- Liên kết task: phụ thuộc / đang chặn / liên quan ----
  api.post('/tasks/:id/links', (req, res) => {
    const taskId = parseId(req.params.id);
    const task = db.prepare('SELECT id, project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) throw new HttpError(404, `Không tìm thấy task #${taskId}`);
    const data = validate(
      db,
      {
        other_task_id: { type: 'ref', table: 'tasks', required: true },
        type: { type: 'enum', values: ENUMS.taskLinkType, required: true },
      },
      req.body,
    );
    const bad = (msg) => new HttpError(400, 'Dữ liệu không hợp lệ', { other_task_id: msg });
    const other = db.prepare('SELECT id, project_id FROM tasks WHERE id = ?').get(data.other_task_id);
    if (other.id === taskId) throw bad('Không thể liên kết task với chính nó');
    if (other.project_id !== task.project_id) throw bad('Task được chọn thuộc dự án khác');

    // "A chặn B" được lưu thành "B phụ thuộc vào A"
    const [from, to, type] =
      data.type === 'blocks' ? [other.id, taskId, 'depends_on'] : [taskId, other.id, data.type];

    const exists =
      type === 'relates'
        ? db
            .prepare(
              `SELECT 1 FROM task_links WHERE type = 'relates'
               AND ((task_id = ? AND other_task_id = ?) OR (task_id = ? AND other_task_id = ?))`,
            )
            .get(from, to, to, from)
        : db
            .prepare("SELECT 1 FROM task_links WHERE type = 'depends_on' AND task_id = ? AND other_task_id = ?")
            .get(from, to);
    if (exists) throw bad('Hai task này đã được liên kết như vậy');

    if (type === 'depends_on') {
      // Chặn phụ thuộc vòng tròn: nếu "to" (trực tiếp hoặc gián tiếp) đã phụ thuộc vào "from"
      const next = db.prepare("SELECT other_task_id AS id FROM task_links WHERE type = 'depends_on' AND task_id = ?");
      const seen = new Set();
      const stack = [to];
      while (stack.length) {
        const cur = stack.pop();
        if (cur === from) throw bad('Không thể tạo phụ thuộc vòng tròn giữa các task');
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const r of next.all(cur)) stack.push(r.id);
      }
    }

    db.prepare('INSERT INTO task_links (task_id, other_task_id, type) VALUES (?, ?, ?)').run(from, to, type);
    res.status(201).json(taskLinks(db, taskId));
  });

  api.delete('/task-links/:id', (req, res) => {
    const info = db.prepare('DELETE FROM task_links WHERE id = ?').run(parseId(req.params.id));
    if (!info.changes) throw new HttpError(404, 'Không tìm thấy liên kết');
    res.status(204).end();
  });

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

  // ---- Thành viên trong dự án ----
  const mustProject = (raw) => {
    const id = parseId(raw);
    if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id)) {
      throw new HttpError(404, `Không tìm thấy dự án #${id}`);
    }
    return id;
  };

  api.get('/projects/:id/members', (req, res) => {
    res.json(projectMembers(db, mustProject(req.params.id)));
  });

  // Thêm thành viên: chọn người có sẵn (member_id) hoặc tạo người mới (name, email)
  api.post('/projects/:id/members', (req, res) => {
    const projectId = mustProject(req.params.id);
    const data = validate(db, projectMember, req.body);
    let memberId = data.member_id;
    transaction(db, () => {
      if (!memberId) {
        if (!data.name) throw new HttpError(400, 'Dữ liệu không hợp lệ', { name: 'Nhập tên hoặc chọn người có sẵn' });
        const byEmail = data.email && db.prepare('SELECT id FROM members WHERE email = ?').get(data.email);
        memberId = byEmail
          ? byEmail.id
          : Number(
              db.prepare('INSERT INTO members (name, email) VALUES (?, ?)').run(data.name, data.email ?? null)
                .lastInsertRowid,
            );
      }
      if (db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND member_id = ?').get(projectId, memberId)) {
        throw new HttpError(400, 'Dữ liệu không hợp lệ', { member_id: 'Người này đã là thành viên của dự án' });
      }
      db.prepare('INSERT INTO project_members (project_id, member_id, role) VALUES (?, ?, ?)').run(
        projectId,
        memberId,
        data.role ?? 'developer',
      );
    });
    res.status(201).json(projectMembers(db, projectId).find((m) => m.id === memberId));
  });

  api.patch('/projects/:id/members/:memberId', (req, res) => {
    const projectId = mustProject(req.params.id);
    const memberId = parseId(req.params.memberId);
    const data = validate(db, { role: { type: 'enum', values: ENUMS.memberRole, required: true } }, req.body);
    const info = db
      .prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND member_id = ?')
      .run(data.role, projectId, memberId);
    if (!info.changes) throw new HttpError(404, 'Người này không thuộc dự án');
    res.json(projectMembers(db, projectId).find((m) => m.id === memberId));
  });

  api.delete('/projects/:id/members/:memberId', (req, res) => {
    const projectId = mustProject(req.params.id);
    const info = db
      .prepare('DELETE FROM project_members WHERE project_id = ? AND member_id = ?')
      .run(projectId, parseId(req.params.memberId));
    if (!info.changes) throw new HttpError(404, 'Người này không thuộc dự án');
    res.status(204).end();
  });

  // ---- Biểu đồ Gantt: mỗi thành viên tham gia dự án nào, đang làm task nào ----
  api.get('/gantt', (req, res) => {
    const projectId = req.query.project_id ? requireProject(db, req.query).id : null;
    const memberId = req.query.member_id ? parseId(req.query.member_id) : null;
    const includeDone = req.query.include_done === 'true';

    let people;
    if (memberId) {
      people = db.prepare('SELECT * FROM members WHERE id = ?').all(memberId);
      if (!people.length) throw new HttpError(404, `Không tìm thấy thành viên #${memberId}`);
    } else if (projectId) {
      people = db
        .prepare(
          `SELECT m.* FROM members m JOIN project_members pm ON pm.member_id = m.id
           WHERE pm.project_id = ? ORDER BY m.name`,
        )
        .all(projectId);
    } else {
      people = db.prepare('SELECT * FROM members ORDER BY name').all();
    }

    const projectCols = 'p.id, p.code, p.name, p.status, p.start_date, p.end_date';
    const memberProjects = db.prepare(
      `SELECT ${projectCols}, pm.role, pm.joined_at FROM project_members pm JOIN projects p ON p.id = pm.project_id
       WHERE pm.member_id = ? ${projectId ? 'AND p.id = ?' : ''} ORDER BY COALESCE(p.start_date, ''), p.name`,
    );
    const memberTasks = db.prepare(
      `SELECT t.id, t.title, t.status, t.priority, t.start_date, t.due_date, t.completed_at, t.created_at, t.project_id
       FROM tasks t WHERE ${ASSIGNED('t.assignee', '?')}
       ${projectId ? 'AND t.project_id = ?' : ''} ${includeDone ? '' : "AND t.status <> 'done'"}
       ORDER BY COALESCE(t.start_date, t.due_date, substr(t.created_at, 1, 10)), t.id`,
    );
    const projectById = db.prepare(`SELECT ${projectCols} FROM projects p WHERE p.id = ?`);

    const members = people.map((m) => {
      const projects = memberProjects.all(...(projectId ? [m.id, projectId] : [m.id]));
      const tasks = memberTasks.all(...(projectId ? [m.name, projectId] : [m.name]));
      // Task được giao ở dự án mà người này chưa là thành viên: vẫn hiển thị dự án (không có vai trò)
      for (const pid of new Set(tasks.map((t) => t.project_id))) {
        if (!projects.some((p) => p.id === pid)) projects.push({ ...projectById.get(pid), role: null });
      }
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        position: m.position,
        projects: projects.map((p) => ({ ...p, tasks: tasks.filter((t) => t.project_id === p.id) })),
      };
    });
    res.json({ today: today(), members });
  });

  // ---- Báo cáo test (test report) của dự án ----
  api.get('/test-report', (req, res) => {
    const project = requireProject(db, req.query);
    const statusCase = `
      COUNT(*) AS total,
      SUM(status = 'passed') AS passed,
      SUM(status = 'failed') AS failed,
      SUM(status = 'blocked') AS blocked,
      SUM(status = 'not_run') AS not_run`;
    const summary = db.prepare(`SELECT ${statusCase} FROM test_cases WHERE project_id = ?`).get(project.id);
    const byModule = db
      .prepare(
        `SELECT COALESCE(NULLIF(module, ''), '(Chưa phân loại)') AS module, ${statusCase}
         FROM test_cases WHERE project_id = ? GROUP BY 1 ORDER BY 1`,
      )
      .all(project.id);
    const rate = (r) => {
      const executed = (r.passed ?? 0) + (r.failed ?? 0) + (r.blocked ?? 0);
      return {
        ...r,
        passed: r.passed ?? 0,
        failed: r.failed ?? 0,
        blocked: r.blocked ?? 0,
        not_run: r.not_run ?? 0,
        executed,
        pass_rate: executed ? Math.round(((r.passed ?? 0) / executed) * 1000) / 10 : null,
        progress: r.total ? Math.round((executed / r.total) * 1000) / 10 : null,
      };
    };
    const lastRun = db
      .prepare(
        `SELECT MAX(r.executed_at) AS at FROM test_runs r JOIN test_cases t ON t.id = r.test_case_id
         WHERE t.project_id = ?`,
      )
      .get(project.id).at;
    const openBugsFromTests = db
      .prepare(
        `SELECT COUNT(*) AS n FROM bugs WHERE project_id = ? AND test_case_id IS NOT NULL
         AND status IN ('new','in_progress','reopened')`,
      )
      .get(project.id).n;
    res.json({ summary: rate(summary), byModule: byModule.map(rate), lastRun, openBugsFromTests });
  });

  // ---- CRUD ----
  api.use('/projects', createResource(db, projects));
  api.use('/members', createResource(db, members));
  api.use('/documents', createResource(db, documents));
  api.use('/meetings', createResource(db, meetings));
  api.use('/tasks', createResource(db, tasks));
  api.use('/test-cases', createResource(db, testCases));
  api.use('/bugs', createResource(db, bugs));

  // ---- Dữ liệu cho dropdown liên kết (theo dự án) ----
  api.get('/lookup', (req, res) => {
    const allProjects = db.prepare('SELECT id, code, name, status FROM projects ORDER BY name').all();
    const allMembers = db.prepare('SELECT id, name, email FROM members ORDER BY name').all();
    if (!req.query.project_id) {
      return res.json({
        projects: allProjects,
        allMembers,
        members: [],
        meetings: [],
        tasks: [],
        testCases: [],
        documents: [],
        people: [],
        modules: [],
      });
    }
    const { id } = requireProject(db, req.query);
    const people = db
      .prepare(
        `SELECT DISTINCT name FROM (
           SELECT m.name AS name FROM project_members pm JOIN members m ON m.id = pm.member_id WHERE pm.project_id = ? UNION
           SELECT assignee FROM tasks WHERE project_id = ? UNION
           SELECT assignee FROM bugs WHERE project_id = ? UNION
           SELECT reporter FROM bugs WHERE project_id = ? UNION
           SELECT facilitator FROM meetings WHERE project_id = ? UNION
           SELECT author FROM documents WHERE project_id = ?
         ) WHERE name IS NOT NULL AND name <> '' ORDER BY name`,
      )
      .all(id, id, id, id, id, id)
      .map((r) => r.name);
    res.json({
      projects: allProjects,
      allMembers,
      members: projectMembers(db, id),
      meetings: db
        .prepare('SELECT id, title, meeting_date FROM meetings WHERE project_id = ? ORDER BY meeting_date DESC, id DESC')
        .all(id),
      tasks: db
        .prepare('SELECT id, title, status, parent_id FROM tasks WHERE project_id = ? ORDER BY id DESC')
        .all(id),
      testCases: db.prepare('SELECT id, title, status FROM test_cases WHERE project_id = ? ORDER BY id DESC').all(id),
      documents: db
        .prepare('SELECT id, title, type, version, status FROM documents WHERE project_id = ? ORDER BY type, title')
        .all(id),
      modules: db
        .prepare(
          "SELECT DISTINCT module FROM test_cases WHERE project_id = ? AND module IS NOT NULL AND module <> '' ORDER BY module",
        )
        .all(id)
        .map((r) => r.module),
      people,
    });
  });

  // ---- Dashboard (theo dự án) ----
  api.get('/dashboard', (req, res) => {
    const project = requireProject(db, req.query);
    const p = project.id;
    const d = today();
    const n = (sql, ...args) => db.prepare(sql).get(p, ...args).n;
    const testStatus = countBy(db, 'test_cases', 'status', p);
    const executed = (testStatus.passed ?? 0) + (testStatus.failed ?? 0) + (testStatus.blocked ?? 0);
    const OPEN = "status IN ('new','in_progress','reopened')";
    res.json({
      today: d,
      project,
      counts: {
        meetings: n('SELECT COUNT(*) AS n FROM meetings WHERE project_id = ?'),
        tasks: n('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?'),
        testCases: n('SELECT COUNT(*) AS n FROM test_cases WHERE project_id = ?'),
        bugs: n('SELECT COUNT(*) AS n FROM bugs WHERE project_id = ?'),
        documents: n('SELECT COUNT(*) AS n FROM documents WHERE project_id = ?'),
        members: n('SELECT COUNT(*) AS n FROM project_members WHERE project_id = ?'),
        openBugs: n(`SELECT COUNT(*) AS n FROM bugs WHERE project_id = ? AND ${OPEN}`),
        overdueTasks: n("SELECT COUNT(*) AS n FROM tasks WHERE project_id = ? AND due_date < ? AND status <> 'done'", d),
      },
      taskStatus: countBy(db, 'tasks', 'status', p),
      testStatus,
      testPassRate: executed ? Math.round(((testStatus.passed ?? 0) / executed) * 1000) / 10 : null,
      bugStatus: countBy(db, 'bugs', 'status', p),
      openBugSeverity: Object.fromEntries(
        db
          .prepare(`SELECT severity AS k, COUNT(*) AS n FROM bugs WHERE project_id = ? AND ${OPEN} GROUP BY severity`)
          .all(p)
          .map((r) => [r.k, r.n]),
      ),
      upcomingMeetings: db
        .prepare(
          'SELECT * FROM meetings WHERE project_id = ? AND meeting_date >= ? ORDER BY meeting_date, start_time LIMIT 5',
        )
        .all(p, d),
      recentMeetings: db
        .prepare(
          'SELECT * FROM meetings WHERE project_id = ? AND meeting_date < ? ORDER BY meeting_date DESC, start_time DESC LIMIT 5',
        )
        .all(p, d),
      overdueTasks: db
        .prepare(
          "SELECT * FROM tasks WHERE project_id = ? AND due_date < ? AND status <> 'done' ORDER BY due_date LIMIT 8",
        )
        .all(p, d),
      dueSoonTasks: db
        .prepare(
          `SELECT * FROM tasks WHERE project_id = ? AND due_date >= ? AND due_date <= date(?, '+7 day')
           AND status <> 'done' ORDER BY due_date LIMIT 8`,
        )
        .all(p, d, d),
      criticalBugs: db
        .prepare(
          `SELECT * FROM bugs WHERE project_id = ? AND ${OPEN} AND severity IN ('critical','blocker')
           ORDER BY CASE severity WHEN 'blocker' THEN 0 ELSE 1 END, created_at DESC LIMIT 8`,
        )
        .all(p),
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
