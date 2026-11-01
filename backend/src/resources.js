import { HttpError, today } from './resource.js';

export const ENUMS = {
  priority: ['low', 'medium', 'high', 'critical'],
  taskStatus: ['todo', 'in_progress', 'review', 'done'],
  testType: ['functional', 'integration', 'regression', 'smoke', 'performance', 'security', 'ui'],
  testStatus: ['not_run', 'passed', 'failed', 'blocked'],
  testResult: ['passed', 'failed', 'blocked'],
  bugSeverity: ['minor', 'major', 'critical', 'blocker'],
  bugStatus: ['new', 'in_progress', 'resolved', 'closed', 'reopened', 'rejected'],
  projectStatus: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
  memberRole: ['pm', 'ba', 'tech_lead', 'developer', 'tester', 'designer', 'devops', 'stakeholder'],
  documentType: ['design', 'specification'],
  documentStatus: ['draft', 'in_review', 'approved', 'obsolete'],
};

// project_id: bắt buộc khi tạo, không đổi được sau đó
const projectRef = { type: 'ref', table: 'projects', required: true, createOnly: true };

const rank = (col, values) =>
  `CASE ${col} ${values.map((v, i) => `WHEN '${v}' THEN ${i}`).join(' ')} ELSE -1 END`;

const timestamps = { created_at: 'created_at', updated_at: 'updated_at' };

/** Task được giao cho một người: so khớp theo tên (bỏ khoảng trắng thừa, không phân biệt hoa thường) */
export const ASSIGNED = (col, nameExpr) => `lower(trim(${col})) = lower(trim(${nameExpr}))`;

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export const meetings = {
  table: 'meetings',
  label: 'cuộc họp',
  fields: {
    project_id: projectRef,
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
  filterable: ['project_id'],
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
    project_id: projectRef,
    title: { type: 'string', required: true },
    description: { type: 'text' },
    status: { type: 'enum', values: ENUMS.taskStatus, default: 'todo' },
    priority: { type: 'enum', values: ENUMS.priority, default: 'medium' },
    assignee: { type: 'string' },
    start_date: { type: 'date' },
    due_date: { type: 'date' },
    estimate_hours: { type: 'number' },
    meeting_id: { type: 'ref', table: 'meetings', sameProject: true },
    document_ids: {
      type: 'refs',
      table: 'documents',
      joinTable: 'task_documents',
      ownKey: 'task_id',
      otherKey: 'document_id',
      sameProject: true,
    },
  },
  searchable: ['title', 'description', 'assignee'],
  filterable: ['project_id', 'status', 'priority', 'assignee', 'meeting_id'],
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
      ...linkedDocuments(db, row.id),
    };
  },
};

export const testCases = {
  table: 'test_cases',
  label: 'test case',
  fields: {
    project_id: projectRef,
    title: { type: 'string', required: true },
    module: { type: 'string' },
    type: { type: 'enum', values: ENUMS.testType, default: 'functional' },
    priority: { type: 'enum', values: ENUMS.priority, default: 'medium' },
    status: { type: 'enum', values: ENUMS.testStatus, default: 'not_run' },
    preconditions: { type: 'text' },
    steps: { type: 'text' },
    expected_result: { type: 'text' },
    task_id: { type: 'ref', table: 'tasks', sameProject: true },
  },
  searchable: ['title', 'module', 'steps', 'expected_result'],
  filterable: ['project_id', 'status', 'priority', 'type', 'module', 'task_id'],
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
    project_id: projectRef,
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
    test_case_id: { type: 'ref', table: 'test_cases', sameProject: true },
    task_id: { type: 'ref', table: 'tasks', sameProject: true },
  },
  searchable: ['title', 'description', 'steps_to_reproduce', 'actual_result', 'environment', 'assignee', 'reporter'],
  filterable: ['project_id', 'status', 'severity', 'priority', 'assignee', 'test_case_id', 'task_id'],
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

function linkedDocuments(db, taskId) {
  const documents = db
    .prepare(
      `SELECT d.id, d.title, d.type, d.version, d.status, d.url FROM documents d
       JOIN task_documents td ON td.document_id = d.id WHERE td.task_id = ? ORDER BY d.type, d.title`,
    )
    .all(taskId);
  return { documents, document_ids: documents.map((d) => d.id) };
}

const endAfterStart = (data, existing) => {
  const start = data.start_date !== undefined ? data.start_date : existing?.start_date;
  const end = data.end_date !== undefined ? data.end_date : existing?.end_date;
  if (start && end && end < start) {
    throw new HttpError(400, 'Dữ liệu không hợp lệ', { end_date: 'Ngày kết thúc không được trước ngày bắt đầu' });
  }
};

export const projects = {
  table: 'projects',
  label: 'dự án',
  fields: {
    code: {
      type: 'string',
      required: true,
      uppercase: true,
      max: 12,
      pattern: /^[A-Z][A-Z0-9_-]{1,11}$/,
      patternMessage: 'Mã dự án 2–12 ký tự, bắt đầu bằng chữ cái, chỉ gồm chữ, số, - và _',
    },
    name: { type: 'string', required: true },
    description: { type: 'text' },
    status: { type: 'enum', values: ENUMS.projectStatus, default: 'active' },
    start_date: { type: 'date' },
    end_date: { type: 'date' },
  },
  selectExtra: `
    (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = projects.id) AS member_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = projects.id) AS task_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = projects.id AND t.status <> 'done') AS open_task_count,
    (SELECT COUNT(*) FROM bugs b WHERE b.project_id = projects.id AND b.status IN ('new','in_progress','reopened')) AS open_bug_count`,
  searchable: ['code', 'name', 'description'],
  filterable: ['status'],
  sortable: {
    code: 'code',
    name: 'name',
    status: rank('status', ENUMS.projectStatus),
    start_date: "COALESCE(start_date, '')",
    end_date: "COALESCE(end_date, '')",
    ...timestamps,
  },
  defaultSort: 'created_at',
  beforeSave: endAfterStart,
  expand(db, row) {
    const one = (sql) => db.prepare(sql).get(row.id).n;
    return {
      members: projectMembers(db, row.id),
      stats: {
        meetings: one('SELECT COUNT(*) AS n FROM meetings WHERE project_id = ?'),
        tasks: one('SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?'),
        doneTasks: one("SELECT COUNT(*) AS n FROM tasks WHERE project_id = ? AND status = 'done'"),
        testCases: one('SELECT COUNT(*) AS n FROM test_cases WHERE project_id = ?'),
        passedTests: one("SELECT COUNT(*) AS n FROM test_cases WHERE project_id = ? AND status = 'passed'"),
        bugs: one('SELECT COUNT(*) AS n FROM bugs WHERE project_id = ?'),
        openBugs: one("SELECT COUNT(*) AS n FROM bugs WHERE project_id = ? AND status IN ('new','in_progress','reopened')"),
        documents: one('SELECT COUNT(*) AS n FROM documents WHERE project_id = ?'),
      },
    };
  },
};

export function projectMembers(db, projectId) {
  return db
    .prepare(
      `SELECT m.id, m.name, m.email, m.phone, pm.role, pm.joined_at
       FROM project_members pm JOIN members m ON m.id = pm.member_id
       WHERE pm.project_id = ?
       ORDER BY ${rank('pm.role', ENUMS.memberRole)}, m.name`,
    )
    .all(projectId);
}

export const members = {
  table: 'members',
  label: 'thành viên',
  fields: {
    name: { type: 'string', required: true },
    email: {
      type: 'string',
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      patternMessage: 'Email không hợp lệ',
    },
    phone: { type: 'string', max: 30 },
    position: { type: 'string', max: 100 },
  },
  selectExtra: `
    (SELECT COUNT(*) FROM project_members pm WHERE pm.member_id = members.id) AS project_count,
    (SELECT COUNT(*) FROM tasks t WHERE ${ASSIGNED('t.assignee', 'members.name')} AND t.status <> 'done') AS open_task_count,
    (SELECT COUNT(*) FROM tasks t WHERE ${ASSIGNED('t.assignee', 'members.name')} AND t.status <> 'done'
       AND t.due_date < date('now', 'localtime')) AS overdue_task_count`,
  searchable: ['name', 'email', 'phone', 'position'],
  filterable: [],
  sortable: {
    name: 'name',
    position: "COALESCE(position, '')",
    project_count: 'project_count',
    open_task_count: 'open_task_count',
    ...timestamps,
  },
  defaultSort: 'name',
  defaultOrder: 'ASC',
  expand(db, row) {
    return {
      projects: db
        .prepare(
          `SELECT p.id, p.code, p.name, p.status, p.start_date, p.end_date, pm.role, pm.joined_at
           FROM project_members pm JOIN projects p ON p.id = pm.project_id
           WHERE pm.member_id = ? ORDER BY p.name`,
        )
        .all(row.id),
      tasks: db
        .prepare(
          `SELECT t.id, t.title, t.status, t.priority, t.start_date, t.due_date, t.project_id, p.code AS project_code
           FROM tasks t JOIN projects p ON p.id = t.project_id
           WHERE ${ASSIGNED('t.assignee', '?')}
           ORDER BY t.status = 'done', COALESCE(t.due_date, '9999-12-31'), t.id`,
        )
        .all(row.name),
    };
  },
  // Đổi tên thành viên -> cập nhật tên ở các nơi đang ghi tên người này
  afterUpdate(db, row, existing) {
    if (row.name === existing.name) return;
    for (const [table, col] of [
      ['tasks', 'assignee'],
      ['bugs', 'assignee'],
      ['bugs', 'reporter'],
      ['meetings', 'facilitator'],
      ['documents', 'author'],
      ['test_runs', 'executed_by'],
    ]) {
      db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${ASSIGNED(col, '?')}`).run(row.name, existing.name);
    }
  },
};

export const projectMember = {
  member_id: { type: 'ref', table: 'members' },
  name: { type: 'string' },
  email: members.fields.email,
  role: { type: 'enum', values: ENUMS.memberRole, default: 'developer' },
};

export const documents = {
  table: 'documents',
  label: 'tài liệu',
  fields: {
    project_id: projectRef,
    title: { type: 'string', required: true },
    type: { type: 'enum', values: ENUMS.documentType, default: 'specification' },
    version: { type: 'string', max: 30 },
    status: { type: 'enum', values: ENUMS.documentStatus, default: 'draft' },
    url: { type: 'url' },
    author: { type: 'string' },
    description: { type: 'text' },
  },
  selectExtra:
    '(SELECT COUNT(*) FROM task_documents td WHERE td.document_id = documents.id) AS task_count',
  searchable: ['title', 'description', 'author', 'version'],
  filterable: ['project_id', 'type', 'status', 'author'],
  sortable: {
    title: 'title',
    type: 'type',
    status: rank('status', ENUMS.documentStatus),
    version: "COALESCE(version, '')",
    ...timestamps,
  },
  defaultSort: 'updated_at',
  expand(db, row) {
    return {
      tasks: db
        .prepare(
          `SELECT t.id, t.title, t.status, t.assignee FROM tasks t
           JOIN task_documents td ON td.task_id = t.id WHERE td.document_id = ? ORDER BY t.id`,
        )
        .all(row.id),
    };
  },
};

function DATE(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
