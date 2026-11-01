// Ghi nhận lịch sử thay đổi (audit log) cho mọi mục.
// Mỗi bản ghi: ai (actor), lúc nào, hành động gì, và danh sách thay đổi [{ field, from, to, fromText?, toText? }].

/** Cột dùng làm tên hiển thị khi một field tham chiếu tới bảng khác */
const LABEL_COLUMN = {
  meetings: 'title',
  tasks: 'title',
  test_cases: 'title',
  documents: 'title',
  bugs: 'title',
  categories: 'name',
  milestones: 'name',
  projects: 'name',
  members: 'name',
};

const MAX_TEXT = 400;
const clip = (v) => (typeof v === 'string' && v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v);

/** Tên người thao tác: người dùng đang đăng nhập */
export function actorOf(req) {
  return req.user?.name ?? null;
}

export function refLabel(db, table, id) {
  if (id == null) return null;
  const col = LABEL_COLUMN[table];
  if (!col) return `#${id}`;
  return db.prepare(`SELECT ${col} AS label FROM ${table} WHERE id = ?`).get(id)?.label ?? `#${id}`;
}

export function recordHistory(db, { projectId = null, entity, entityId, action, summary = null, changes = null, actor = null }) {
  db.prepare(
    `INSERT INTO history (project_id, entity, entity_id, action, summary, changes, actor)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(projectId, entity, entityId, action, summary, changes?.length ? JSON.stringify(changes) : null, actor);
}

/**
 * So sánh trước / sau theo các field của cấu hình resource.
 * linksBefore / linksAfter: { fieldName: [ids] } cho các field nhiều-nhiều.
 */
export function diffChanges(db, fields, before, after, linksBefore = {}, linksAfter = {}) {
  const changes = [];
  for (const [name, f] of Object.entries(fields)) {
    if (f.type === 'refs') {
      if (!(name in linksAfter)) continue;
      const a = [...(linksBefore[name] ?? [])].sort((x, y) => x - y);
      const b = [...(linksAfter[name] ?? [])].sort((x, y) => x - y);
      if (a.join() === b.join()) continue;
      const added = b.filter((x) => !a.includes(x));
      const removed = a.filter((x) => !b.includes(x));
      changes.push({
        field: name,
        added: added.map((id) => ({ id, label: refLabel(db, f.table, id) })),
        removed: removed.map((id) => ({ id, label: refLabel(db, f.table, id) })),
      });
      continue;
    }
    if (!(name in after) || f.createOnly) continue;
    const from = before?.[name] ?? null;
    const to = after[name] ?? null;
    if (from === to || (from == null && to == null)) continue;
    // Nội dung soạn thảo (HTML, có thể chứa ảnh): chỉ ghi nhận là đã sửa
    if (f.type === 'html') {
      changes.push({ field: name, changed: true });
      continue;
    }
    const change = { field: name, from: clip(from), to: clip(to) };
    if (f.type === 'ref') {
      change.fromText = refLabel(db, f.table, from);
      change.toText = refLabel(db, f.table, to);
    }
    changes.push(change);
  }
  return changes;
}

/** Danh sách lịch sử: theo một mục (entity + entity_id) hoặc toàn bộ dự án */
export function listHistory(db, { entity, entityId, projectId, projectIds = null, limit = 100, offset = 0 }) {
  const where = [];
  const params = [];
  // Thành viên chỉ xem lịch sử của các dự án mình tham gia (projectIds = null: không giới hạn)
  if (projectIds) {
    where.push(projectIds.length ? `project_id IN (${projectIds.map(() => '?').join(',')})` : '0');
    params.push(...projectIds);
  }
  if (entity) {
    where.push('entity = ?');
    params.push(entity);
  }
  if (entityId) {
    where.push('entity_id = ?');
    params.push(entityId);
  }
  if (projectId) {
    where.push('project_id = ?');
    params.push(projectId);
  }
  const sql = `FROM history ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${sql}`).get(...params).n;
  const items = db
    .prepare(`SELECT * ${sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset)
    .map((h) => ({ ...h, changes: h.changes ? JSON.parse(h.changes) : [] }));
  return { items, total, limit, offset };
}
