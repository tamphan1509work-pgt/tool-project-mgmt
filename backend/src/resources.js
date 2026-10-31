import { HttpError, today } from './resource.js';

export const ENUMS = {
  priority: ['low', 'medium', 'high', 'critical'],
  taskStatus: ['todo', 'in_progress', 'review', 'done'],
  testType: ['functional', 'integration', 'regression', 'smoke', 'performance', 'security', 'ui'],
  testStatus: ['not_run', 'passed', 'failed', 'blocked'],
  testResult: ['passed', 'failed', 'blocked'],
  bugSeverity: ['minor', 'major', 'critical', 'blocker'],
  bugStatus: ['new', 'in_progress', 'resolved', 'closed', 'reopened', 'rejected'],
};

const rank = (col, values) =>
  `CASE ${col} ${values.map((v, i) => `WHEN '${v}' THEN ${i}`).join(' ')} ELSE -1 END`;

const timestamps = { created_at: 'created_at', updated_at: 'updated_at' };

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export const meetings = {
  table: 'meetings',
  label: 'cuộc họp',
  fields: {
    title: { type: 'string', required: true },
    meeting_date: { type: 'date', required: true },
    start_time: { type: 'time' },
    location: { type: 'string' },
    facilitator: { type: 'string' },
    attendees: { type: 'text', max: 2000 },
    agenda: { type: 'text' },
    notes: { type: 'text', max: 100000 },
    decisions: { type: 'text' },
  },
  searchable: ['title', 'attendees', 'agenda', 'notes', 'decisions', 'location'],
  filterable: [],
  sortable: { meeting_date: "meeting_date || ' ' || COALESCE(start_time, '')", title: 'title', ...timestamps },
  defaultSort: 'meeting_date',
  extraFilters(query, where, params) {
    if (DATE(query.from)) {
      where.push('meeting_date >= ?');
      params.push(query.from);
    }
    if (DATE(query.to)) {
      where.push('meeting_date <= ?');
      params.push(query.to);
    }
  },
  expand(db, row) {
    return {
      action_items: db
        .prepare('SELECT id, title, status, priority, assignee, due_date FROM tasks WHERE meeting_id = ? ORDER BY id')
        .all(row.id),
    };
  },
};

export const tasks = {
  table: 'tasks',
  label: 'task',
  fields: {
    title: { type: 'string', required: true },
    description: { type: 'text' },
    status: { type: 'enum', values: ENUMS.taskStatus, default: 'todo' },
    priority: { type: 'enum', values: ENUMS.priority, default: 'medium' },
    assignee: { type: 'string' },
    start_date: { type: 'date' },
    due_date: { type: 'date' },
    estimate_hours: { type: 'number' },
    meeting_id: { type: 'ref', table: 'meetings' },
  },
  searchable: ['title', 'description', 'assignee'],
  filterable: ['status', 'priority', 'assignee', 'meeting_id'],
  sortable: {
    due_date: "COALESCE(due_date, '9999-12-31')",
    priority: rank('priority', ENUMS.priority),
    status: rank('status', ENUMS.taskStatus),
    title: 'title',
    ...timestamps,
  },
  defaultSort: 'created_at',
  extraFilters(query, where, params) {
    if (query.overdue === 'true') {
      where.push("due_date < ? AND status <> 'done'");
      params.push(today());
    }
  },
  beforeSave(data, existing) {
    if (data.start_date !== undefined || data.due_date !== undefined) {
      const start = data.start_date !== undefined ? data.start_date : existing?.start_date;
      const due = data.due_date !== undefined ? data.due_date : existing?.due_date;
      if (start && due && due < start) {
        throw new HttpError(400, 'Dữ liệu không hợp lệ', {
          due_date: 'Hạn hoàn thành không được trước ngày bắt đầu',
        });
      }
    }
    if (data.status !== undefined && data.status !== existing?.status) {
      data.completed_at = data.status === 'done' ? nowSql() : null;
    }
  },
  expand(db, row) {
    return {
      meeting: row.meeting_id
        ? db.prepare('SELECT id, title, meeting_date FROM meetings WHERE id = ?').get(row.meeting_id) ?? null
        : null,
      test_cases: db
        .prepare('SELECT id, title, status, priority FROM test_cases WHERE task_id = ? ORDER BY id')
        .all(row.id),
      bugs: db
        .prepare('SELECT id, title, status, severity FROM bugs WHERE task_id = ? ORDER BY id')
        .all(row.id),
    };
  },
};

export const testCases = {
  table: 'test_cases',
  label: 'test case',
  fields: {
    title: { type: 'string', required: true },
    module: { type: 'string' },
    type: { type: 'enum', values: ENUMS.testType, default: 'functional' },
    priority: { type: 'enum', values: ENUMS.priority, default: 'medium' },
    status: { type: 'enum', values: ENUMS.testStatus, default: 'not_run' },
    preconditions: { type: 'text' },
    steps: { type: 'text' },
    expected_result: { type: 'text' },
    task_id: { type: 'ref', table: 'tasks' },
  },
  searchable: ['title', 'module', 'steps', 'expected_result'],
  filterable: ['status', 'priority', 'type', 'module', 'task_id'],
  sortable: {
    priority: rank('priority', ENUMS.priority),
    status: rank('status', ENUMS.testStatus),
    module: "COALESCE(module, '')",
    title: 'title',
    last_run_at: "COALESCE(last_run_at, '')",
    id: 'id',
    ...timestamps,
  },
  defaultSort: 'id',
  defaultOrder: 'ASC',
  expand(db, row) {
    return {
      task: row.task_id ? db.prepare('SELECT id, title, status FROM tasks WHERE id = ?').get(row.task_id) ?? null : null,
      runs: db
        .prepare('SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY executed_at DESC, id DESC LIMIT 100')
        .all(row.id),
      bugs: db
        .prepare('SELECT id, title, status, severity FROM bugs WHERE test_case_id = ? ORDER BY id DESC')
        .all(row.id),
    };
  },
};

export const testRuns = {
  result: { type: 'enum', values: ENUMS.testResult, required: true },
  note: { type: 'text' },
  executed_by: { type: 'string' },
};

export const bugs = {
  table: 'bugs',
  label: 'bug',
  fields: {
    title: { type: 'string', required: true },
    description: { type: 'text' },
    steps_to_reproduce: { type: 'text' },
    expected_result: { type: 'text' },
    actual_result: { type: 'text' },
    environment: { type: 'string' },
    severity: { type: 'enum', values: ENUMS.bugSeverity, default: 'major' },
    priority: { type: 'enum', values: ENUMS.priority, default: 'medium' },
    status: { type: 'enum', values: ENUMS.bugStatus, default: 'new' },
    assignee: { type: 'string' },
    reporter: { type: 'string' },
    test_case_id: { type: 'ref', table: 'test_cases' },
    task_id: { type: 'ref', table: 'tasks' },
  },
  searchable: ['title', 'description', 'steps_to_reproduce', 'actual_result', 'environment', 'assignee', 'reporter'],
  filterable: ['status', 'severity', 'priority', 'assignee', 'test_case_id', 'task_id'],
  sortable: {
    severity: rank('severity', ENUMS.bugSeverity),
    priority: rank('priority', ENUMS.priority),
    status: rank('status', ENUMS.bugStatus),
    title: 'title',
    ...timestamps,
  },
  defaultSort: 'created_at',
  extraFilters(query, where) {
    if (query.open === 'true') where.push("status IN ('new', 'in_progress', 'reopened')");
  },
  beforeSave(data, existing) {
    if (data.status !== undefined && data.status !== existing?.status) {
      data.resolved_at = ['resolved', 'closed'].includes(data.status) ? nowSql() : null;
      if (existing && data.status === 'closed' && existing.resolved_at) data.resolved_at = existing.resolved_at;
    }
  },
  expand(db, row) {
    return {
      test_case: row.test_case_id
        ? db.prepare('SELECT id, title, status FROM test_cases WHERE id = ?').get(row.test_case_id) ?? null
        : null,
      task: row.task_id ? db.prepare('SELECT id, title, status FROM tasks WHERE id = ?').get(row.task_id) ?? null : null,
    };
  },
};

function DATE(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
