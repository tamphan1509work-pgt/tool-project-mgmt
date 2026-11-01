import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import { seed } from '../src/seed.js';

let server;
let base;
let db;
let P; // dự án dùng chung cho các test
let P2; // dự án thứ hai
let TOKEN; // phiên đăng nhập của quản trị viên dùng cho các test
const auth = () => ({ Authorization: `Bearer ${TOKEN}` });

const req = async (method, path, body, token = TOKEN) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

before(async () => {
  db = openDb(':memory:');
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  const setup = await req('POST', '/auth/setup', { name: 'Admin Test', email: 'Admin@Test.vn', password: 'secret123' }, null);
  TOKEN = setup.body.token;
  P = (await req('POST', '/projects', { code: 'test', name: 'Dự án test' })).body.id;
  P2 = (await req('POST', '/projects', { code: 'OTHER', name: 'Dự án khác' })).body.id;
});

after(() => {
  server.close();
  db.close();
});

describe('projects & members', () => {
  test('mã dự án viết hoa, duy nhất, đúng định dạng', async () => {
    let r = await req('GET', `/projects/${P}`);
    assert.equal(r.body.code, 'TEST');
    r = await req('POST', '/projects', { code: 'TEST', name: 'Trùng' });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.code);
    r = await req('POST', '/projects', { code: '1x', name: 'Sai' });
    assert.equal(r.status, 400);
    r = await req('POST', '/projects', { code: 'ABC', name: 'X', start_date: '2026-05-01', end_date: '2026-04-01' });
    assert.ok(r.body.details.end_date);
  });

  test('thêm, đổi vai trò, xoá thành viên', async () => {
    let r = await req('POST', `/projects/${P}/members`, { name: 'Lan', email: 'lan@x.com', role: 'tester' });
    assert.equal(r.status, 201);
    const lan = r.body.id;
    assert.equal(r.body.role, 'tester');

    // cùng người vào dự án thứ hai, chọn từ danh bạ
    r = await req('POST', `/projects/${P2}/members`, { member_id: lan, role: 'pm' });
    assert.equal(r.status, 201);
    r = await req('POST', `/projects/${P}/members`, { member_id: lan });
    assert.equal(r.status, 400, 'không thêm trùng');
    r = await req('POST', `/projects/${P}/members`, { role: 'foo', name: 'X' });
    assert.equal(r.status, 400);

    r = await req('PATCH', `/projects/${P}/members/${lan}`, { role: 'ba' });
    assert.equal(r.body.role, 'ba');
    r = await req('GET', `/members/${lan}`);
    assert.equal(r.body.projects.length, 2);

    r = await req('GET', '/projects?q=TEST');
    assert.equal(r.body.items[0].member_count, 1);

    r = await req('DELETE', `/projects/${P2}/members/${lan}`);
    assert.equal(r.status, 204);
    r = await req('GET', `/projects/${P2}/members`);
    assert.equal(r.body.length, 0);
  });

  test('xoá dự án xoá toàn bộ dữ liệu của dự án', async () => {
    const p = (await req('POST', '/projects', { code: 'TMP', name: 'Tạm' })).body.id;
    const t = (await req('POST', '/tasks', { project_id: p, title: 'x' })).body.id;
    await req('POST', '/documents', { project_id: p, title: 'Doc' });
    await req('DELETE', `/projects/${p}`);
    assert.equal((await req('GET', `/tasks/${t}`)).status, 404);
    assert.equal((await req('GET', `/documents?project_id=${p}`)).body.total, 0);
  });
});

describe('dữ liệu theo dự án', () => {
  test('project_id bắt buộc, không đổi được, lọc theo dự án', async () => {
    let r = await req('POST', '/tasks', { title: 'Không có dự án' });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.project_id);

    r = await req('POST', '/tasks', { project_id: P, title: 'Task P' });
    const id = r.body.id;
    await req('POST', '/tasks', { project_id: P2, title: 'Task P2' });
    r = await req('PATCH', `/tasks/${id}`, { project_id: P2 });
    assert.equal(r.body.project_id, P);

    r = await req('GET', `/tasks?project_id=${P2}`);
    assert.ok(r.body.items.every((t) => t.project_id === P2));
  });

  test('không liên kết bản ghi của dự án khác', async () => {
    const m = (await req('POST', '/meetings', { project_id: P2, title: 'Họp P2', meeting_date: '2026-01-01' })).body;
    const r = await req('POST', '/tasks', { project_id: P, title: 'X', meeting_id: m.id });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.meeting_id);
  });
});

describe('meetings', () => {
  test('tạo, đọc, sửa, xoá; action item giữ lại khi xoá họp', async () => {
    let r = await req('POST', '/meetings', {
      project_id: P,
      title: 'Họp A',
      meeting_date: '2026-01-05',
      start_time: '09:00',
    });
    assert.equal(r.status, 201);
    const id = r.body.id;
    r = await req('PATCH', `/meetings/${id}`, { decisions: 'Chốt phạm vi' });
    assert.equal(r.body.decisions, 'Chốt phạm vi');

    await req('POST', '/tasks', { project_id: P, title: 'Action item', meeting_id: id });
    r = await req('GET', `/meetings/${id}`);
    assert.equal(r.body.action_items.length, 1);

    assert.equal((await req('DELETE', `/meetings/${id}`)).status, 204);
    r = await req('GET', `/tasks?project_id=${P}&q=Action item`);
    assert.equal(r.body.items[0].meeting_id, null);
  });

  test('validate dữ liệu', async () => {
    const r = await req('POST', '/meetings', { project_id: P, title: '', meeting_date: '2026-13-45', start_time: '25:00' });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.title && r.body.details.meeting_date && r.body.details.start_time);
  });
});

describe('tasks', () => {
  test('giá trị mặc định, completed_at, lọc & sắp xếp', async () => {
    let r = await req('POST', '/tasks', { project_id: P, title: 'Sort low', priority: 'low' });
    assert.equal(r.body.status, 'todo');
    const id = r.body.id;
    r = await req('PATCH', `/tasks/${id}`, { status: 'released' });
    assert.ok(r.body.completed_at);
    r = await req('PATCH', `/tasks/${id}`, { status: 'in_progress' });
    assert.equal(r.body.completed_at, null);

    await req('POST', '/tasks', { project_id: P, title: 'Sort critical', priority: 'critical' });
    r = await req('GET', `/tasks?project_id=${P}&q=Sort&sort=priority&order=desc`);
    assert.deepEqual(
      r.body.items.map((t) => t.priority),
      ['critical', 'low'],
    );
  });

  test('từ chối enum / liên kết sai và hạn trước ngày bắt đầu', async () => {
    let r = await req('POST', '/tasks', { project_id: P, title: 'X', status: 'foo', meeting_id: 99999 });
    assert.ok(r.body.details.status && r.body.details.meeting_id);
    r = await req('POST', '/tasks', { project_id: P, title: 'X', start_date: '2026-02-10', due_date: '2026-02-01' });
    assert.ok(r.body.details.due_date);
  });

  test('tìm theo mã', async () => {
    const { body } = await req('POST', '/tasks', { project_id: P, title: 'Tìm tôi' });
    const r = await req('GET', `/tasks?project_id=${P}&q=TASK-${body.id}`);
    assert.ok(r.body.items.some((t) => t.id === body.id));
  });
});

describe('documents', () => {
  test('tạo tài liệu, liên kết với task, gỡ liên kết', async () => {
    let r = await req('POST', '/documents', { project_id: P, title: 'SRS', type: 'specification', url: 'ftp://x' });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.url);

    const srs = (await req('POST', '/documents', { project_id: P, title: 'SRS', url: 'https://docs/srs' })).body;
    assert.equal(srs.type, 'specification');
    const ui = (await req('POST', '/documents', { project_id: P, title: 'UI', type: 'design', version: '1.0' })).body;
    const other = (await req('POST', '/documents', { project_id: P2, title: 'Khác' })).body;

    r = await req('POST', '/tasks', { project_id: P, title: 'Có tài liệu', document_ids: [srs.id, ui.id, srs.id] });
    const task = r.body.id;
    r = await req('GET', `/tasks/${task}`);
    assert.deepEqual(r.body.document_ids.sort(), [srs.id, ui.id].sort());

    r = await req('GET', `/documents/${ui.id}`);
    assert.equal(r.body.tasks[0].id, task);
    r = await req('GET', `/documents?project_id=${P}&type=design`);
    assert.ok(r.body.items.every((d) => d.type === 'design'));
    assert.equal(r.body.items.find((d) => d.id === ui.id).task_count, 1);

    r = await req('PATCH', `/tasks/${task}`, { document_ids: [other.id] });
    assert.equal(r.status, 400, 'tài liệu dự án khác');

    // cập nhật field khác không ảnh hưởng liên kết
    await req('PATCH', `/tasks/${task}`, { title: 'Đổi tên' });
    assert.equal((await req('GET', `/tasks/${task}`)).body.document_ids.length, 2);

    r = await req('PATCH', `/tasks/${task}`, { document_ids: [ui.id] });
    assert.equal(r.status, 200);
    assert.deepEqual((await req('GET', `/tasks/${task}`)).body.document_ids, [ui.id]);

    await req('DELETE', `/documents/${ui.id}`);
    assert.deepEqual((await req('GET', `/tasks/${task}`)).body.document_ids, []);
  });
});

describe('test cases, runs & report', () => {
  test('chạy test cập nhật trạng thái; xoá lần chạy thì đồng bộ lại', async () => {
    let r = await req('POST', '/test-cases', { project_id: P, title: 'Login OK', module: 'Auth' });
    assert.equal(r.body.status, 'not_run');
    const id = r.body.id;

    const failRun = (await req('POST', `/test-cases/${id}/runs`, { result: 'failed', note: 'Lỗi 500' })).body.id;
    await req('POST', `/test-cases/${id}/runs`, { result: 'passed' });
    r = await req('GET', `/test-cases/${id}`);
    assert.equal(r.body.status, 'passed');
    assert.equal(r.body.runs.length, 2);

    await req('DELETE', `/test-runs/${r.body.runs.find((x) => x.result === 'passed').id}`);
    assert.equal((await req('GET', `/test-cases/${id}`)).body.status, 'failed');
    await req('DELETE', `/test-runs/${failRun}`);
    r = await req('GET', `/test-cases/${id}`);
    assert.equal(r.body.status, 'not_run');
    assert.equal(r.body.last_run_at, null);

    assert.equal((await req('POST', `/test-cases/${id}/runs`, { result: 'not_run' })).status, 400);
  });

  test('báo cáo test theo module', async () => {
    const p = (await req('POST', '/projects', { code: 'RPT', name: 'Report' })).body.id;
    const mk = async (module, result) => {
      const tc = (await req('POST', '/test-cases', { project_id: p, title: 't', module })).body;
      if (result) await req('POST', `/test-cases/${tc.id}/runs`, { result });
    };
    await mk('A', 'passed');
    await mk('A', 'failed');
    await mk('B', 'passed');
    await mk(null, null);
    const r = await req('GET', `/test-report?project_id=${p}`);
    assert.equal(r.body.summary.total, 4);
    assert.equal(r.body.summary.executed, 3);
    assert.equal(r.body.summary.pass_rate, 66.7);
    const a = r.body.byModule.find((m) => m.module === 'A');
    assert.equal(a.pass_rate, 50);
    assert.ok(r.body.byModule.some((m) => m.module === '(Chưa phân loại)'));
    assert.equal((await req('GET', '/test-report')).status, 400);
    assert.equal(r.body.byType.find((x) => x.key === 'functional').total, 4);
    assert.equal(r.body.byPriority[0].key, 'medium');
    assert.equal(r.body.byTester[0].runs, 3);
    assert.equal(r.body.recentRuns.length, 3);
  });
});

describe('bugs', () => {
  test('resolved_at và liên kết test case', async () => {
    const tc = (await req('POST', '/test-cases', { project_id: P, title: 'TC bug' })).body;
    let r = await req('POST', '/bugs', { project_id: P, title: 'Bug 1', severity: 'blocker', test_case_id: tc.id });
    assert.equal(r.body.status, 'new');
    const id = r.body.id;
    r = await req('PATCH', `/bugs/${id}`, { status: 'resolved' });
    assert.ok(r.body.resolved_at);
    r = await req('GET', `/bugs/${id}`);
    assert.equal(r.body.test_case.id, tc.id);
    r = await req('GET', `/bugs?project_id=${P}&open=true`);
    assert.ok(!r.body.items.some((b) => b.id === id));
  });
});

describe('misc', () => {
  test('dashboard, lookup theo dự án, seed', async () => {
    seed(db, { reset: true });
    // dữ liệu mẫu thay toàn bộ tài khoản -> đăng nhập lại bằng tài khoản mẫu
    TOKEN = (await req('POST', '/auth/login', { email: 'an.nguyen@example.com', password: '123456' }, null)).body.token;
    assert.ok(TOKEN);
    const projects = (await req('GET', '/projects?sort=code&order=desc')).body.items;
    const pay = projects.find((p) => p.code === 'PAY');
    assert.ok(pay.member_count >= 5);

    let r = await req('GET', `/dashboard?project_id=${pay.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.counts.meetings, 3);
    assert.ok(r.body.counts.openBugs > 0);
    assert.ok(r.body.counts.documents >= 4);
    assert.equal((await req('GET', '/dashboard')).status, 400);

    r = await req('GET', `/lookup?project_id=${pay.id}`);
    assert.ok(r.body.people.includes('Phạm Thu Dung'));
    assert.ok(r.body.modules.includes('OTP'));
    assert.ok(r.body.documents.length >= 4);
    assert.equal(r.body.projects.length, 2);
    r = await req('GET', '/lookup');
    assert.deepEqual(r.body.tasks, []);
  });

  test('lỗi JSON và route không tồn tại', async () => {
    const res = await fetch(base + '/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: '{bad',
    });
    assert.equal(res.status, 400);
    assert.equal((await req('GET', '/nope')).status, 404);
  });
});

describe('migration', () => {
  test('database phiên bản cũ được gom vào "Dự án mặc định"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-mig-'));
    const file = join(dir, 'old.db');
    try {
      const old = new DatabaseSync(file);
      old.exec(`
        CREATE TABLE meetings (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, meeting_date TEXT NOT NULL,
          start_time TEXT, location TEXT, facilitator TEXT, attendees TEXT, agenda TEXT, notes TEXT, decisions TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT,
          status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'medium', assignee TEXT, start_date TEXT,
          due_date TEXT, estimate_hours REAL, meeting_id INTEGER, completed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
        INSERT INTO meetings (title, meeting_date) VALUES ('Họp cũ', '2026-01-01');
        INSERT INTO tasks (title) VALUES ('Task cũ');
      `);
      old.close();

      const mdb = openDb(file);
      const project = mdb.prepare("SELECT * FROM projects WHERE code = 'DEFAULT'").get();
      assert.ok(project);
      assert.equal(mdb.prepare('SELECT project_id FROM tasks').get().project_id, project.id);
      assert.equal(mdb.prepare('SELECT project_id FROM meetings').get().project_id, project.id);
      mdb.close();
      // mở lại lần nữa không tạo thêm dự án
      const again = openDb(file);
      assert.equal(again.prepare('SELECT COUNT(*) AS n FROM projects').get().n, 1);
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('members & gantt', () => {
  test('danh sách thành viên, đổi tên đồng bộ task, biểu đồ Gantt', async () => {
    const p = (await req('POST', '/projects', { code: 'GNT', name: 'Gantt', start_date: '2026-01-01', end_date: '2026-03-31' })).body.id;
    const p2 = (await req('POST', '/projects', { code: 'GNT2', name: 'Gantt 2' })).body.id;
    let r = await req('POST', '/members', { name: 'Ngô Bảo', email: 'bao@x.com', position: 'Dev' });
    assert.equal(r.status, 201);
    const bao = r.body.id;
    assert.equal((await req('POST', '/members', { name: 'X', email: 'sai-email' })).status, 400);
    await req('POST', `/projects/${p}/members`, { member_id: bao, role: 'developer' });

    await req('POST', '/tasks', { project_id: p, title: 'Đang làm', assignee: 'ngô bảo ', start_date: '2026-01-05', due_date: '2026-01-10' });
    await req('POST', '/tasks', { project_id: p, title: 'Xong rồi', assignee: 'Ngô Bảo', status: 'released' });
    await req('POST', '/tasks', { project_id: p2, title: 'Dự án khác', assignee: 'Ngô Bảo' });
    await req('POST', '/tasks', { project_id: p, title: 'Người khác', assignee: 'Ai đó' });

    r = await req('GET', '/members?q=Ngô');
    assert.equal(r.body.items[0].open_task_count, 2);
    assert.equal(r.body.items[0].project_count, 1);

    r = await req('GET', `/gantt?member_id=${bao}`);
    const m = r.body.members[0];
    assert.equal(m.projects.length, 2, 'dự án thành viên + dự án có task được giao');
    const gp = m.projects.find((x) => x.id === p);
    assert.equal(gp.role, 'developer');
    assert.deepEqual(gp.tasks.map((t) => t.title), ['Đang làm']);
    assert.equal(m.projects.find((x) => x.id === p2).role, null);

    r = await req('GET', `/gantt?member_id=${bao}&include_done=true&project_id=${p}`);
    assert.equal(r.body.members[0].projects[0].tasks.length, 2);
    r = await req('GET', `/gantt?project_id=${p}`);
    assert.deepEqual(r.body.members.map((x) => x.id), [bao]);
    assert.equal((await req('GET', '/gantt?member_id=99999')).status, 404);

    // đổi tên -> task chuyển theo
    await req('PATCH', `/members/${bao}`, { name: 'Ngô Gia Bảo' });
    r = await req('GET', `/tasks?project_id=${p}&q=Xong rồi`);
    assert.equal(r.body.items[0].assignee, 'Ngô Gia Bảo');
    r = await req('GET', `/members/${bao}`);
    assert.equal(r.body.tasks.length, 3);
  });
});

describe('meeting attachments', () => {
  test('tải lên, tải về, xem ảnh, xoá; xoá họp xoá file', async () => {
    const m = (await req('POST', '/meetings', { project_id: P, title: 'Họp có file', meeting_date: '2026-02-01' })).body;
    const content = 'Xin chào biên bản ✓';
    let r = await req('POST', `/meetings/${m.id}/attachments`, {
      name: 'biên bản/../x.txt',
      mime_type: 'text/plain',
      data: Buffer.from(content).toString('base64'),
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.name, 'biên bản_.._x.txt', 'không cho ký tự đường dẫn');
    assert.equal(r.body.size, Buffer.byteLength(content));
    const fileId = r.body.id;

    const dl = await fetch(`${base}/attachments/${fileId}/download`, { headers: auth() });
    assert.equal(dl.status, 200);
    assert.equal(await dl.text(), content);
    assert.match(dl.headers.get('content-disposition'), /^attachment;.*filename\*=UTF-8''/);
    // file không phải ảnh thì không hiển thị inline
    const inl = await fetch(`${base}/attachments/${fileId}/download?inline=1`, { headers: auth() });
    assert.match(inl.headers.get('content-disposition'), /^attachment/);

    r = await req('GET', `/meetings/${m.id}`);
    assert.equal(r.body.attachments.length, 1);
    assert.equal(r.body.attachments[0].data, undefined, 'không trả nội dung trong chi tiết');
    r = await req('GET', `/meetings?project_id=${P}&q=Họp có file`);
    assert.equal(r.body.items[0].attachment_count, 1);

    assert.equal((await req('POST', `/meetings/${m.id}/attachments`, { name: 'a', data: '***' })).status, 400);
    assert.equal((await req('POST', `/meetings/${m.id}/attachments`, { name: 'a', data: '' })).status, 400);
    assert.equal((await req('POST', '/meetings/99999/attachments', { name: 'a', data: 'YQ==' })).status, 404);

    await req('POST', `/meetings/${m.id}/attachments`, { name: 'b.png', mime_type: 'image/png', data: 'iVBORw0KGgo=' });
    await req('DELETE', `/attachments/${fileId}`);
    assert.equal((await fetch(`${base}/attachments/${fileId}/download`, { headers: auth() })).status, 404);
    await req('DELETE', `/meetings/${m.id}`);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE meeting_id = ?').get(m.id).n, 0);
  });

  test('giới hạn dung lượng file', async () => {
    const small = createApp(db, { maxUploadBytes: 10 }).listen(0);
    await new Promise((r) => small.once('listening', r));
    try {
      const m = (await req('POST', '/meetings', { project_id: P, title: 'Giới hạn', meeting_date: '2026-02-01' })).body;
      const res = await fetch(`http://127.0.0.1:${small.address().port}/api/meetings/${m.id}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ name: 'big.bin', data: Buffer.alloc(11).toString('base64') }),
      });
      assert.equal(res.status, 400);
      assert.match((await res.json()).details.data, /vượt quá/);
    } finally {
      small.close();
    }
  });
});

describe('subtasks & task links', () => {
  test('subtask 1 cấp, tiến độ, xoá task cha xoá subtask', async () => {
    const parent = (await req('POST', '/tasks', { project_id: P, title: 'Cha' })).body.id;
    const s1 = (await req('POST', '/tasks', { project_id: P, title: 'ZqSub 1', parent_id: parent, status: 'released' })).body.id;
    await req('POST', '/tasks', { project_id: P, title: 'ZqSub 2', parent_id: parent });

    let r = await req('GET', `/tasks/${parent}`);
    assert.equal(r.body.subtasks.length, 2);
    r = await req('GET', `/tasks?project_id=${P}&q=Cha`);
    const row = r.body.items.find((t) => t.id === parent);
    assert.equal(row.subtask_count, 2);
    assert.equal(row.subtask_done_count, 1);
    r = await req('GET', `/tasks/${s1}`);
    assert.equal(r.body.parent.id, parent);
    r = await req('GET', `/tasks?project_id=${P}&parent_id=none&q=ZqSub`);
    assert.equal(r.body.total, 0, 'lọc chỉ task cấp cao nhất');

    r = await req('POST', '/tasks', { project_id: P, title: 'Cháu', parent_id: s1 });
    assert.equal(r.status, 400, 'không hỗ trợ subtask nhiều cấp');
    const other = (await req('POST', '/tasks', { project_id: P, title: 'Khác' })).body.id;
    r = await req('PATCH', `/tasks/${parent}`, { parent_id: other });
    assert.equal(r.status, 400, 'task có subtask không thành subtask');
    r = await req('PATCH', `/tasks/${other}`, { parent_id: other });
    assert.equal(r.status, 400);
    const otherProject = (await req('POST', '/tasks', { project_id: P2, title: 'P2' })).body.id;
    r = await req('POST', '/tasks', { project_id: P, title: 'x', parent_id: otherProject });
    assert.equal(r.status, 400);

    await req('DELETE', `/tasks/${parent}`);
    assert.equal((await req('GET', `/tasks/${s1}`)).status, 404);
  });

  test('phụ thuộc, đang chặn, liên quan; chặn vòng tròn', async () => {
    const mk = async (title) => (await req('POST', '/tasks', { project_id: P, title })).body.id;
    const a = await mk('A');
    const b = await mk('B');
    const c = await mk('C');

    let r = await req('POST', `/tasks/${a}/links`, { other_task_id: b, type: 'depends_on' });
    assert.equal(r.status, 201);
    assert.equal(r.body.depends_on[0].id, b);
    // "C chặn A" = A phụ thuộc C
    r = await req('POST', `/tasks/${c}/links`, { other_task_id: a, type: 'blocks' });
    assert.equal(r.body.blocks[0].id, a);
    r = await req('GET', `/tasks/${a}`);
    assert.deepEqual(r.body.links.depends_on.map((x) => x.id).sort(), [b, c].sort());
    assert.equal((await req('GET', `/tasks/${b}`)).body.links.blocks[0].id, a);

    r = await req('GET', `/tasks?project_id=${P}&q=A`);
    assert.equal(r.body.items.find((t) => t.id === a).blocked_by_count, 2);
    await req('PATCH', `/tasks/${b}`, { status: 'released' });
    r = await req('GET', `/tasks?project_id=${P}&q=A`);
    assert.equal(r.body.items.find((t) => t.id === a).blocked_by_count, 1);

    // vòng tròn: B phụ thuộc A (A đã phụ thuộc B) -> từ chối; gián tiếp: C -> ... cũng vậy
    assert.equal((await req('POST', `/tasks/${b}/links`, { other_task_id: a, type: 'depends_on' })).status, 400);
    assert.equal((await req('POST', `/tasks/${a}/links`, { other_task_id: b, type: 'depends_on' })).status, 400, 'trùng');
    const d = await mk('D');
    await req('POST', `/tasks/${d}/links`, { other_task_id: a, type: 'depends_on' }); // D -> A -> B
    assert.equal((await req('POST', `/tasks/${b}/links`, { other_task_id: d, type: 'depends_on' })).status, 400);

    r = await req('POST', `/tasks/${a}/links`, { other_task_id: d, type: 'relates' });
    assert.equal(r.status, 201);
    assert.equal((await req('POST', `/tasks/${d}/links`, { other_task_id: a, type: 'relates' })).status, 400, 'trùng chiều ngược');
    assert.equal((await req('GET', `/tasks/${d}`)).body.links.relates[0].id, a);
    assert.equal((await req('POST', `/tasks/${a}/links`, { other_task_id: a, type: 'relates' })).status, 400);
    const p2Task = (await req('POST', '/tasks', { project_id: P2, title: 'P2 link' })).body.id;
    assert.equal((await req('POST', `/tasks/${a}/links`, { other_task_id: p2Task, type: 'relates' })).status, 400);

    const linkId = r.body.relates[0].link_id;
    assert.equal((await req('DELETE', `/task-links/${linkId}`)).status, 204);
    await req('DELETE', `/tasks/${c}`);
    assert.equal((await req('GET', `/tasks/${a}`)).body.links.depends_on.length, 1);
  });
});

describe('test run attachments', () => {
  test('đính kèm file vào lần chạy test; xoá lần chạy xoá file', async () => {
    const tc = (await req('POST', '/test-cases', { project_id: P, title: 'Có bằng chứng' })).body;
    const run = (await req('POST', `/test-cases/${tc.id}/runs`, { result: 'failed', note: 'Lỗi' })).body;
    let r = await req('POST', `/test-runs/${run.id}/attachments`, {
      name: 'screenshot.png',
      mime_type: 'image/png',
      data: 'iVBORw0KGgo=',
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.test_run_id, run.id);
    assert.equal(r.body.meeting_id, null);
    const fileId = r.body.id;
    const inl = await fetch(`${base}/attachments/${fileId}/download?inline=1`, { headers: auth() });
    assert.match(inl.headers.get('content-disposition'), /^inline/);

    r = await req('GET', `/test-cases/${tc.id}`);
    assert.equal(r.body.runs[0].attachments.length, 1);
    assert.equal(r.body.runs[0].attachments[0].name, 'screenshot.png');
    assert.equal((await req('POST', '/test-runs/99999/attachments', { name: 'a', data: 'YQ==' })).status, 404);

    await req('DELETE', `/test-runs/${run.id}`);
    assert.equal((await fetch(`${base}/attachments/${fileId}/download`, { headers: auth() })).status, 404);
  });

  test('migration: file biên bản họp ở bảng cũ được chuyển sang bảng chung', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-att-'));
    const file = join(dir, 'old.db');
    try {
      const first = openDb(file);
      const p = first.prepare("INSERT INTO projects (code, name) VALUES ('OLD', 'Cũ')").run().lastInsertRowid;
      const m = first
        .prepare("INSERT INTO meetings (project_id, title, meeting_date) VALUES (?, 'Họp', '2026-01-01')")
        .run(p).lastInsertRowid;
      first.exec(`CREATE TABLE meeting_attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER NOT NULL,
        name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
      first
        .prepare("INSERT INTO meeting_attachments (meeting_id, name, mime_type, size, data) VALUES (?, 'a.txt', 'text/plain', 2, ?)")
        .run(m, new Uint8Array([104, 105]));
      first.close();

      const again = openDb(file);
      const row = again.prepare('SELECT * FROM attachments WHERE meeting_id = ?').get(m);
      assert.equal(row.name, 'a.txt');
      assert.equal(Buffer.from(row.data).toString(), 'hi');
      assert.equal(
        again.prepare("SELECT 1 FROM sqlite_master WHERE name = 'meeting_attachments'").get(),
        undefined,
      );
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('categories', () => {
  test('danh mục con, chống vòng lặp, trùng tên, gán & lọc theo cây, xoá', async () => {
    const mk = async (body) => req('POST', '/categories', { project_id: P, ...body });
    const root = (await mk({ name: 'Backend' })).body;
    assert.equal(root.color, 'blue');
    const child = (await mk({ name: 'API', parent_id: root.id, color: 'green' })).body;
    const grand = (await mk({ name: 'Auth', parent_id: child.id })).body;
    assert.equal((await mk({ name: 'api', parent_id: root.id })).status, 400, 'trùng tên cùng cấp');
    assert.equal((await mk({ name: 'API' })).status, 201, 'trùng tên khác cấp được');
    assert.equal((await req('PATCH', `/categories/${root.id}`, { parent_id: grand.id })).status, 400, 'vòng lặp');
    assert.equal((await req('PATCH', `/categories/${root.id}`, { parent_id: root.id })).status, 400);
    const p2cat = (await req('POST', '/categories', { project_id: P2, name: 'Khác' })).body;
    assert.equal((await mk({ name: 'X', parent_id: p2cat.id })).status, 400, 'cha khác dự án');

    const t1 = (await req('POST', '/tasks', { project_id: P, title: 'CatT1', category_id: grand.id })).body;
    await req('POST', '/tasks', { project_id: P, title: 'CatT2', category_id: root.id });
    await req('POST', '/tasks', { project_id: P, title: 'CatT3' });
    assert.equal((await req('POST', '/tasks', { project_id: P, title: 'x', category_id: p2cat.id })).status, 400);
    await req('POST', '/bugs', { project_id: P, title: 'CatBug', category_id: child.id });
    await req('POST', '/test-cases', { project_id: P, title: 'CatTC', category_id: child.id });
    await req('POST', '/documents', { project_id: P, title: 'CatDoc', category_id: root.id });

    let r = await req('GET', `/tasks?project_id=${P}&q=CatT&category_id=${root.id}`);
    assert.deepEqual(r.body.items.map((t) => t.title).sort(), ['CatT1', 'CatT2'], 'gồm danh mục con');
    r = await req('GET', `/tasks?project_id=${P}&q=CatT&category_id=${child.id}`);
    assert.deepEqual(r.body.items.map((t) => t.title), ['CatT1']);
    r = await req('GET', `/tasks?project_id=${P}&q=CatT&category_id=none`);
    assert.deepEqual(r.body.items.map((t) => t.title), ['CatT3']);
    assert.equal((await req('GET', `/bugs?project_id=${P}&category_id=${root.id}`)).body.total, 1);
    assert.equal((await req('GET', `/test-cases?project_id=${P}&category_id=${root.id}`)).body.total, 1);
    assert.equal((await req('GET', `/documents?project_id=${P}&category_id=${root.id}`)).body.total, 1);

    r = await req('GET', `/categories?project_id=${P}&q=API`);
    const api = r.body.items.find((c) => c.id === child.id);
    assert.equal(api.bug_count, 1);
    assert.equal(api.test_case_count, 1);
    r = await req('GET', `/lookup?project_id=${P}`);
    assert.ok(r.body.categories.some((c) => c.id === grand.id && c.parent_id === child.id));
    r = await req('GET', `/test-report?project_id=${P}`);
    assert.ok(r.body.byCategory.some((c) => c.name === 'API' && c.total === 1));

    // xoá danh mục: danh mục con lên cấp gốc, mục bên trong thành "chưa phân loại"
    await req('DELETE', `/categories/${child.id}`);
    assert.equal((await req('GET', `/categories/${grand.id}`)).body.parent_id, null);
    assert.equal((await req('GET', `/tasks/${t1.id}`)).body.category_id, grand.id);
    r = await req('GET', `/bugs?project_id=${P}&q=CatBug`);
    assert.equal(r.body.items[0].category_id, null);
  });
});

describe('history', () => {
  test('ghi lại tạo / sửa (kèm giá trị cũ-mới) / liên kết / chạy test / xoá, có người thực hiện', async () => {
    const headers = { 'Content-Type': 'application/json', ...auth() };
    const call = async (method, path, body) => {
      const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, body: res.status === 204 ? null : await res.json() };
    };
    const ms = (await call('POST', '/milestones', { project_id: P, name: 'MS hist', due_date: '2026-12-01' })).body;
    const t = (await call('POST', '/tasks', { project_id: P, title: 'Hist task', priority: 'low' })).body;
    const doc = (await call('POST', '/documents', { project_id: P, title: 'Hist doc' })).body;
    await call('PATCH', `/tasks/${t.id}`, { priority: 'high', title: 'Hist task 2', milestone_id: ms.id, document_ids: [doc.id] });
    await call('PATCH', `/tasks/${t.id}`, { priority: 'high' }); // không đổi -> không ghi
    const other = (await call('POST', '/tasks', { project_id: P, title: 'Hist other' })).body;
    await call('POST', `/tasks/${t.id}/links`, { other_task_id: other.id, type: 'depends_on' });

    let r = await req('GET', `/history?entity=tasks&entity_id=${t.id}`);
    assert.deepEqual(r.body.items.map((h) => h.action), ['link', 'update', 'create']);
    const me = (await req('GET', '/auth/me')).body.name;
    assert.ok(r.body.items.every((h) => h.actor === me));
    const upd = r.body.items[1].changes;
    assert.deepEqual(upd.find((c) => c.field === 'priority'), { field: 'priority', from: 'low', to: 'high' });
    assert.equal(upd.find((c) => c.field === 'title').to, 'Hist task 2');
    assert.equal(upd.find((c) => c.field === 'milestone_id').toText, 'MS hist');
    assert.deepEqual(upd.find((c) => c.field === 'document_ids').added, [{ id: doc.id, label: 'Hist doc' }]);

    const tc = (await call('POST', '/test-cases', { project_id: P, title: 'Hist TC' })).body;
    await call('POST', `/test-cases/${tc.id}/runs`, { result: 'failed', note: 'lỗi' });
    r = await req('GET', `/history?entity=test-cases&entity_id=${tc.id}`);
    assert.match(r.body.items[0].summary, /Không đạt/);

    await call('DELETE', `/tasks/${other.id}`);
    r = await req('GET', `/history?project_id=${P}&limit=5`);
    assert.equal(r.body.items[0].action, 'delete');
    assert.match(r.body.items[0].summary, /Hist other/);

    const lan = (await call('POST', `/projects/${P}/members`, { name: 'Hist người', role: 'tester' })).body;
    r = await req('GET', `/history?entity=projects&entity_id=${P}`);
    assert.match(r.body.items[0].summary, /Hist người/);
    await call('PATCH', `/members/${lan.id}`, { position: 'QA' });
    r = await req('GET', `/history?entity=members&entity_id=${lan.id}`);
    assert.equal(r.body.items[0].project_id, null);
  });
});

describe('milestones', () => {
  test('tiến độ theo task, ràng buộc ngày & dự án, xoá milestone gỡ khỏi task', async () => {
    let r = await req('POST', '/milestones', { project_id: P, name: 'Thiếu hạn' });
    assert.equal(r.status, 400);
    r = await req('POST', '/milestones', { project_id: P, name: 'X', start_date: '2026-05-10', due_date: '2026-05-01' });
    assert.ok(r.body.details.due_date);
    const m = (await req('POST', '/milestones', { project_id: P, name: 'Release 1', due_date: '2026-06-30' })).body;
    assert.equal(m.status, 'planned');
    const a = (await req('POST', '/tasks', { project_id: P, title: 'M a', milestone_id: m.id, status: 'released' })).body;
    await req('POST', '/tasks', { project_id: P, title: 'M b', milestone_id: m.id });
    assert.equal((await req('POST', '/tasks', { project_id: P2, title: 'x', milestone_id: m.id })).status, 400);
    r = await req('GET', `/milestones?project_id=${P}&q=Release`);
    assert.equal(r.body.items[0].task_count, 2);
    assert.equal(r.body.items[0].done_count, 1);
    r = await req('GET', `/milestones/${m.id}`);
    assert.equal(r.body.tasks.length, 2);
    r = await req('PATCH', `/milestones/${m.id}`, { status: 'completed' });
    assert.ok(r.body.completed_at);
    assert.equal((await req('GET', `/tasks?project_id=${P}&milestone_id=${m.id}`)).body.total, 2);
    await req('DELETE', `/milestones/${m.id}`);
    assert.equal((await req('GET', `/tasks/${a.id}`)).body.milestone_id, null);
  });
});

describe('settings & deadline notifications', () => {
  test('cài đặt: kiểm tra giá trị, lưu, ghi lịch sử', async () => {
    let r = await req('GET', '/settings');
    assert.equal(r.body.settings.web_enabled, true);
    assert.equal(r.body.email.configured, false);
    r = await req('PUT', '/settings', { remind_days_before: 99, extra_emails: 'a@b.com, xx', email_hour: 25 });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.remind_days_before && r.body.details.extra_emails && r.body.details.email_hour);
    r = await req('PUT', '/settings', { web_enabled: false, extra_emails: 'boss@x.com;  qa@x.com' });
    assert.equal(r.body.settings.extra_emails, 'boss@x.com, qa@x.com');
    r = (await req('GET', '/notifications')).body;
    assert.equal(r.deadlineEnabled, false);
    assert.deepEqual(r.items, []);
    r = await req('GET', '/history?entity=settings');
    assert.ok(r.body.items[0].changes.some((c) => c.field === 'web_enabled'));
    await req('PUT', '/settings', { web_enabled: true, extra_emails: '' });
  });

  test('thông báo web & email: trễ / sắp đến hạn, người nhận, không gửi trùng trong ngày', async () => {
    const { runEmailNotifications, buildEmailDigests, getSettings } = await import('../src/notify.js');
    const { today } = await import('../src/resource.js');
    const d = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('sv');
    const p = (await req('POST', '/projects', { code: 'NTF', name: 'Notify' })).body.id;
    const pm = (await req('POST', `/projects/${p}/members`, { name: 'PM Ntf', email: 'pm@ntf.vn', role: 'pm' })).body;
    await req('POST', `/projects/${p}/members`, { name: 'Dev Ntf', email: 'dev@ntf.vn', role: 'developer' });
    const late = (await req('POST', '/tasks', { project_id: p, title: 'Trễ', assignee: 'dev ntf', due_date: d(-2) })).body;
    await req('POST', '/tasks', { project_id: p, title: 'Sắp hạn', assignee: 'Dev Ntf', due_date: d(1) });
    await req('POST', '/tasks', { project_id: p, title: 'Còn xa', assignee: 'Dev Ntf', due_date: d(10) });
    await req('POST', '/tasks', { project_id: p, title: 'Xong', assignee: 'Dev Ntf', due_date: d(-5), status: 'released' });
    await req('POST', '/milestones', { project_id: p, name: 'MS trễ', due_date: d(-1) });

    let r = await req('GET', `/notifications?project_id=${p}`);
    assert.deepEqual(r.body.items.map((i) => `${i.type}:${i.title}:${i.kind}`), [
      'task:Trễ:overdue',
      'milestone:MS trễ:overdue',
      'task:Sắp hạn:due_soon',
    ]);
    assert.equal(r.body.items[0].days, -2);

    const settings = { ...getSettings(db), email_enabled: true };
    const digests = buildEmailDigests(db, settings).filter((x) => x.to.endsWith('@ntf.vn'));
    const dev = digests.find((x) => x.to === 'dev@ntf.vn');
    const boss = digests.find((x) => x.to === 'pm@ntf.vn');
    assert.equal(dev.items.length, 2, 'dev nhận task của mình');
    assert.equal(boss.items.length, 3, 'PM nhận cả milestone');
    assert.match(dev.subject, /1 mục trễ hạn, 1 mục sắp đến hạn/);
    assert.match(dev.text, /TASK-\d+ Trễ/);

    // tắt email của PM
    await req('PATCH', `/members/${pm.id}`, { email_notifications: false });
    const sent = [];
    const mailer = { send: async (m) => sent.push(m) };
    let report = await runEmailNotifications(db, { mailer, settings });
    assert.ok(sent.some((m) => m.to === 'dev@ntf.vn'));
    assert.ok(!sent.some((m) => m.to === 'pm@ntf.vn'));
    const before = sent.length;
    report = await runEmailNotifications(db, { mailer, settings });
    assert.equal(sent.length, before, 'không gửi lại trong cùng ngày');
    assert.ok(report.skipped.some((x) => x.to === 'dev@ntf.vn'));
    await runEmailNotifications(db, { mailer, settings, force: true });
    assert.ok(sent.length > before, 'force gửi lại');
    assert.equal(today().length, 10);
    void late;

    // API: chưa cấu hình SMTP -> 400; xem trước vẫn được
    assert.equal((await req('POST', '/notifications/email/run', {})).status, 400);
    r = await req('POST', '/notifications/email/preview', {});
    assert.ok(r.body.digests.some((x) => x.to === 'dev@ntf.vn'));
  });
});

describe('auth', () => {
  test('bắt buộc đăng nhập; đăng nhập / đăng xuất; setup chỉ một lần', async () => {
    assert.equal((await req('GET', '/tasks', undefined, null)).status, 401);
    assert.equal((await req('GET', '/tasks', undefined, 'f'.repeat(64))).status, 401);
    assert.equal((await req('GET', '/health', undefined, null)).status, 200);
    assert.deepEqual((await req('GET', '/auth/status', undefined, null)).body, { needsSetup: false });
    assert.equal((await req('POST', '/auth/setup', { name: 'X', email: 'x@x.vn', password: '123456' }, null)).status, 403);

    let r = await req('POST', '/auth/login', { email: 'an.nguyen@example.com', password: 'sai' }, null);
    assert.equal(r.status, 401);
    r = await req('POST', '/auth/login', { email: ' AN.NGUYEN@example.com ', password: '123456', remember: true }, null);
    assert.equal(r.status, 200);
    assert.equal(r.body.user.name, 'Nguyễn Văn An');
    assert.equal(r.body.user.is_admin, true);
    assert.equal(r.body.user.tokenHash, undefined, 'không lộ hash');
    const t = r.body.token;
    assert.equal((await req('GET', '/auth/me', undefined, t)).body.email, 'an.nguyen@example.com');
    assert.equal((await req('POST', '/auth/logout', {}, t)).status, 204);
    assert.equal((await req('GET', '/auth/me', undefined, t)).status, 401, 'token hết hiệu lực sau khi đăng xuất');
    // DB chỉ lưu hash của token
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').get(t).n, 0);
  });

  test('khoá tạm sau 5 lần sai; đổi mật khẩu; quyền quản trị', async () => {
    for (let i = 0; i < 5; i++) await req('POST', '/auth/login', { email: 'dung.pham@example.com', password: 'sai' }, null);
    let r = await req('POST', '/auth/login', { email: 'dung.pham@example.com', password: '123456' }, null);
    assert.equal(r.status, 429);

    r = await req('POST', '/auth/login', { email: 'lan.vu@example.com', password: '123456' }, null);
    const lan = r.body;
    assert.equal(lan.user.is_admin, false);
    const other = (await req('POST', '/auth/login', { email: 'lan.vu@example.com', password: '123456' }, null)).body.token;
    r = await req('POST', '/auth/password', { current_password: 'sai', new_password: 'newpass1' }, lan.token);
    assert.equal(r.status, 400);
    r = await req('POST', '/auth/password', { current_password: '123456', new_password: '123' }, lan.token);
    assert.ok(r.body.details.new_password);
    assert.equal((await req('POST', '/auth/password', { current_password: '123456', new_password: 'newpass1' }, lan.token)).status, 204);
    assert.equal((await req('GET', '/auth/me', undefined, other)).status, 401, 'phiên khác bị đăng xuất');
    assert.equal((await req('GET', '/auth/me', undefined, lan.token)).status, 200, 'phiên hiện tại giữ nguyên');
    assert.equal((await req('POST', '/auth/login', { email: 'lan.vu@example.com', password: 'newpass1' }, null)).status, 200);

    // người không phải quản trị
    const members = (await req('GET', '/members?limit=50')).body.items;
    const an = members.find((m) => m.email === 'an.nguyen@example.com');
    const huy = members.find((m) => m.email === 'huy.hoang@example.com');
    assert.equal(an.has_account, 1);
    assert.equal(an.is_admin, 1);
    assert.equal((await req('PUT', `/members/${huy.id}/account`, { disabled: true }, lan.token)).status, 403);
    assert.equal((await req('PUT', '/settings', { web_enabled: true }, lan.token)).status, 403);
    assert.equal((await req('PATCH', `/members/${an.id}`, { email: 'hack@x.vn' }, lan.token)).status, 403);
    assert.equal((await req('PATCH', `/members/${huy.id}`, { position: 'Dev' }, lan.token)).status, 403, 'không sửa hồ sơ người khác');
    assert.equal((await req('PATCH', `/members/${lan.user.id}`, { position: 'Dev' }, lan.token)).status, 200, 'sửa hồ sơ của mình');

    // quản trị viên: khoá, mở khoá, cấp quyền, đặt mật khẩu, tạo tài khoản mới
    assert.equal((await req('PUT', `/members/${huy.id}/account`, { disabled: true })).status, 200);
    assert.equal((await req('POST', '/auth/login', { email: 'huy.hoang@example.com', password: '123456' }, null)).status, 403);
    r = await req('PUT', `/members/${huy.id}/account`, { disabled: false, is_admin: true, password: 'huy12345' });
    assert.equal(r.body.is_admin, 1);
    assert.equal((await req('POST', '/auth/login', { email: 'huy.hoang@example.com', password: 'huy12345' }, null)).status, 200);
    const noMail = (await req('POST', '/members', { name: 'Không email' })).body;
    assert.equal((await req('PUT', `/members/${noMail.id}/account`, { password: '123456' })).status, 400);
    const fresh = (await req('POST', '/members', { name: 'Mới', email: 'moi@x.vn' })).body;
    assert.equal((await req('PUT', `/members/${fresh.id}/account`, {})).status, 400, 'tài khoản mới cần mật khẩu');
    assert.equal((await req('PUT', `/members/${fresh.id}/account`, { password: 'moi12345' })).status, 200);
    assert.equal((await req('POST', '/auth/login', { email: 'moi@x.vn', password: 'moi12345' }, null)).status, 200);
    assert.equal((await req('DELETE', `/members/${fresh.id}/account`)).status, 204);
    assert.equal((await req('POST', '/auth/login', { email: 'moi@x.vn', password: 'moi12345' }, null)).status, 401);

    // không tự gỡ quyền / tự khoá; không xoá quản trị viên cuối cùng
    assert.equal((await req('PUT', `/members/${an.id}/account`, { is_admin: false })).status, 400);
    await req('PUT', `/members/${huy.id}/account`, { is_admin: false });
    assert.equal((await req('DELETE', `/members/${an.id}`)).status, 400);
    r = await req('GET', `/history?entity=members&entity_id=${huy.id}`);
    assert.ok(r.body.items.some((h) => /Tắt tài khoản \(Inactive\)/.test(h.summary ?? '')));
  });
});

describe('members status filter', () => {
  test('lọc thành viên theo trạng thái Active/Inactive và vai trò', async () => {
    const m = (await req('POST', '/members', { name: 'Chưa có TK', email: 'chuaco@x.vn' })).body;
    let r = await req('GET', '/members?status=inactive&limit=200');
    assert.ok(r.body.items.some((x) => x.id === m.id), 'chưa có tài khoản = inactive');
    await req('PUT', `/members/${m.id}/account`, { password: 'abc12345' });
    r = await req('GET', '/members?status=active&limit=200');
    assert.ok(r.body.items.some((x) => x.id === m.id));
    await req('PUT', `/members/${m.id}/account`, { disabled: true });
    r = await req('GET', '/members?status=inactive&limit=200');
    assert.ok(r.body.items.some((x) => x.id === m.id), 'bị tắt = inactive');
    r = await req('GET', '/members?role=admin&limit=200');
    assert.ok(r.body.items.every((x) => x.is_admin === 1));
    assert.ok(!(await req('GET', '/members?role=member&limit=200')).body.items.some((x) => x.is_admin === 1));
  });
});

describe('task workflow, creator, requester, status counts', () => {
  test('trạng thái mới, người tạo tự ghi, người yêu cầu, đếm theo trạng thái, mô tả HTML', async () => {
    const p = (await req('POST', '/projects', { code: 'WF', name: 'Workflow' })).body.id;
    const me = (await req('GET', '/auth/me')).body.name;
    let r = await req('POST', '/tasks', { project_id: p, title: 'WF1', requester: 'Khách hàng A', created_by: 'giả mạo' });
    assert.equal(r.body.created_by, me, 'người tạo lấy theo tài khoản, không nhận từ client');
    assert.equal(r.body.requester, 'Khách hàng A');
    assert.equal(r.body.status, 'todo');
    const t1 = r.body.id;
    assert.equal((await req('PATCH', `/tasks/${t1}`, { status: 'done' })).status, 400, 'trạng thái cũ không còn hợp lệ');
    for (const st of ['in_progress', 'done_dev', 'testing', 'ready_release']) {
      r = await req('PATCH', `/tasks/${t1}`, { status: st });
      assert.equal(r.body.completed_at, null, `${st} chưa đóng`);
    }
    r = await req('PATCH', `/tasks/${t1}`, { status: 'released' });
    assert.ok(r.body.completed_at);
    await req('POST', '/tasks', { project_id: p, title: 'WF2', status: 'canceled', due_date: '2020-01-01' });
    await req('POST', '/tasks', { project_id: p, title: 'WF3', status: 'testing', due_date: '2020-01-01' });
    await req('POST', '/tasks', { project_id: p, title: 'WF4', status: 'testing' });

    r = await req('GET', `/tasks?project_id=${p}&counts=status&status=testing`);
    assert.equal(r.body.total, 2, 'danh sách vẫn lọc theo trạng thái');
    assert.deepEqual(r.body.counts, { released: 1, canceled: 1, testing: 2 }, 'số lượng bỏ qua bộ lọc trạng thái');
    r = await req('GET', `/tasks?project_id=${p}&counts=status&q=WF3`);
    assert.deepEqual(r.body.counts, { testing: 1 }, 'số lượng theo các bộ lọc khác');
    r = await req('GET', `/tasks?project_id=${p}&overdue=true`);
    assert.deepEqual(r.body.items.map((t) => t.title), ['WF3'], 'task Canceled không tính trễ hạn');

    // mô tả HTML: lịch sử chỉ ghi "đã sửa nội dung"
    await req('PATCH', `/tasks/${t1}`, { description: '<p>Có <strong>bảng</strong></p><table><tr><td>1</td></tr></table>' });
    r = await req('GET', `/history?entity=tasks&entity_id=${t1}&limit=1`);
    assert.deepEqual(r.body.items[0].changes, [{ field: 'description', changed: true }]);

    // người tạo cho test case, bug
    assert.equal((await req('POST', '/test-cases', { project_id: p, title: 'TC' })).body.created_by, me);
    r = await req('POST', '/bugs', { project_id: p, title: 'B', reporter: 'Tester X' });
    assert.equal(r.body.created_by, me);
    assert.equal(r.body.reporter, 'Tester X');
    assert.equal((await req('GET', `/bugs?project_id=${p}&sort=reporter`)).status, 200);
  });

  test('migration: trạng thái task cũ được chuyển sang trạng thái mới', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-st-'));
    const file = join(dir, 'old.db');
    try {
      const first = openDb(file);
      const p = first.prepare("INSERT INTO projects (code, name) VALUES ('OLD', 'Cũ')").run().lastInsertRowid;
      first.prepare("INSERT INTO tasks (project_id, title, status) VALUES (?, 'a', 'review'), (?, 'b', 'done')").run(p, p);
      first.close();
      const again = openDb(file);
      assert.deepEqual(
        again.prepare('SELECT status FROM tasks ORDER BY id').all().map((r) => r.status),
        ['done_dev', 'released'],
      );
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('comments, avatar, status chips', () => {
  test('bình luận: chỉ thành viên dự án, sửa của mình, xoá của mình hoặc quản trị viên', async () => {
    const pay = (await req('GET', '/projects?q=PAY')).body.items.find((p) => p.code === 'PAY').id;
    const t = (await req('POST', '/tasks', { project_id: pay, title: 'Có bình luận' })).body;
    const login = async (email, pw = '123456') => (await req('POST', '/auth/login', { email, password: pw }, null)).body.token;
    const binh = await login('binh.tran@example.com'); // thành viên dự án PAY (BA)
    const tam = await login('tam.bui@example.com'); // không thuộc dự án PAY

    let r = await req('POST', '/comments', { entity: 'tasks', entity_id: t.id, body: '  Xin chào team  ' }, binh);
    assert.equal(r.status, 201);
    assert.equal(r.body.body, 'Xin chào team');
    assert.equal(r.body.author_name, 'Trần Thị Bình');
    assert.equal(r.body.author_email, 'binh.tran@example.com');
    const cid = r.body.id;
    assert.equal((await req('POST', '/comments', { entity: 'tasks', entity_id: t.id, body: 'x' }, tam)).status, 403);
    assert.equal((await req('POST', '/comments', { entity: 'tasks', entity_id: t.id, body: '   ' }, binh)).status, 400);
    assert.equal((await req('POST', '/comments', { entity: 'meetings', entity_id: 1, body: 'x' }, binh)).status, 400);
    assert.equal((await req('POST', '/comments', { entity: 'tasks', entity_id: t.id, body: 'Admin góp ý' })).status, 201, 'quản trị viên');

    assert.equal((await req('GET', `/comments?entity=tasks&entity_id=${t.id}`, undefined, tam)).status, 403, 'ngoài dự án không xem được');
    r = await req('GET', `/comments?entity=tasks&entity_id=${t.id}`, undefined, binh);
    assert.equal(r.body.length, 2);
    assert.equal((await req('GET', `/tasks/${t.id}`)).body.comment_count, 2);

    // Bình luận không sửa / xoá được, kể cả người viết hay quản trị viên
    assert.equal((await req('PATCH', `/comments/${cid}`, { body: 'Đã sửa' }, binh)).status, 404);
    assert.equal((await req('DELETE', `/comments/${cid}`, undefined, binh)).status, 404);
    assert.equal((await req('DELETE', `/comments/${cid}`)).status, 404);

    await req('DELETE', `/tasks/${t.id}`);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM comments WHERE entity = 'tasks' AND entity_id = ?").get(t.id).n, 0);
  });

  test('avatar thành viên & đếm theo trạng thái cho test case / bug', async () => {
    const m = (await req('POST', '/members', { name: 'Có avatar' })).body;
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    assert.equal((await req('PATCH', `/members/${m.id}`, { avatar: png })).body.avatar, png);
    assert.equal((await req('PATCH', `/members/${m.id}`, { avatar: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400, 'không nhận SVG');
    assert.equal((await req('PATCH', `/members/${m.id}`, { avatar: 'javascript:alert(1)' })).status, 400);
    assert.equal((await req('PATCH', `/members/${m.id}`, { avatar: null })).body.avatar, null);
    const lookup = (await req('GET', '/lookup')).body.allMembers;
    assert.ok('avatar' in lookup[0] && 'email' in lookup[0]);

    const pay = (await req('GET', '/projects?q=PAY')).body.items.find((p) => p.code === 'PAY').id;
    let r = await req('GET', `/test-cases?project_id=${pay}&counts=status&status=passed`);
    assert.ok(r.body.counts.failed >= 1 && r.body.counts.passed >= 1);
    assert.ok(r.body.items.every((x) => x.status === 'passed'));
    r = await req('GET', `/bugs?project_id=${pay}&counts=status`);
    assert.ok(r.body.counts.new >= 1);
  });
});

describe('comment replies & document attachments', () => {
  test('trả lời bình luận gắn vào bình luận gốc', async () => {
    const pay = (await req('GET', '/projects?q=PAY')).body.items.find((p) => p.code === 'PAY').id;
    const t = (await req('POST', '/tasks', { project_id: pay, title: 'Có trả lời' })).body;
    const other = (await req('POST', '/tasks', { project_id: pay, title: 'Task khác' })).body;
    const root = (await req('POST', '/comments', { entity: 'tasks', entity_id: t.id, body: 'Gốc' })).body;
    assert.equal(root.parent_id, null);
    const r1 = (await req('POST', '/comments', { entity: 'tasks', entity_id: t.id, body: 'Trả lời 1', parent_id: root.id })).body;
    assert.equal(r1.parent_id, root.id);
    // trả lời một câu trả lời -> vẫn gắn vào gốc
    const r2 = (await req('POST', '/comments', { entity: 'tasks', entity_id: t.id, body: 'Trả lời 2', parent_id: r1.id })).body;
    assert.equal(r2.parent_id, root.id);
    // không trả lời được bình luận của mục khác / không tồn tại
    assert.equal((await req('POST', '/comments', { entity: 'tasks', entity_id: other.id, body: 'x', parent_id: root.id })).status, 400);
    assert.equal((await req('POST', '/comments', { entity: 'tasks', entity_id: t.id, body: 'x', parent_id: 999999 })).status, 400);
    assert.equal((await req('GET', `/comments?entity=tasks&entity_id=${t.id}`)).body.length, 3);
    await req('DELETE', `/tasks/${t.id}`);
    assert.equal((await req('GET', `/comments?entity=tasks&entity_id=${t.id}`)).status, 404);
  });

  test('tài liệu: không còn người soạn, có link ngoài hoặc file đính kèm', async () => {
    const pay = (await req('GET', '/projects?q=PAY')).body.items.find((p) => p.code === 'PAY').id;
    const d = (await req('POST', '/documents', { project_id: pay, title: 'Chỉ có file', author: 'Ai đó' })).body;
    assert.ok(!d.author, 'bỏ trường người soạn');
    assert.ok(d.created_by);
    const data = Buffer.from('nội dung đặc tả').toString('base64');
    let r = await req('POST', `/documents/${d.id}/attachments`, { name: 'spec.txt', mime_type: 'text/plain', data });
    assert.equal(r.status, 201);
    assert.equal(r.body.document_id, d.id);
    const fileId = r.body.id;
    r = await req('GET', `/documents/${d.id}`);
    assert.equal(r.body.attachments.length, 1);
    assert.equal(r.body.attachment_count, 1);
    assert.equal((await req('POST', '/documents/999999/attachments', { name: 'a.txt', data })).status, 404);
    const hist = (await req('GET', `/history?entity=documents&entity_id=${d.id}`)).body;
    assert.ok(hist.items.some((h) => h.action === 'attach'));
    assert.equal((await req('DELETE', `/attachments/${fileId}`)).status, 204);
    await req('POST', `/documents/${d.id}/attachments`, { name: 'b.txt', data });
    await req('DELETE', `/documents/${d.id}`);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE document_id = ?').get(d.id).n, 0);
  });

  test('nâng cấp bảng attachments cũ (CHECK 2 cột) giữ nguyên dữ liệu', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'pm-')), 'old.db');
    const old = new DatabaseSync(file);
    old.exec(`CREATE TABLE meetings (id INTEGER PRIMARY KEY, title TEXT NOT NULL, meeting_date TEXT NOT NULL);
      CREATE TABLE attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER, test_run_id INTEGER, name TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'application/octet-stream', size INTEGER NOT NULL, data BLOB NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), CHECK ((meeting_id IS NULL) <> (test_run_id IS NULL)));
      INSERT INTO meetings (id, title, meeting_date) VALUES (1, 'Họp', '2026-01-01');
      INSERT INTO attachments (meeting_id, name, size, data) VALUES (1, 'a.txt', 1, x'41');`);
    old.close();
    const db2 = openDb(file);
    const row = db2.prepare('SELECT * FROM attachments').get();
    assert.equal(row.name, 'a.txt');
    assert.equal(row.document_id, null);
    db2.close();
    rmSync(dirname(file), { recursive: true, force: true });
  });
});

describe('phân quyền thành viên & @nhắc tên', () => {
  const projectId = async (code) => (await req('GET', `/projects?q=${code}`)).body.items.find((p) => p.code === code).id;
  const loginAs = async (email) => (await req('POST', '/auth/login', { email, password: '123456' }, null)).body.token;

  test('thành viên chỉ thấy dự án của mình, chỉ quản trị viên quản lý dự án / thành viên', async () => {
    const pay = await projectId('PAY');
    const crm = await projectId('CRM');
    const m = (await req('POST', '/members', { name: 'Chỉ CRM', email: 'only.crm@x.vn' })).body;
    await req('PUT', `/members/${m.id}/account`, { password: '123456' });
    await req('POST', `/projects/${crm}/members`, { member_id: m.id, role: 'developer' });
    const tok = await loginAs('only.crm@x.vn');

    let r = await req('GET', '/projects', undefined, tok);
    assert.deepEqual(r.body.items.map((p) => p.code), ['CRM']);
    assert.equal((await req('GET', `/projects/${pay}`, undefined, tok)).status, 403);
    assert.deepEqual((await req('GET', '/lookup', undefined, tok)).body.projects.map((p) => p.code), ['CRM']);
    assert.equal((await req('GET', `/lookup?project_id=${pay}`, undefined, tok)).status, 403);
    assert.equal((await req('GET', `/dashboard?project_id=${pay}`, undefined, tok)).status, 403);
    assert.equal((await req('GET', `/tasks?project_id=${pay}`, undefined, tok)).body.total, 0);
    r = await req('GET', '/tasks?limit=500', undefined, tok);
    assert.ok(r.body.items.length > 0 && r.body.items.every((t) => t.project_id === crm), 'không lọc dự án: chỉ thấy CRM');
    const payTask = (await req('GET', `/tasks?project_id=${pay}&limit=1`)).body.items[0];
    assert.equal((await req('GET', `/tasks/${payTask.id}`, undefined, tok)).status, 403);
    assert.equal((await req('PATCH', `/tasks/${payTask.id}`, { title: 'hack' }, tok)).status, 403);
    assert.equal((await req('POST', '/tasks', { project_id: pay, title: 'x' }, tok)).status, 403);
    assert.equal((await req('GET', `/history?project_id=${pay}`, undefined, tok)).body.total, 0);
    // Trong dự án của mình vẫn làm việc bình thường
    assert.equal((await req('POST', '/tasks', { project_id: crm, title: 'Task của tôi' }, tok)).status, 201);
    // Chỉ quản trị viên: dự án, thành viên dự án, danh mục, milestone, danh sách thành viên, Gantt
    assert.equal((await req('POST', '/projects', { code: 'NEWX', name: 'X' }, tok)).status, 403);
    assert.equal((await req('PATCH', `/projects/${crm}`, { name: 'Đổi tên' }, tok)).status, 403);
    assert.equal((await req('POST', `/projects/${crm}/members`, { name: 'Ai đó' }, tok)).status, 403);
    assert.equal((await req('POST', '/categories', { project_id: crm, name: 'C' }, tok)).status, 403);
    assert.equal((await req('POST', '/milestones', { project_id: crm, name: 'M', due_date: '2026-12-01' }, tok)).status, 403);
    assert.equal((await req('GET', '/categories?project_id=' + crm, undefined, tok)).status, 200, 'vẫn xem được');
    assert.equal((await req('GET', '/members', undefined, tok)).status, 403);
    assert.equal((await req('GET', `/members/${m.id}`, undefined, tok)).status, 200, 'xem hồ sơ của mình');
    assert.equal((await req('GET', '/gantt', undefined, tok)).status, 403);
    const names = (await req('GET', '/lookup', undefined, tok)).body.allMembers.map((x) => x.name);
    assert.ok(names.includes('Chỉ CRM') && !names.includes('Hoàng Gia Huy'), 'chỉ thấy người cùng dự án');
  });

  test('@nhắc tên tạo thông báo web và gửi email', async () => {
    const sent = [];
    const mailer = { from: 'x', send: async (m) => sent.push(m) };
    const app2 = createApp(db, { mailer, appUrl: 'https://pm.example.com' });
    const server = app2.listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call2 = async (method, path, body, token) => {
      const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: res.status === 204 ? null : await res.json() };
    };
    try {
      const pay = await projectId('PAY');
      const t = (await req('POST', '/tasks', { project_id: pay, title: 'Nhắc tên' })).body;
      const binh = await loginAs('binh.tran@example.com');
      const chau = await loginAs('chau.le@example.com');
      assert.ok(chau);
      const r = await call2(
        'POST',
        '/comments',
        { entity: 'tasks', entity_id: t.id, body: '@Lê Minh Châu và @Phạm Thu Dung xem giúp. @Trần Thị Bình tự nhắc. @Lê Minh Châux' },
        binh,
      );
      assert.equal(r.status, 201);
      assert.deepEqual(r.body.mentioned.map((x) => x.name).sort(), ['Lê Minh Châu', 'Phạm Thu Dung']);
      await new Promise((res) => setTimeout(res, 20));
      assert.deepEqual(sent.map((m) => m.to).sort(), ['chau.le@example.com', 'dung.pham@example.com']);
      assert.match(sent[0].subject, /Trần Thị Bình đã nhắc đến bạn trong TASK-/);
      assert.match(sent[0].text, /https:\/\/pm\.example\.com\/tasks\/\d+\?tab=comments/);

      let n = (await req('GET', '/notifications', undefined, chau)).body;
      assert.equal(n.unreadMentions, 1);
      assert.equal(n.mentions[0].actor, 'Trần Thị Bình');
      assert.equal(n.mentions[0].entity_id, t.id);
      await req('POST', '/notifications/mentions/read', { ids: [n.mentions[0].id] }, chau);
      n = (await req('GET', '/notifications', undefined, chau)).body;
      assert.equal(n.unreadMentions, 0);
      assert.equal((await req('GET', '/notifications', undefined, binh)).body.mentions.length, 0, 'không tự thông báo cho mình');

      // Tắt email @nhắc tên trong cài đặt
      await req('PUT', '/settings', { mention_email: false });
      sent.length = 0;
      await call2('POST', '/comments', { entity: 'tasks', entity_id: t.id, body: '@Lê Minh Châu lần 2' }, binh);
      await new Promise((res) => setTimeout(res, 20));
      assert.equal(sent.length, 0);
      assert.equal((await req('GET', '/notifications', undefined, chau)).body.unreadMentions, 1, 'vẫn có thông báo web');
      await req('PUT', '/settings', { mention_email: true });
      await req('DELETE', `/tasks/${t.id}`);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mentions WHERE entity_id = ? AND entity = ?').get(t.id, 'tasks').n, 0);
    } finally {
      server.close();
    }
  });
});
