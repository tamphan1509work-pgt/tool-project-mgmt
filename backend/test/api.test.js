import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const req = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
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
    r = await req('PATCH', `/tasks/${id}`, { status: 'done' });
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
      headers: { 'Content-Type': 'application/json' },
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
    await req('POST', '/tasks', { project_id: p, title: 'Xong rồi', assignee: 'Ngô Bảo', status: 'done' });
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

    const dl = await fetch(`${base}/attachments/${fileId}/download`);
    assert.equal(dl.status, 200);
    assert.equal(await dl.text(), content);
    assert.match(dl.headers.get('content-disposition'), /^attachment;.*filename\*=UTF-8''/);
    // file không phải ảnh thì không hiển thị inline
    const inl = await fetch(`${base}/attachments/${fileId}/download?inline=1`);
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
    assert.equal((await fetch(`${base}/attachments/${fileId}/download`)).status, 404);
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
        headers: { 'Content-Type': 'application/json' },
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
    const s1 = (await req('POST', '/tasks', { project_id: P, title: 'ZqSub 1', parent_id: parent, status: 'done' })).body.id;
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
    await req('PATCH', `/tasks/${b}`, { status: 'done' });
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
    const inl = await fetch(`${base}/attachments/${fileId}/download?inline=1`);
    assert.match(inl.headers.get('content-disposition'), /^inline/);

    r = await req('GET', `/test-cases/${tc.id}`);
    assert.equal(r.body.runs[0].attachments.length, 1);
    assert.equal(r.body.runs[0].attachments[0].name, 'screenshot.png');
    assert.equal((await req('POST', '/test-runs/99999/attachments', { name: 'a', data: 'YQ==' })).status, 404);

    await req('DELETE', `/test-runs/${run.id}`);
    assert.equal((await fetch(`${base}/attachments/${fileId}/download`)).status, 404);
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
