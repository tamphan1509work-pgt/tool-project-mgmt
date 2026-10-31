import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import { seed } from '../src/seed.js';

let server;
let base;
let db;

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
});

after(() => {
  server.close();
  db.close();
});

describe('meetings', () => {
  test('tạo, đọc, sửa, xoá', async () => {
    let r = await req('POST', '/meetings', { title: 'Họp A', meeting_date: '2026-01-05', start_time: '09:00' });
    assert.equal(r.status, 201);
    const id = r.body.id;
    assert.equal(r.body.title, 'Họp A');

    r = await req('PATCH', `/meetings/${id}`, { decisions: 'Chốt phạm vi' });
    assert.equal(r.status, 200);
    assert.equal(r.body.decisions, 'Chốt phạm vi');
    assert.equal(r.body.title, 'Họp A');

    await req('POST', '/tasks', { title: 'Action item', meeting_id: id });
    r = await req('GET', `/meetings/${id}`);
    assert.equal(r.body.action_items.length, 1);

    r = await req('DELETE', `/meetings/${id}`);
    assert.equal(r.status, 204);
    r = await req('GET', `/meetings/${id}`);
    assert.equal(r.status, 404);

    // task vẫn còn, liên kết bị gỡ
    r = await req('GET', '/tasks?q=Action item');
    assert.equal(r.body.items[0].meeting_id, null);
  });

  test('validate dữ liệu', async () => {
    const r = await req('POST', '/meetings', { title: '', meeting_date: '2026-13-45', start_time: '25:00' });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.title);
    assert.ok(r.body.details.meeting_date);
    assert.ok(r.body.details.start_time);
  });
});

describe('tasks', () => {
  test('giá trị mặc định, completed_at, lọc & sắp xếp', async () => {
    let r = await req('POST', '/tasks', { title: 'Task 1', priority: 'low' });
    assert.equal(r.body.status, 'todo');
    const id = r.body.id;

    r = await req('PATCH', `/tasks/${id}`, { status: 'done' });
    assert.ok(r.body.completed_at);
    r = await req('PATCH', `/tasks/${id}`, { status: 'in_progress' });
    assert.equal(r.body.completed_at, null);

    await req('POST', '/tasks', { title: 'Task 2', priority: 'critical' });
    r = await req('GET', '/tasks?sort=priority&order=desc&priority=low,critical');
    assert.deepEqual(
      r.body.items.map((t) => t.priority),
      ['critical', 'low'],
    );
  });

  test('từ chối enum / liên kết sai và hạn trước ngày bắt đầu', async () => {
    let r = await req('POST', '/tasks', { title: 'X', status: 'foo', meeting_id: 99999 });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.status);
    assert.ok(r.body.details.meeting_id);

    r = await req('POST', '/tasks', { title: 'X', start_date: '2026-02-10', due_date: '2026-02-01' });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.due_date);
  });

  test('tìm theo mã', async () => {
    const { body } = await req('POST', '/tasks', { title: 'Tìm tôi' });
    const r = await req('GET', `/tasks?q=TASK-${body.id}`);
    assert.ok(r.body.items.some((t) => t.id === body.id));
  });
});

describe('test cases & runs', () => {
  test('chạy test cập nhật trạng thái; xoá lần chạy thì đồng bộ lại', async () => {
    let r = await req('POST', '/test-cases', { title: 'Login OK', module: 'Auth' });
    assert.equal(r.body.status, 'not_run');
    const id = r.body.id;

    r = await req('POST', `/test-cases/${id}/runs`, { result: 'failed', note: 'Lỗi 500' });
    assert.equal(r.status, 201);
    const failRun = r.body.id;
    await req('POST', `/test-cases/${id}/runs`, { result: 'passed' });

    r = await req('GET', `/test-cases/${id}`);
    assert.equal(r.body.status, 'passed');
    assert.equal(r.body.runs.length, 2);

    const passRun = r.body.runs.find((x) => x.result === 'passed').id;
    await req('DELETE', `/test-runs/${passRun}`);
    r = await req('GET', `/test-cases/${id}`);
    assert.equal(r.body.status, 'failed');
    await req('DELETE', `/test-runs/${failRun}`);
    r = await req('GET', `/test-cases/${id}`);
    assert.equal(r.body.status, 'not_run');
    assert.equal(r.body.last_run_at, null);

    r = await req('POST', `/test-cases/${id}/runs`, { result: 'not_run' });
    assert.equal(r.status, 400);
  });
});

describe('bugs', () => {
  test('resolved_at và liên kết test case', async () => {
    const tc = (await req('POST', '/test-cases', { title: 'TC bug' })).body;
    let r = await req('POST', '/bugs', { title: 'Bug 1', severity: 'blocker', test_case_id: tc.id });
    assert.equal(r.body.status, 'new');
    const id = r.body.id;

    r = await req('PATCH', `/bugs/${id}`, { status: 'resolved' });
    assert.ok(r.body.resolved_at);
    r = await req('GET', `/bugs/${id}`);
    assert.equal(r.body.test_case.id, tc.id);

    r = await req('GET', '/bugs?open=true');
    assert.ok(!r.body.items.some((b) => b.id === id));
  });
});

describe('misc', () => {
  test('dashboard, lookup, seed', async () => {
    seed(db, { reset: true });
    let r = await req('GET', '/dashboard');
    assert.equal(r.status, 200);
    assert.equal(r.body.counts.meetings, 3);
    assert.ok(r.body.counts.openBugs > 0);

    r = await req('GET', '/lookup');
    assert.ok(r.body.people.includes('Phạm Thu Dung'));
    assert.ok(r.body.modules.includes('Thanh toán'));
  });

  test('lỗi JSON và route không tồn tại', async () => {
    const res = await fetch(base + '/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    assert.equal(res.status, 400);
    const r = await req('GET', '/nope');
    assert.equal(r.status, 404);
  });
});
