import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { transaction } from './db.js';
import { createResource, HttpError, parseId, splitPeople, today, validate } from './resource.js';
import {
  ASSIGNED,
  INVOLVED,
  bugs,
  categories,
  documents,
  milestones,
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

import {
  assertNotLocked,
  bearer,
  checkPasswordRule,
  clearFailures,
  createSession,
  hashPassword,
  recordFailure,
  userFromToken,
  verifyPassword,
} from './auth.js';
import { actorOf, listHistory, recordHistory, refLabel } from './history.js';
import { deadlineItems, buildEmailDigests, getSettings, runEmailNotifications, saveSettings } from './notify.js';

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

const ROLE = {
  pm: 'PM',
  ba: 'BA',
  tech_lead: 'Trưởng nhóm kỹ thuật',
  developer: 'Lập trình viên',
  tester: 'Tester',
  designer: 'Designer',
  devops: 'DevOps',
  stakeholder: 'Stakeholder',
};

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
/**
 * mailer: { send({ to, subject, text, html }), from } để gửi email nhắc deadline (null = chưa cấu hình SMTP)
 * appUrl: địa chỉ web dùng để tạo link trong email
 */
export function createApp(db, { staticDir, maxUploadBytes = DEFAULT_MAX_UPLOAD, mailer = null, appUrl = '' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // File đính kèm gửi dạng base64 trong JSON (lớn hơn file gốc ~33%)
  app.use(express.json({ limit: Math.ceil(maxUploadBytes * 1.4) + 64 * 1024 }));

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ ok: true }));

  // ================= Đăng nhập / đăng xuất =================
  // Thông tin người dùng gửi về trình duyệt (bỏ hash của token phiên)
  const publicUser = ({ tokenHash, ...user }) => (void tokenHash, user);
  const hasAnyAccount = () => Boolean(db.prepare('SELECT 1 FROM accounts LIMIT 1').get());
  const normEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

  // Chưa có tài khoản nào -> cần tạo tài khoản quản trị đầu tiên
  api.get('/auth/status', (_req, res) => res.json({ needsSetup: !hasAnyAccount() }));

  api.post('/auth/setup', async (req, res) => {
    if (hasAnyAccount()) throw new HttpError(403, 'Hệ thống đã có tài khoản. Hãy đăng nhập.');
    const data = validate(
      db,
      { name: { type: 'string', required: true }, email: { ...members.fields.email, required: true } },
      req.body,
    );
    checkPasswordRule(req.body?.password);
    const email = normEmail(data.email);
    const hash = await hashPassword(req.body.password);
    const memberId = transaction(db, () => {
      const existing = db.prepare('SELECT id FROM members WHERE lower(email) = ?').get(email);
      const id =
        existing?.id ??
        Number(db.prepare('INSERT INTO members (name, email) VALUES (?, ?)').run(data.name, email).lastInsertRowid);
      db.prepare('INSERT INTO accounts (member_id, password_hash, is_admin) VALUES (?, ?, 1)').run(id, hash);
      return id;
    });
    const session = await createSession(db, memberId, { remember: true });
    res.status(201).json({ ...session, user: publicUser(await userFromToken(db, session.token)) });
  });

  api.post('/auth/login', async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || !password) {
      throw new HttpError(400, 'Nhập email và mật khẩu');
    }
    assertNotLocked(email);
    const acc = db
      .prepare(
        `SELECT a.member_id, a.password_hash, a.disabled FROM accounts a JOIN members m ON m.id = a.member_id
         WHERE lower(m.email) = ?`,
      )
      .get(email);
    // Luôn chạy băm mật khẩu để không lộ email nào có tài khoản qua thời gian phản hồi
    const ok = await verifyPassword(password, acc?.password_hash ?? 'pbkdf2$210000$00$00');
    if (!acc || !ok) {
      recordFailure(email);
      throw new HttpError(401, 'Email hoặc mật khẩu không đúng');
    }
    if (acc.disabled) throw new HttpError(403, 'Tài khoản đang ở trạng thái Inactive (đã bị tắt). Liên hệ quản trị viên.');
    clearFailures(email);
    const session = await createSession(db, acc.member_id, { remember: req.body?.remember === true });
    res.json({ ...session, user: publicUser(await userFromToken(db, session.token)) });
  });

  // Mọi API bên dưới yêu cầu đăng nhập
  api.use(async (req, _res, next) => {
    const user = await userFromToken(db, bearer(req));
    if (!user) throw new HttpError(401, 'Bạn cần đăng nhập');
    // Thành viên chỉ làm việc với các dự án mình được thêm vào; quản trị viên có toàn quyền (null)
    user.allowedProjects = user.is_admin
      ? null
      : db.prepare('SELECT project_id FROM project_members WHERE member_id = ?').all(user.id).map((r) => r.project_id);
    req.user = user;
    next();
  });
  const requireAdmin = (req) => {
    if (!req.user?.is_admin) throw new HttpError(403, 'Chỉ quản trị viên mới thực hiện được thao tác này');
  };
  const canAccessProject = (req, projectId) =>
    !req.user.allowedProjects || req.user.allowedProjects.includes(projectId);
  const assertProject = (req, projectId) => {
    if (!canAccessProject(req, projectId)) throw new HttpError(403, 'Bạn không có quyền truy cập dự án này');
  };
  /** Dự án từ ?project_id=, kiểm tra quyền truy cập */
  const projectFor = (req) => {
    const project = requireProject(db, req.query);
    assertProject(req, project.id);
    return project;
  };

  api.get('/auth/me', (req, res) => res.json(publicUser(req.user)));

  api.post('/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.user.tokenHash);
    res.status(204).end();
  });

  // Đổi mật khẩu của chính mình (đăng xuất các phiên khác)
  api.post('/auth/password', async (req, res) => {
    const acc = db.prepare('SELECT password_hash FROM accounts WHERE member_id = ?').get(req.user.id);
    if (!(await verifyPassword(String(req.body?.current_password ?? ''), acc.password_hash))) {
      throw new HttpError(400, 'Dữ liệu không hợp lệ', { current_password: 'Mật khẩu hiện tại không đúng' });
    }
    checkPasswordRule(req.body?.new_password, 'new_password');
    db.prepare('UPDATE accounts SET password_hash = ? WHERE member_id = ?').run(
      await hashPassword(req.body.new_password),
      req.user.id,
    );
    db.prepare('DELETE FROM sessions WHERE member_id = ? AND token_hash <> ?').run(req.user.id, req.user.tokenHash);
    recordHistory(db, { entity: 'members', entityId: req.user.id, action: 'account', summary: 'Đổi mật khẩu', actor: req.user.name });
    res.status(204).end();
  });

  // Quản trị viên: tạo / cập nhật tài khoản đăng nhập của một thành viên
  api.put('/members/:id/account', async (req, res) => {
    requireAdmin(req);
    const memberId = parseId(req.params.id);
    const member = db.prepare('SELECT id, name, email FROM members WHERE id = ?').get(memberId);
    if (!member) throw new HttpError(404, `Không tìm thấy thành viên #${memberId}`);
    const acc = db.prepare('SELECT * FROM accounts WHERE member_id = ?').get(memberId);
    const body = req.body ?? {};
    if (!acc) {
      if (!member.email) {
        throw new HttpError(400, 'Thành viên chưa có email. Hãy thêm email (dùng để đăng nhập) trước.');
      }
      checkPasswordRule(body.password);
    } else if (body.password !== undefined) checkPasswordRule(body.password);
    const isAdmin = body.is_admin === undefined ? (acc?.is_admin ?? 0) : body.is_admin ? 1 : 0;
    const disabled = body.disabled === undefined ? (acc?.disabled ?? 0) : body.disabled ? 1 : 0;
    // Không được tự gỡ quyền quản trị / tự khoá mình, và luôn còn ít nhất một quản trị viên hoạt động
    if (memberId === req.user.id && (!isAdmin || disabled)) {
      throw new HttpError(400, 'Không thể tự gỡ quyền quản trị hoặc tự khoá tài khoản của chính mình');
    }
    const hash = body.password !== undefined ? await hashPassword(body.password) : acc.password_hash;
    const changes = [];
    transaction(db, () => {
      if (acc) {
        db.prepare('UPDATE accounts SET password_hash = ?, is_admin = ?, disabled = ? WHERE member_id = ?').run(
          hash,
          isAdmin,
          disabled,
          memberId,
        );
      } else {
        db.prepare('INSERT INTO accounts (member_id, password_hash, is_admin, disabled) VALUES (?, ?, ?, ?)').run(
          memberId,
          hash,
          isAdmin,
          disabled,
        );
      }
      if (body.password !== undefined || disabled) db.prepare('DELETE FROM sessions WHERE member_id = ?').run(memberId);
      if (!acc) changes.push('Tạo tài khoản đăng nhập');
      if (body.password !== undefined && acc) changes.push('Đổi mật khẩu (bởi quản trị viên)');
      if (acc && isAdmin !== acc.is_admin) changes.push(isAdmin ? 'Cấp quyền quản trị' : 'Gỡ quyền quản trị');
      if (acc && disabled !== acc.disabled) changes.push(disabled ? 'Tắt tài khoản (Inactive)' : 'Bật tài khoản (Active)');
      if (changes.length) {
        recordHistory(db, { entity: 'members', entityId: memberId, action: 'account', summary: changes.join(', '), actor: req.user.name });
      }
    });
    res.json(accountOf(memberId));
  });

  api.delete('/members/:id/account', (req, res) => {
    requireAdmin(req);
    const memberId = parseId(req.params.id);
    if (memberId === req.user.id) throw new HttpError(400, 'Không thể xoá tài khoản đăng nhập của chính mình');
    const info = db.prepare('DELETE FROM accounts WHERE member_id = ?').run(memberId);
    if (!info.changes) throw new HttpError(404, 'Thành viên này chưa có tài khoản');
    db.prepare('DELETE FROM sessions WHERE member_id = ?').run(memberId);
    recordHistory(db, { entity: 'members', entityId: memberId, action: 'account', summary: 'Xoá tài khoản đăng nhập', actor: req.user.name });
    res.status(204).end();
  });

  const accountOf = (memberId) =>
    db
      .prepare('SELECT member_id, is_admin, disabled, last_login_at, created_at FROM accounts WHERE member_id = ?')
      .get(memberId) ?? null;
  api.get('/members/:id/account', (req, res) => {
    const memberId = parseId(req.params.id);
    if (memberId !== req.user.id) requireAdmin(req);
    res.json(accountOf(memberId));
  });
  api.get('/enums', (_req, res) => res.json(ENUMS));
  api.get('/config', (_req, res) => res.json({ maxUploadBytes }));

  // Ghi lịch sử cho các thao tác ngoài CRUD chung
  const projectOf = (table, id) => db.prepare(`SELECT project_id FROM ${table} WHERE id = ?`).get(id)?.project_id ?? null;
  /** Kiểm tra quyền theo dự án của một bản ghi (bản ghi không tồn tại thì để route tự báo 404) */
  const assertRow = (req, table, id) => {
    const pid = projectOf(table, id);
    if (pid !== null) assertProject(req, pid);
  };
  const assertRun = (req, runId) => {
    const r = db.prepare('SELECT test_case_id FROM test_runs WHERE id = ?').get(runId);
    if (r) assertRow(req, 'test_cases', r.test_case_id);
  };
  /** Dự án của một file đính kèm (qua biên bản, tài liệu hoặc lần chạy test) */
  const attachmentProject = (id) =>
    db
      .prepare(
        `SELECT COALESCE(m.project_id, d.project_id, tc.project_id) AS pid FROM attachments a
         LEFT JOIN meetings m ON m.id = a.meeting_id
         LEFT JOIN documents d ON d.id = a.document_id
         LEFT JOIN test_runs r ON r.id = a.test_run_id
         LEFT JOIN test_cases tc ON tc.id = r.test_case_id
         WHERE a.id = ?`,
      )
      .get(id)?.pid ?? null;
  const logAction = (req, entity, entityId, projectId, action, summary, changes) =>
    recordHistory(db, { projectId, entity, entityId, action, summary, changes, actor: actorOf(req) });
  const taskCode = (id) => `TASK-${String(id).padStart(3, '0')}`;

  // ---- File đính kèm: biên bản họp và lần chạy test ----
  const ATTACH_COLS = 'id, meeting_id, test_run_id, document_id, name, mime_type, size, created_at';
  const addAttachment = (ownerCol, ownerId, body = {}) => {
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
      .prepare(`INSERT INTO attachments (${ownerCol}, name, mime_type, size, data) VALUES (?, ?, ?, ?, ?)`)
      .run(ownerId, name, mime, data.length, data);
    return db.prepare(`SELECT ${ATTACH_COLS} FROM attachments WHERE id = ?`).get(Number(info.lastInsertRowid));
  };

  api.post('/meetings/:id/attachments', (req, res) => {
    const meetingId = parseId(req.params.id);
    assertRow(req, 'meetings', meetingId);
    if (!db.prepare('SELECT 1 FROM meetings WHERE id = ?').get(meetingId)) {
      throw new HttpError(404, `Không tìm thấy cuộc họp #${meetingId}`);
    }
    const file = addAttachment('meeting_id', meetingId, req.body);
    logAction(req, 'meetings', meetingId, projectOf('meetings', meetingId), 'attach', `Đính kèm file "${file.name}"`);
    res.status(201).json(file);
  });

  api.post('/documents/:id/attachments', (req, res) => {
    const docId = parseId(req.params.id);
    assertRow(req, 'documents', docId);
    if (!db.prepare('SELECT 1 FROM documents WHERE id = ?').get(docId)) {
      throw new HttpError(404, `Không tìm thấy tài liệu #${docId}`);
    }
    const file = addAttachment('document_id', docId, req.body);
    logAction(req, 'documents', docId, projectOf('documents', docId), 'attach', `Đính kèm file "${file.name}"`);
    db.prepare("UPDATE documents SET updated_at = datetime('now') WHERE id = ?").run(docId);
    res.status(201).json(file);
  });

  api.post('/test-runs/:id/attachments', (req, res) => {
    const runId = parseId(req.params.id);
    assertRun(req, runId);
    const run = db.prepare('SELECT test_case_id FROM test_runs WHERE id = ?').get(runId);
    if (!run) throw new HttpError(404, `Không tìm thấy lần chạy test #${runId}`);
    const file = addAttachment('test_run_id', runId, req.body);
    logAction(
      req,
      'test-cases',
      run.test_case_id,
      projectOf('test_cases', run.test_case_id),
      'attach',
      `Đính kèm file "${file.name}" vào lần chạy #${runId}`,
    );
    res.status(201).json(file);
  });

  api.get('/attachments/:id/download', (req, res) => {
    const id = parseId(req.params.id);
    const file = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
    if (!file) throw new HttpError(404, `Không tìm thấy file #${id}`);
    const pid = attachmentProject(id);
    if (pid !== null) assertProject(req, pid);
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
    const id = parseId(req.params.id);
    const pid = attachmentProject(id);
    if (pid !== null) assertProject(req, pid);
    const file = db
      .prepare(
        `SELECT a.name, a.meeting_id, a.document_id, r.test_case_id FROM attachments a
         LEFT JOIN test_runs r ON r.id = a.test_run_id WHERE a.id = ?`,
      )
      .get(id);
    if (!file) throw new HttpError(404, 'Không tìm thấy file');
    db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    if (file.meeting_id) {
      logAction(req, 'meetings', file.meeting_id, projectOf('meetings', file.meeting_id), 'detach', `Xoá file "${file.name}"`);
    } else if (file.document_id) {
      logAction(req, 'documents', file.document_id, projectOf('documents', file.document_id), 'detach', `Xoá file "${file.name}"`);
    } else if (file.test_case_id) {
      const pid = projectOf('test_cases', file.test_case_id);
      logAction(req, 'test-cases', file.test_case_id, pid, 'detach', `Xoá file "${file.name}"`);
    }
    res.status(204).end();
  });

  // ---- Liên kết task: phụ thuộc / đang chặn / liên quan ----
  api.post('/tasks/:id/links', (req, res) => {
    const taskId = parseId(req.params.id);
    const task = db.prepare('SELECT id, project_id FROM tasks WHERE id = ?').get(taskId);
    if (!task) throw new HttpError(404, `Không tìm thấy task #${taskId}`);
    assertProject(req, task.project_id);
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
    const text = { depends_on: 'phụ thuộc vào', blocks: 'đang chặn', relates: 'liên quan tới' }[data.type];
    logAction(req, 'tasks', taskId, task.project_id, 'link', `Thêm liên kết: ${text} ${taskCode(other.id)} "${refLabel(db, 'tasks', other.id)}"`);
    res.status(201).json(taskLinks(db, taskId));
  });

  api.delete('/task-links/:id', (req, res) => {
    const id = parseId(req.params.id);
    const link = db.prepare('SELECT * FROM task_links WHERE id = ?').get(id);
    if (!link) throw new HttpError(404, 'Không tìm thấy liên kết');
    assertRow(req, 'tasks', link.task_id);
    db.prepare('DELETE FROM task_links WHERE id = ?').run(id);
    logAction(
      req,
      'tasks',
      link.task_id,
      projectOf('tasks', link.task_id),
      'unlink',
      `Gỡ liên kết ${link.type === 'relates' ? 'liên quan' : 'phụ thuộc'} với ${taskCode(link.other_task_id)}`,
    );
    res.status(204).end();
  });

  // ---- Test runs (lịch sử chạy test case) ----
  api.get('/test-cases/:id/runs', (req, res) => {
    const id = parseId(req.params.id);
    assertRow(req, 'test_cases', id);
    res.json(
      db.prepare('SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY executed_at DESC, id DESC').all(id),
    );
  });

  api.post('/test-cases/:id/runs', (req, res) => {
    const id = parseId(req.params.id);
    assertRow(req, 'test_cases', id);
    if (!db.prepare('SELECT 1 FROM test_cases WHERE id = ?').get(id)) {
      throw new HttpError(404, `Không tìm thấy test case #${id}`);
    }
    const data = validate(db, testRuns, req.body);
    data.executed_by ??= req.user.name; // mặc định: người đang đăng nhập
    // Test lại sau khi bug đã sửa: Đạt -> đóng bug "Đã sửa"; Không đạt -> mở lại bug "Đã sửa"
    const syncBugs = req.body?.update_bugs === true && ['passed', 'failed'].includes(data.result);
    const bugsUpdated = [];
    const run = transaction(db, () => {
      const info = db
        .prepare(
          "INSERT INTO test_runs (test_case_id, result, note, executed_by, executed_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))",
        )
        .run(id, data.result, data.note ?? null, data.executed_by ?? null);
      const row = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(Number(info.lastInsertRowid));
      db.prepare(
        "UPDATE test_cases SET status = ?, last_run_at = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(data.result, row.executed_at, id);
      if (syncBugs) {
        const to = data.result === 'passed' ? 'closed' : 'reopened';
        for (const b of db.prepare("SELECT id, title, project_id FROM bugs WHERE test_case_id = ? AND status = 'resolved'").all(id)) {
          db.prepare(
            `UPDATE bugs SET status = ?, resolved_at = CASE WHEN ? = 'reopened' THEN NULL ELSE resolved_at END,
             updated_at = datetime('now') WHERE id = ?`,
          ).run(to, to, b.id);
          recordHistory(db, {
            projectId: b.project_id,
            entity: 'bugs',
            entityId: b.id,
            action: 'update',
            summary: `Tự cập nhật sau khi test lại: ${data.result === 'passed' ? 'Đạt' : 'Không đạt'}`,
            changes: [{ field: 'status', from: 'resolved', to }],
            actor: actorOf(req),
          });
          bugsUpdated.push({ id: b.id, title: b.title, status: to });
        }
      }
      return row;
    });
    const label = { passed: 'Đạt', failed: 'Không đạt', blocked: 'Bị chặn' }[data.result];
    logAction(req, 'test-cases', id, projectOf('test_cases', id), 'run', `Thực thi test: ${label}${data.note ? ` — ${data.note}` : ''}`);
    res.status(201).json({ ...run, bugs_updated: bugsUpdated });
  });

  // ---- Quy trình test theo thời gian: chạy test -> báo bug -> sửa bug -> test lại ----
  api.get('/test-cases/:id/timeline', (req, res) => {
    const id = parseId(req.params.id);
    const tc = db.prepare('SELECT id, project_id, status, created_at, created_by FROM test_cases WHERE id = ?').get(id);
    if (!tc) throw new HttpError(404, `Không tìm thấy test case #${id}`);
    assertProject(req, tc.project_id);
    const events = [{ type: 'created', at: tc.created_at, actor: tc.created_by }];
    const runs = db.prepare('SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY executed_at, id').all(id);
    const files = db.prepare('SELECT id, name, mime_type, size FROM attachments WHERE test_run_id = ? ORDER BY id');
    let failedBefore = false;
    runs.forEach((r, i) => {
      events.push({
        type: 'run',
        at: r.executed_at,
        actor: r.executed_by,
        run_id: r.id,
        index: i + 1,
        retest: failedBefore, // đã từng Không đạt -> lần này là test lại
        result: r.result,
        note: r.note,
        attachments: files.all(r.id),
      });
      if (r.result === 'failed') failedBefore = true;
    });
    const bugs = db
      .prepare('SELECT id, title, status, severity, assignee, created_at, created_by, resolved_at, test_run_id FROM bugs WHERE test_case_id = ? ORDER BY id')
      .all(id);
    const statusHistory = db.prepare(
      "SELECT created_at, actor, changes, summary FROM history WHERE entity = 'bugs' AND entity_id = ? AND action = 'update' ORDER BY created_at, id",
    );
    for (const b of bugs) {
      events.push({ type: 'bug_created', at: b.created_at, actor: b.created_by, bug: b, run_id: b.test_run_id });
      let sawResolved = false;
      for (const h of statusHistory.all(b.id)) {
        const c = JSON.parse(h.changes ?? '[]').find((x) => x.field === 'status');
        if (!c) continue;
        if (c.to === 'resolved') sawResolved = true;
        events.push({ type: 'bug_status', at: h.created_at, actor: h.actor, bug: b, from: c.from, to: c.to, summary: h.summary });
      }
      // Dữ liệu cũ không có lịch sử trạng thái: dùng thời điểm "Đã sửa"
      if (!sawResolved && b.resolved_at) {
        events.push({ type: 'bug_status', at: b.resolved_at, actor: null, bug: b, from: null, to: 'resolved' });
      }
    }
    const order = { created: 0, run: 1, bug_created: 2, bug_status: 3 };
    events.sort((a, b) =>
      a.type === 'created' ? -1 : b.type === 'created' ? 1 : a.at < b.at ? -1 : a.at > b.at ? 1 : order[a.type] - order[b.type],
    );

    // Bước hiện tại của quy trình
    const open = bugs.filter((b) => ['new', 'in_progress', 'reopened'].includes(b.status));
    const fixed = bugs.filter((b) => b.status === 'resolved');
    const last = runs[runs.length - 1];
    let stage;
    if (!last) stage = 'not_run';
    else if (last.result === 'passed') stage = fixed.length ? 'retest_passed_open' : 'passed';
    else if (last.result === 'blocked') stage = 'blocked';
    else if (fixed.length && !open.length) stage = 'retest';
    else if (open.length) stage = 'fixing';
    else stage = 'report_bug';
    res.json({ stage, events, bugs, runs: runs.length });
  });

  api.delete('/test-runs/:id', (req, res) => {
    const id = parseId(req.params.id);
    const run = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(id);
    if (!run) throw new HttpError(404, `Không tìm thấy lần chạy #${id}`);
    assertRow(req, 'test_cases', run.test_case_id);
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
    logAction(req, 'test-cases', run.test_case_id, projectOf('test_cases', run.test_case_id), 'delete-run', `Xoá lần chạy #${id}`);
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
    const projectId = mustProject(req.params.id);
    assertProject(req, projectId);
    res.json(projectMembers(db, projectId));
  });

  // Thêm thành viên: chọn người có sẵn (member_id) hoặc tạo người mới (name, email)
  api.post('/projects/:id/members', (req, res) => {
    requireAdmin(req);
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
      logAction(req, 'projects', projectId, projectId, 'member', `Thêm thành viên "${refLabel(db, 'members', memberId)}" (${ROLE[data.role ?? 'developer']})`);
    });
    res.status(201).json(projectMembers(db, projectId).find((m) => m.id === memberId));
  });

  api.patch('/projects/:id/members/:memberId', (req, res) => {
    requireAdmin(req);
    const projectId = mustProject(req.params.id);
    const memberId = parseId(req.params.memberId);
    const data = validate(db, { role: { type: 'enum', values: ENUMS.memberRole, required: true } }, req.body);
    const info = db
      .prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND member_id = ?')
      .run(data.role, projectId, memberId);
    if (!info.changes) throw new HttpError(404, 'Người này không thuộc dự án');
    logAction(req, 'projects', projectId, projectId, 'member', `Đổi vai trò của "${refLabel(db, 'members', memberId)}" thành ${ROLE[data.role]}`);
    res.json(projectMembers(db, projectId).find((m) => m.id === memberId));
  });

  api.delete('/projects/:id/members/:memberId', (req, res) => {
    requireAdmin(req);
    const projectId = mustProject(req.params.id);
    const memberId = parseId(req.params.memberId);
    const info = db.prepare('DELETE FROM project_members WHERE project_id = ? AND member_id = ?').run(projectId, memberId);
    if (!info.changes) throw new HttpError(404, 'Người này không thuộc dự án');
    logAction(req, 'projects', projectId, projectId, 'member', `Gỡ thành viên "${refLabel(db, 'members', memberId)}" khỏi dự án`);
    res.status(204).end();
  });

  // ---- Biểu đồ Gantt: mỗi thành viên tham gia dự án nào, đang làm task nào ----
  api.get('/gantt', (req, res) => {
    const projectId = req.query.project_id ? requireProject(db, req.query).id : null;
    const memberId = req.query.member_id ? parseId(req.query.member_id) : null;
    // Thành viên chỉ xem được Gantt của chính mình (trong hồ sơ cá nhân)
    if (memberId !== req.user.id) requireAdmin(req);
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
      `SELECT t.id, t.title, t.status, t.priority, t.start_date, t.due_date, t.completed_at, t.created_at, t.project_id,
         CASE WHEN ${ASSIGNED('t.assignee', '?')} THEN 'pic' ELSE 'support' END AS involvement
       FROM tasks t WHERE ${INVOLVED('t', '?')}
       ${projectId ? 'AND t.project_id = ?' : ''} ${includeDone ? '' : "AND t.status NOT IN ('released', 'canceled')"}
       ORDER BY COALESCE(t.start_date, t.due_date, substr(t.created_at, 1, 10)), t.id`,
    );
    const projectById = db.prepare(`SELECT ${projectCols} FROM projects p WHERE p.id = ?`);

    const members = people.map((m) => {
      const projects = memberProjects.all(...(projectId ? [m.id, projectId] : [m.id]));
      const tasks = memberTasks.all(...(projectId ? [m.name, m.name, m.name, projectId] : [m.name, m.name, m.name]));
      // Task được giao ở dự án mà người này chưa là thành viên: vẫn hiển thị dự án (không có vai trò)
      for (const pid of new Set(tasks.map((t) => t.project_id))) {
        if (!projects.some((p) => p.id === pid)) projects.push({ ...projectById.get(pid), role: null });
      }
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        position: m.position,
        projects: projects
          .filter((p) => canAccessProject(req, p.id))
          .map((p) => ({ ...p, tasks: tasks.filter((t) => t.project_id === p.id) })),
      };
    });
    res.json({ today: today(), members });
  });

  // ---- Báo cáo test (test report) của dự án ----
  api.get('/test-report', (req, res) => {
    const project = projectFor(req);
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
    const groupBy = (col, order) =>
      db
        .prepare(`SELECT ${col} AS key, ${statusCase} FROM test_cases WHERE project_id = ? GROUP BY ${col} ORDER BY ${order}`)
        .all(project.id)
        .map(rate);
    const byPriority = groupBy(
      'priority',
      `CASE priority ${ENUMS.priority.map((v, i) => `WHEN '${v}' THEN ${-i}`).join(' ')} END`,
    );
    const byType = groupBy('type', 'total DESC');
    const byCategory = db
      .prepare(
        `SELECT t.category_id AS key, COALESCE(c.name, '(Chưa phân loại)') AS name,
           COUNT(*) AS total, SUM(t.status = 'passed') AS passed, SUM(t.status = 'failed') AS failed,
           SUM(t.status = 'blocked') AS blocked, SUM(t.status = 'not_run') AS not_run
         FROM test_cases t LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.project_id = ? GROUP BY t.category_id ORDER BY c.name IS NULL, c.name`,
      )
      .all(project.id)
      .map(rate);
    // Theo người chạy: mỗi lần chạy là một lượt thực thi
    const byTester = db
      .prepare(
        `SELECT COALESCE(NULLIF(r.executed_by, ''), '(Không ghi tên)') AS key, COUNT(*) AS runs,
           SUM(r.result = 'passed') AS passed, SUM(r.result = 'failed') AS failed, SUM(r.result = 'blocked') AS blocked,
           MAX(r.executed_at) AS last_at
         FROM test_runs r JOIN test_cases t ON t.id = r.test_case_id
         WHERE t.project_id = ? GROUP BY 1 ORDER BY runs DESC, key`,
      )
      .all(project.id);
    const recentRuns = db
      .prepare(
        `SELECT r.id, r.result, r.executed_by, r.executed_at, r.note, t.id AS test_case_id, t.title,
           (SELECT COUNT(*) FROM attachments a WHERE a.test_run_id = r.id) AS attachment_count
         FROM test_runs r JOIN test_cases t ON t.id = r.test_case_id
         WHERE t.project_id = ? ORDER BY r.executed_at DESC, r.id DESC LIMIT 10`,
      )
      .all(project.id);
    res.json({
      summary: rate(summary),
      byModule: byModule.map(rate),
      byPriority,
      byType,
      byCategory,
      byTester,
      recentRuns,
      lastRun,
      openBugsFromTests,
    });
  });

  // ---- CRUD ----
  api.use('/projects', createResource(db, projects));
  api.use('/members', createResource(db, members));
  api.use('/documents', createResource(db, documents));
  api.use('/categories', createResource(db, categories));
  api.use('/milestones', createResource(db, milestones));

  // ---- Bình luận trên task / test case / bug ----
  const COMMENT_TABLES = { tasks: 'tasks', 'test-cases': 'test_cases', bugs: 'bugs' };
  const commentTarget = (entity, rawId) => {
    const table = COMMENT_TABLES[entity];
    if (!table) throw new HttpError(400, 'Chỉ bình luận được trên task, test case và bug');
    const id = parseId(rawId);
    const row = db.prepare(`SELECT id, project_id FROM ${table} WHERE id = ?`).get(id);
    if (!row) throw new HttpError(404, 'Không tìm thấy mục cần bình luận');
    return row;
  };
  const commentBody = (raw) => {
    const body = typeof raw === 'string' ? raw.trim() : '';
    if (!body) throw new HttpError(400, 'Dữ liệu không hợp lệ', { body: 'Nội dung bình luận không được để trống' });
    if (body.length > 5000) throw new HttpError(400, 'Dữ liệu không hợp lệ', { body: 'Tối đa 5000 ký tự' });
    return body;
  };
  const COMMENT_SELECT = `SELECT c.id, c.entity, c.entity_id, c.member_id, c.author_name, c.parent_id, c.body, c.created_at, c.updated_at,
      m.email AS author_email, m.avatar AS author_avatar
    FROM comments c LEFT JOIN members m ON m.id = c.member_id`;
  const getComment = (id) => db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(id);

  api.get('/comments', (req, res) => {
    const target = commentTarget(req.query.entity, req.query.entity_id);
    assertProject(req, target.project_id);
    res.json(
      db
        .prepare(`${COMMENT_SELECT} WHERE c.entity = ? AND c.entity_id = ? ORDER BY c.id`)
        .all(req.query.entity, target.id),
    );
  });

  // Chỉ thành viên của dự án (hoặc quản trị viên) mới bình luận được
  api.post('/comments', (req, res) => {
    const { entity, entity_id: entityId } = req.body ?? {};
    const target = commentTarget(entity, entityId);
    const isMember = db
      .prepare('SELECT 1 FROM project_members WHERE project_id = ? AND member_id = ?')
      .get(target.project_id, req.user.id);
    if (!isMember && !req.user.is_admin) {
      throw new HttpError(403, 'Chỉ thành viên của dự án mới bình luận được');
    }
    // Trả lời: luôn gắn vào bình luận gốc (chỉ một cấp trả lời)
    let parentId = null;
    if (req.body.parent_id != null && req.body.parent_id !== '') {
      const parent = getComment(parseId(req.body.parent_id));
      if (!parent || parent.entity !== entity || parent.entity_id !== target.id) {
        throw new HttpError(400, 'Dữ liệu không hợp lệ', { parent_id: 'Bình luận được trả lời không tồn tại' });
      }
      parentId = parent.parent_id ?? parent.id;
    }
    const info = db
      .prepare(
        'INSERT INTO comments (project_id, entity, entity_id, member_id, author_name, parent_id, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(target.project_id, entity, target.id, req.user.id, req.user.name, parentId, commentBody(req.body.body));
    const comment = getComment(Number(info.lastInsertRowid));
    const mentioned = notifyMentions(req, comment, target.project_id);
    res.status(201).json({ ...comment, mentioned });
  });

  /**
   * @nhắc tên: tìm "@Họ Tên" của các thành viên dự án trong nội dung bình luận,
   * tạo thông báo trên web và gửi email (nếu bật & đã cấu hình SMTP).
   */
  const MENTION_TABLE = { tasks: ['tasks', 'TASK'], 'test-cases': ['test_cases', 'TC'], bugs: ['bugs', 'BUG'] };
  const notifyMentions = (req, comment, projectId) => {
    const settings = getSettings(db);
    const people = db
      .prepare(
        `SELECT m.id, m.name, m.email, m.email_notifications FROM project_members pm
         JOIN members m ON m.id = pm.member_id WHERE pm.project_id = ?`,
      )
      .all(projectId)
      .sort((a, b) => b.name.length - a.name.length);
    let text = comment.body;
    const found = [];
    for (const p of people) {
      const token = `@${p.name}`;
      let i = text.indexOf(token);
      let hit = false;
      while (i !== -1) {
        const next = text[i + token.length];
        // Sau tên phải là hết chuỗi, khoảng trắng hoặc dấu câu (tránh "@An" khớp "@Anh")
        if (next === undefined || /[\s.,;:!?)\]}"'’]/.test(next)) {
          hit = true;
          text = text.slice(0, i) + ' '.repeat(token.length) + text.slice(i + token.length);
        }
        i = text.indexOf(token, i + 1);
      }
      if (hit && p.id !== req.user.id) found.push(p);
    }
    if (!found.length) return [];
    const [table, prefix] = MENTION_TABLE[comment.entity];
    const title = db.prepare(`SELECT title FROM ${table} WHERE id = ?`).get(comment.entity_id)?.title ?? '';
    const project = db.prepare('SELECT code FROM projects WHERE id = ?').get(projectId);
    const code = `${prefix}-${String(comment.entity_id).padStart(3, '0')}`;
    const excerpt = comment.body.length > 300 ? `${comment.body.slice(0, 300)}…` : comment.body;
    const ins = db.prepare(
      'INSERT INTO mentions (member_id, project_id, comment_id, entity, entity_id, actor, excerpt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const p of found) {
      const id = Number(ins.run(p.id, projectId, comment.id, comment.entity, comment.entity_id, req.user.name, excerpt).lastInsertRowid);
      if (mailer && settings.mention_email && p.email && p.email_notifications) {
        const link = `${appUrl.replace(/\/$/, '')}/${comment.entity}/${comment.entity_id}?tab=comments`;
        const subject = `[${project.code}] ${req.user.name} đã nhắc đến bạn trong ${code}`;
        const textBody = `${req.user.name} đã nhắc đến bạn trong bình luận ở ${code} "${title}":\n\n${comment.body}\n\nXem: ${link}`;
        const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
        const html = `<p><b>${esc(req.user.name)}</b> đã nhắc đến bạn trong bình luận ở <b>${esc(code)}</b> "${esc(title)}":</p>
          <blockquote style="border-left:3px solid #4f46e5;margin:0;padding:6px 12px;white-space:pre-wrap">${esc(comment.body)}</blockquote>
          <p><a href="${esc(link)}">Mở ${esc(code)}</a></p>`;
        // Gửi nền, không làm chậm việc đăng bình luận
        Promise.resolve()
          .then(() => mailer.send({ to: p.email, subject, text: textBody, html }))
          .then(() => db.prepare("UPDATE mentions SET emailed_at = datetime('now') WHERE id = ?").run(id))
          .catch((err) => console.error('Gửi email @nhắc tên thất bại:', err.message));
      }
    }
    return found.map((p) => ({ id: p.id, name: p.name }));
  };

  // Bình luận không sửa / xoá được (giữ nguyên lịch sử trao đổi)

  // ---- Lịch sử thay đổi ----
  api.get('/history', (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    res.json(
      listHistory(db, {
        entity: typeof req.query.entity === 'string' ? req.query.entity : null,
        entityId: req.query.entity_id ? parseId(req.query.entity_id) : null,
        projectId: req.query.project_id ? parseId(req.query.project_id) : null,
        projectIds: req.user.allowedProjects,
        limit,
        offset,
      }),
    );
  });

  // ---- Cài đặt & thông báo deadline ----
  const emailStatus = () => ({ configured: Boolean(mailer), from: mailer?.from ?? null });
  api.get('/settings', (_req, res) => res.json({ settings: getSettings(db), email: emailStatus() }));
  api.put('/settings', (req, res) => {
    requireAdmin(req);
    const [settings, changes] = saveSettings(db, req.body);
    if (changes.length) {
      recordHistory(db, { entity: 'settings', entityId: 0, action: 'update', changes, actor: actorOf(req) });
    }
    res.json({ settings, email: emailStatus() });
  });

  // Thông báo trên web: task / milestone trễ hoặc sắp đến hạn
  api.get('/notifications', (req, res) => {
    const settings = getSettings(db);
    const projectId = req.query.project_id ? parseId(req.query.project_id) : null;
    const items = settings.web_enabled
      ? deadlineItems(db, {
          projectId,
          projectIds: req.user.allowedProjects,
          daysBefore: settings.remind_days_before,
          includeMilestones: settings.include_milestones,
        })
      : [];
    // @nhắc tên: của người đang đăng nhập, ở mọi dự án mình còn được truy cập
    const allowed = req.user.allowedProjects;
    const mentions = settings.mention_web
      ? db
          .prepare(
            `SELECT mn.id, mn.entity, mn.entity_id, mn.actor, mn.excerpt, mn.created_at, mn.read_at, mn.project_id,
               p.code AS project_code
             FROM mentions mn JOIN projects p ON p.id = mn.project_id
             WHERE mn.member_id = ? ${allowed ? `AND mn.project_id IN (${allowed.map(() => '?').join(',') || 'NULL'})` : ''}
             ORDER BY mn.id DESC LIMIT 30`,
          )
          .all(req.user.id, ...(allowed ?? []))
      : [];
    res.json({
      enabled: settings.web_enabled || settings.mention_web,
      deadlineEnabled: settings.web_enabled,
      items,
      mentions,
      unreadMentions: mentions.filter((m) => !m.read_at).length,
    });
  });

  // Đánh dấu đã đọc thông báo @nhắc tên: { ids: [..] } hoặc { all: true }
  api.post('/notifications/mentions/read', (req, res) => {
    const body = req.body ?? {};
    if (body.all === true) {
      db.prepare("UPDATE mentions SET read_at = datetime('now') WHERE member_id = ? AND read_at IS NULL").run(req.user.id);
    } else {
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
      const upd = db.prepare("UPDATE mentions SET read_at = datetime('now') WHERE id = ? AND member_id = ? AND read_at IS NULL");
      for (const id of ids) upd.run(id, req.user.id);
    }
    res.status(204).end();
  });

  // Xem trước email nhắc deadline (không gửi)
  api.post('/notifications/email/preview', (req, res) => {
    requireAdmin(req);
    res.json({ digests: buildEmailDigests(db, getSettings(db), { appUrl }), email: emailStatus() });
  });

  // Gửi email nhắc deadline ngay
  api.post('/notifications/email/run', async (req, res) => {
    requireAdmin(req);
    if (!mailer) {
      throw new HttpError(400, 'Chưa cấu hình máy chủ gửi email (SMTP). Xem hướng dẫn trong README.');
    }
    const report = await runEmailNotifications(db, { mailer, appUrl, force: req.body?.force === true });
    res.json(report);
  });
  api.use('/meetings', createResource(db, meetings));
  api.use('/tasks', createResource(db, tasks));
  api.use('/test-cases', createResource(db, testCases));
  api.use('/bugs', createResource(db, bugs));

  // ---- Dữ liệu cho dropdown liên kết (theo dự án) ----
  api.get('/lookup', (req, res) => {
    const allowed = req.user.allowedProjects;
    const inAllowed = (col) => (allowed ? `WHERE ${col} IN (${allowed.map(() => '?').join(',') || 'NULL'})` : '');
    const allProjects = db
      .prepare(`SELECT id, code, name, status FROM projects ${inAllowed('id')} ORDER BY name`)
      .all(...(allowed ?? []));
    // Thành viên chỉ thấy những người cùng dự án (và quản trị viên)
    const allMembers = db
      .prepare(
        `SELECT id, name, email, avatar FROM members ${
          allowed
            ? `WHERE id = ? OR id IN (SELECT member_id FROM project_members ${inAllowed('project_id')})
               OR id IN (SELECT member_id FROM accounts WHERE is_admin = 1)`
            : ''
        } ORDER BY name`,
      )
      .all(...(allowed ? [req.user.id, ...allowed] : []));
    if (!req.query.project_id) {
      return res.json({
        projects: allProjects,
        allMembers,
        members: [],
        categories: [],
        milestones: [],
        meetings: [],
        tasks: [],
        testCases: [],
        documents: [],
        people: [],
        modules: [],
      });
    }
    const { id } = projectFor(req);
    // Tên người đã dùng trong dự án (PIC / Hỗ trợ là danh sách "A, B" nên tách ra)
    const raw = db
      .prepare(
        `SELECT m.name AS name FROM project_members pm JOIN members m ON m.id = pm.member_id WHERE pm.project_id = ? UNION
         SELECT assignee FROM tasks WHERE project_id = ? UNION SELECT supporters FROM tasks WHERE project_id = ? UNION
         SELECT assignee FROM bugs WHERE project_id = ? UNION SELECT supporters FROM bugs WHERE project_id = ? UNION
         SELECT assignee FROM test_cases WHERE project_id = ? UNION SELECT supporters FROM test_cases WHERE project_id = ? UNION
         SELECT reporter FROM bugs WHERE project_id = ? UNION
         SELECT facilitator FROM meetings WHERE project_id = ?`,
      )
      .all(id, id, id, id, id, id, id, id, id);
    const byKey = new Map();
    for (const r of raw) for (const n of splitPeople(r.name)) if (!byKey.has(n.toLowerCase())) byKey.set(n.toLowerCase(), n);
    const people = [...byKey.values()].sort((a, b) => a.localeCompare(b, 'vi'));
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
        .prepare(
          'SELECT id, title, type, version, status, category_id FROM documents WHERE project_id = ? ORDER BY type, title',
        )
        .all(id),
      categories: db
        .prepare('SELECT id, name, parent_id, color FROM categories WHERE project_id = ? ORDER BY name')
        .all(id),
      milestones: db
        .prepare('SELECT id, name, due_date, status FROM milestones WHERE project_id = ? ORDER BY due_date, id')
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
    const project = projectFor(req);
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
        overdueTasks: n("SELECT COUNT(*) AS n FROM tasks WHERE project_id = ? AND due_date < ? AND status NOT IN ('released', 'canceled')", d),
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
          "SELECT * FROM tasks WHERE project_id = ? AND due_date < ? AND status NOT IN ('released', 'canceled') ORDER BY due_date LIMIT 8",
        )
        .all(p, d),
      dueSoonTasks: db
        .prepare(
          `SELECT * FROM tasks WHERE project_id = ? AND due_date >= ? AND due_date <= date(?, '+7 day')
           AND status NOT IN ('released', 'canceled') ORDER BY due_date LIMIT 8`,
        )
        .all(p, d, d),
      milestones: db
        .prepare(
          `SELECT m.*,
             (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = m.id) AS task_count,
             (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = m.id AND t.status IN ('released', 'canceled')) AS done_count
           FROM milestones m WHERE m.project_id = ? AND m.status NOT IN ('completed', 'cancelled')
           ORDER BY m.due_date LIMIT 5`,
        )
        .all(p),
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
