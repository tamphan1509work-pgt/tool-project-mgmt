import { HttpError, today } from './resource.js';

export const ENUMS = {
  priority: ['low', 'medium', 'high', 'critical'],
  taskStatus: ['todo', 'in_progress', 'review', 'done'],
  testType: ['functional', 'integration', 'regression', 'smoke', 'performance', 'security', 'ui'],
  testStatus: ['not_run', 'passed', 'failed', 'blocked'],
  testResult: ['passed', 'failed', 'blocked'],
  bugSeverity: ['minor', 'major', 'critical', 'blocker'],
  bugStatus: ['new', 'in_progress', 'resolved', 'closed', 'reopened', 'rejected'],
  categoryColor: ['gray', 'blue', 'green', 'amber', 'red', 'purple'],
  milestoneStatus: ['planned', 'in_progress', 'completed', 'cancelled'],
  taskLinkType: ['depends_on', 'blocks', 'relates'],
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
  resource: 'meetings',
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
  selectExtra: '(SELECT COUNT(*) FROM attachments a WHERE a.meeting_id = meetings.id) AS attachment_count',
  expand(db, row) {
    return {
      attachments: db
        .prepare(
          'SELECT id, name, mime_type, size, created_at FROM attachments WHERE meeting_id = ? ORDER BY id',
        )
        .all(row.id),
      action_items: db
        .prepare('SELECT id, title, status, priority, assignee, due_date FROM tasks WHERE meeting_id = ? ORDER BY id')
        .all(row.id),
    };
  },
};

export const tasks = {
  table: 'tasks',
  resource: 'tasks',
  label: 'task',
  fields: {
    project_id: projectRef,
    title: { type: 'string', required: true },
    category_id: { type: 'ref', table: 'categories', sameProject: true },
    description: { type: 'text' },
    status: { type: 'enum', values: ENUMS.taskStatus, default: 'todo' },
    priority: { type: 'enum', values: ENUMS.priority, default: 'medium' },
    assignee: { type: 'string' },
    start_date: { type: 'date' },
    due_date: { type: 'date' },
    estimate_hours: { type: 'number' },
    meeting_id: { type: 'ref', table: 'meetings', sameProject: true },
    parent_id: { type: 'ref', table: 'tasks', sameProject: true },
    milestone_id: { type: 'ref', table: 'milestones', sameProject: true },
    document_ids: {
      type: 'refs',
      table: 'documents',
  resource: 'documents',
      joinTable: 'task_documents',
      ownKey: 'task_id',
      otherKey: 'document_id',
      sameProject: true,
    },
  },
  selectExtra: `
    (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = tasks.id) AS subtask_count,
    (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = tasks.id AND s.status = 'done') AS subtask_done_count,
    (SELECT pt.title FROM tasks pt WHERE pt.id = tasks.parent_id) AS parent_title,
    (SELECT COUNT(*) FROM task_links l JOIN tasks o ON o.id = l.other_task_id
       WHERE l.task_id = tasks.id AND l.type = 'depends_on' AND o.status <> 'done') AS blocked_by_count`,
  searchable: ['title', 'description', 'assignee'],
  filterable: ['project_id', 'status', 'priority', 'assignee', 'meeting_id', 'parent_id', 'milestone_id'],
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
  beforeSave(data, existing, db) {
    // Subtask: chỉ hỗ trợ 1 cấp (task cha không được là subtask, task có subtask không thể thành subtask)
    if (data.parent_id != null) {
      const err = (msg) => new HttpError(400, 'Dữ liệu không hợp lệ', { parent_id: msg });
      if (existing && data.parent_id === existing.id) throw err('Task không thể là task cha của chính nó');
      const parent = db.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(data.parent_id);
      if (parent?.parent_id) throw err('Task được chọn đã là subtask (chỉ hỗ trợ subtask 1 cấp)');
      if (existing && db.prepare('SELECT 1 FROM tasks WHERE parent_id = ?').get(existing.id)) {
        throw err('Task này đang có subtask nên không thể trở thành subtask');
      }
    }
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
      parent: row.parent_id
        ? db.prepare('SELECT id, title, status FROM tasks WHERE id = ?').get(row.parent_id) ?? null
        : null,
      milestone: row.milestone_id
        ? db.prepare('SELECT id, name, due_date, status FROM milestones WHERE id = ?').get(row.milestone_id) ?? null
        : null,
      subtasks: db
        .prepare(
          'SELECT id, title, status, priority, assignee, due_date FROM tasks WHERE parent_id = ? ORDER BY id',
        )
        .all(row.id),
      links: taskLinks(db, row.id),
    };
  },
};

/** Các liên kết của task, chia theo chiều: phụ thuộc vào / đang chặn / liên quan */
export function taskLinks(db, taskId) {
  const cols = 'l.id AS link_id, t.id, t.title, t.status, t.assignee, t.due_date';
  return {
    depends_on: db
      .prepare(
        `SELECT ${cols} FROM task_links l JOIN tasks t ON t.id = l.other_task_id
         WHERE l.task_id = ? AND l.type = 'depends_on' ORDER BY t.id`,
      )
      .all(taskId),
    blocks: db
      .prepare(
        `SELECT ${cols} FROM task_links l JOIN tasks t ON t.id = l.task_id
         WHERE l.other_task_id = ? AND l.type = 'depends_on' ORDER BY t.id`,
      )
      .all(taskId),
    relates: db
      .prepare(
        `SELECT ${cols} FROM task_links l
         JOIN tasks t ON t.id = CASE WHEN l.task_id = ? THEN l.other_task_id ELSE l.task_id END
         WHERE (l.task_id = ? OR l.other_task_id = ?) AND l.type = 'relates' ORDER BY t.id`,
      )
      .all(taskId, taskId, taskId),
  };
}

export const testCases = {
  table: 'test_cases',
  resource: 'test-cases',
  label: 'test case',
  fields: {
    project_id: projectRef,
    title: { type: 'string', required: true },
    category_id: { type: 'ref', table: 'categories', sameProject: true },
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
      runs: runsWithAttachments(db, row.id),
      bugs: db
        .prepare('SELECT id, title, status, severity FROM bugs WHERE test_case_id = ? ORDER BY id DESC')
        .all(row.id),
    };
  },
};

/** Lịch sử chạy test kèm file đính kèm (bằng chứng: ảnh chụp, log…) của từng lần chạy */
export function runsWithAttachments(db, testCaseId) {
  const runs = db
    .prepare('SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY executed_at DESC, id DESC LIMIT 100')
    .all(testCaseId);
  const files = db
    .prepare(
      `SELECT a.id, a.test_run_id, a.name, a.mime_type, a.size, a.created_at FROM attachments a
       JOIN test_runs r ON r.id = a.test_run_id WHERE r.test_case_id = ? ORDER BY a.id`,
    )
    .all(testCaseId);
  return runs.map((r) => ({ ...r, attachments: files.filter((f) => f.test_run_id === r.id) }));
}

export const testRuns = {
  result: { type: 'enum', values: ENUMS.testResult, required: true },
  note: { type: 'text' },
  executed_by: { type: 'string' },
};

export const bugs = {
  table: 'bugs',
  resource: 'bugs',
  label: 'bug',
  fields: {
    project_id: projectRef,
    title: { type: 'string', required: true },
    category_id: { type: 'ref', table: 'categories', sameProject: true },
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
  resource: 'projects',
  projectIdOf: (row) => row.id,
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
        categories: one('SELECT COUNT(*) AS n FROM categories WHERE project_id = ?'),
        milestones: one('SELECT COUNT(*) AS n FROM milestones WHERE project_id = ?'),
      },
    };
  },
};

export const categories = {
  table: 'categories',
  resource: 'categories',
  label: 'danh mục',
  fields: {
    project_id: projectRef,
    name: { type: 'string', required: true, max: 100 },
    parent_id: { type: 'ref', table: 'categories', sameProject: true },
    description: { type: 'text', max: 2000 },
    color: { type: 'enum', values: ENUMS.categoryColor, default: 'blue' },
  },
  selectExtra: `
    (SELECT COUNT(*) FROM tasks x WHERE x.category_id = categories.id) AS task_count,
    (SELECT COUNT(*) FROM test_cases x WHERE x.category_id = categories.id) AS test_case_count,
    (SELECT COUNT(*) FROM bugs x WHERE x.category_id = categories.id) AS bug_count,
    (SELECT COUNT(*) FROM documents x WHERE x.category_id = categories.id) AS document_count`,
  searchable: ['name', 'description'],
  filterable: ['project_id', 'parent_id'],
  sortable: { name: 'name', ...timestamps },
  defaultSort: 'name',
  defaultOrder: 'ASC',
  beforeSave(data, existing, db) {
    const err = (field, msg) => new HttpError(400, 'Dữ liệu không hợp lệ', { [field]: msg });
    const parentId = data.parent_id !== undefined ? data.parent_id : existing?.parent_id;
    // Không cho chọn chính nó hoặc danh mục con của nó làm danh mục cha (tránh vòng lặp)
    if (existing && data.parent_id != null) {
      let cur = data.parent_id;
      const parentOf = db.prepare('SELECT parent_id FROM categories WHERE id = ?');
      while (cur != null) {
        if (cur === existing.id) throw err('parent_id', 'Không thể chọn chính nó hoặc danh mục con của nó làm danh mục cha');
        cur = parentOf.get(cur)?.parent_id ?? null;
      }
    }
    // Tên không trùng giữa các danh mục cùng cấp
    const name = data.name ?? existing?.name;
    const projectId = data.project_id ?? existing?.project_id;
    if (data.name !== undefined || data.parent_id !== undefined) {
      const dup = db
        .prepare(
          `SELECT 1 FROM categories WHERE project_id = ? AND lower(name) = lower(?) AND id <> ?
           AND COALESCE(parent_id, 0) = COALESCE(?, 0)`,
        )
        .get(projectId, name, existing?.id ?? 0, parentId ?? null);
      if (dup) throw err('name', 'Đã có danh mục cùng tên ở cấp này');
    }
  },
};

export const milestones = {
  table: 'milestones',
  resource: 'milestones',
  label: 'milestone',
  fields: {
    project_id: projectRef,
    name: { type: 'string', required: true },
    description: { type: 'text' },
    start_date: { type: 'date' },
    due_date: { type: 'date', required: true },
    status: { type: 'enum', values: ENUMS.milestoneStatus, default: 'planned' },
  },
  selectExtra: `
    (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = milestones.id) AS task_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = milestones.id AND t.status = 'done') AS done_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id = milestones.id AND t.status <> 'done'
       AND t.due_date < date('now', 'localtime')) AS overdue_task_count`,
  searchable: ['name', 'description'],
  filterable: ['project_id', 'status'],
  sortable: { due_date: 'due_date', name: 'name', status: rank('status', ENUMS.milestoneStatus), ...timestamps },
  defaultSort: 'due_date',
  defaultOrder: 'ASC',
  beforeSave(data, existing) {
    const start = data.start_date !== undefined ? data.start_date : existing?.start_date;
    const due = data.due_date !== undefined ? data.due_date : existing?.due_date;
    if (start && due && due < start) {
      throw new HttpError(400, 'Dữ liệu không hợp lệ', { due_date: 'Hạn milestone không được trước ngày bắt đầu' });
    }
    if (data.status !== undefined && data.status !== existing?.status) {
      data.completed_at = data.status === 'completed' ? nowSql() : null;
    }
  },
  expand(db, row) {
    return {
      tasks: db
        .prepare(
          `SELECT id, title, status, priority, assignee, due_date, parent_id FROM tasks
           WHERE milestone_id = ? ORDER BY status = 'done', COALESCE(due_date, '9999-12-31'), id`,
        )
        .all(row.id),
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
  resource: 'members',
  projectIdOf: () => null,
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
    email_notifications: { type: 'boolean', default: 1 },
  },
  selectExtra: `
    (SELECT COUNT(*) FROM accounts a WHERE a.member_id = members.id) AS has_account,
    (SELECT a.is_admin FROM accounts a WHERE a.member_id = members.id) AS is_admin,
    (SELECT a.disabled FROM accounts a WHERE a.member_id = members.id) AS account_disabled,
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
  beforeSave(data, existing, db, req) {
    // Email dùng để đăng nhập: chỉ quản trị viên hoặc chính chủ được đổi
    if (existing && data.email !== undefined && data.email !== existing.email && req?.user) {
      const hasAccount = db.prepare('SELECT 1 FROM accounts WHERE member_id = ?').get(existing.id);
      if (hasAccount && !req.user.is_admin && req.user.id !== existing.id) {
        throw new HttpError(403, 'Chỉ quản trị viên hoặc chính thành viên đó được đổi email đăng nhập');
      }
    }
  },
  beforeDelete(db, row) {
    const acc = db.prepare('SELECT is_admin, disabled FROM accounts WHERE member_id = ?').get(row.id);
    const otherAdmins = db
      .prepare('SELECT COUNT(*) AS n FROM accounts WHERE is_admin = 1 AND disabled = 0 AND member_id <> ?')
      .get(row.id).n;
    if (acc?.is_admin && !acc.disabled && otherAdmins === 0) {
      throw new HttpError(400, 'Không thể xoá quản trị viên cuối cùng của hệ thống');
    }
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
    category_id: { type: 'ref', table: 'categories', sameProject: true },
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
