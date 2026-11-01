import { Router } from 'express';
import { transaction } from './db.js';
import { actorOf, diffChanges, recordHistory } from './history.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ngày hôm nay theo giờ địa phương, dạng YYYY-MM-DD. */
export function today() {
  return new Date().toLocaleDateString('sv');
}

export function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'ID không hợp lệ');
  return id;
}

/**
 * Kiểm tra & chuẩn hoá dữ liệu đầu vào theo định nghĩa field.
 * - partial=true: chỉ xử lý các field có trong body (dùng cho cập nhật).
 * - Chuỗi rỗng / null => null (trừ khi field bắt buộc).
 */
export function validate(db, fields, body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Body phải là JSON object');
  }
  const out = {};
  const errors = {};

  for (const [name, f] of Object.entries(fields)) {
    if (f.readOnly) continue;
    if (partial && f.createOnly) continue; // VD project_id: không đổi được sau khi tạo
    if (!(name in body) || body[name] === undefined) {
      if (!partial && f.required) errors[name] = 'Trường này là bắt buộc';
      continue;
    }
    let v = body[name];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === null) {
      if (f.required) errors[name] = 'Trường này là bắt buộc';
      else if (f.default !== undefined) out[name] = f.default;
      else out[name] = null;
      continue;
    }

    switch (f.type) {
      case 'string':
      case 'text': {
        if (typeof v !== 'string' && typeof v !== 'number') {
          errors[name] = 'Phải là chuỗi ký tự';
          continue;
        }
        v = String(v);
        if (f.uppercase) v = v.toUpperCase();
        if (f.pattern && !f.pattern.test(v)) {
          errors[name] = f.patternMessage ?? 'Định dạng không hợp lệ';
          continue;
        }
        const max = f.max ?? (f.type === 'string' ? 255 : 20000);
        if (v.length > max) {
          errors[name] = `Tối đa ${max} ký tự`;
          continue;
        }
        break;
      }
      case 'enum':
        if (!f.values.includes(v)) {
          errors[name] = `Giá trị không hợp lệ. Cho phép: ${f.values.join(', ')}`;
          continue;
        }
        break;
      case 'date':
        if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
          errors[name] = 'Ngày không hợp lệ (YYYY-MM-DD)';
          continue;
        }
        break;
      case 'time':
        if (typeof v !== 'string' || !TIME_RE.test(v)) {
          errors[name] = 'Giờ không hợp lệ (HH:MM)';
          continue;
        }
        break;
      case 'url':
        if (typeof v !== 'string' || !/^https?:\/\/\S+$/i.test(v) || v.length > 2000) {
          errors[name] = 'Link phải bắt đầu bằng http:// hoặc https://';
          continue;
        }
        break;
      case 'refs': {
        // Liên kết nhiều-nhiều: mảng ID
        if (!Array.isArray(v)) {
          errors[name] = 'Phải là danh sách ID';
          continue;
        }
        const ids = [...new Set(v.map(Number))];
        const bad = ids.find(
          (id) => !Number.isInteger(id) || id <= 0 || !db.prepare(`SELECT 1 FROM ${f.table} WHERE id = ?`).get(id),
        );
        if (bad !== undefined) {
          errors[name] = `Không tìm thấy bản ghi liên kết #${bad}`;
          continue;
        }
        v = ids;
        break;
      }
      case 'boolean':
        if (![true, false, 0, 1, '0', '1', 'true', 'false'].includes(v)) {
          errors[name] = 'Phải là đúng / sai';
          continue;
        }
        v = [true, 1, '1', 'true'].includes(v) ? 1 : 0;
        break;
      case 'number':
        v = Number(v);
        if (!Number.isFinite(v) || v < 0) {
          errors[name] = 'Phải là số không âm';
          continue;
        }
        break;
      case 'ref': {
        v = Number(v);
        if (!Number.isInteger(v) || v <= 0) {
          errors[name] = 'ID liên kết không hợp lệ';
          continue;
        }
        const exists = db.prepare(`SELECT 1 FROM ${f.table} WHERE id = ?`).get(v);
        if (!exists) {
          errors[name] = `Không tìm thấy bản ghi liên kết #${v}`;
          continue;
        }
        break;
      }
      default:
        throw new Error(`Unknown field type: ${f.type}`);
    }
    out[name] = v;
  }

  if (Object.keys(errors).length) throw new HttpError(400, 'Dữ liệu không hợp lệ', errors);
  return out;
}

/**
 * Tạo router CRUD chung cho một bảng.
 *
 * cfg = {
 *   table, label,
 *   fields: { name: { type, required, values, table, default, max } },
 *   searchable: [cột dùng cho tìm kiếm q],
 *   filterable: [cột lọc theo giá trị chính xác, hỗ trợ "a,b" và "none"],
 *   sortable: { key: sqlExpr }, defaultSort, defaultOrder,
 *   beforeSave(data, existing): bổ sung trường dẫn xuất,
 *   afterUpdate(db, row, existing): xử lý thêm sau khi cập nhật (trong cùng transaction),
 *   expand(db, row): thêm dữ liệu liên quan cho GET /:id,
 *   extraFilters(query, where, params): bộ lọc đặc biệt,
 * }
 */
export function createResource(db, cfg) {
  const router = Router();
  const { table } = cfg;
  const select = `SELECT *${cfg.selectExtra ? `, ${cfg.selectExtra}` : ''} FROM ${table}`;
  const linkFields = Object.entries(cfg.fields).filter(([, f]) => f.type === 'refs');

  /** Các bản ghi liên kết phải cùng dự án với bản ghi đang lưu */
  const checkSameProject = (data, existing) => {
    const projectId = data.project_id ?? existing?.project_id;
    if (!projectId) return;
    const errors = {};
    for (const [name, f] of Object.entries(cfg.fields)) {
      if (!f.sameProject || data[name] == null) continue;
      const ids = Array.isArray(data[name]) ? data[name] : [data[name]];
      for (const id of ids) {
        const row = db.prepare(`SELECT project_id FROM ${f.table} WHERE id = ?`).get(id);
        if (row && row.project_id !== projectId) errors[name] = `Bản ghi #${id} thuộc dự án khác`;
      }
    }
    if (Object.keys(errors).length) throw new HttpError(400, 'Dữ liệu không hợp lệ', errors);
  };

  /** Tách các field nhiều-nhiều ra khỏi dữ liệu cột */
  const splitLinks = (data) => {
    const links = {};
    for (const [name] of linkFields) {
      if (name in data) {
        links[name] = data[name] ?? [];
        delete data[name];
      }
    }
    return links;
  };
  const saveLinks = (id, links) => {
    for (const [name, f] of linkFields) {
      if (!(name in links)) continue;
      db.prepare(`DELETE FROM ${f.joinTable} WHERE ${f.ownKey} = ?`).run(id);
      const ins = db.prepare(`INSERT INTO ${f.joinTable} (${f.ownKey}, ${f.otherKey}) VALUES (?, ?)`);
      for (const other of links[name]) ins.run(id, other);
    }
  };

  // ---- Lịch sử thay đổi ----
  const entity = cfg.resource ?? table;
  const projectIdOf = cfg.projectIdOf ?? ((row) => row.project_id ?? null);
  const nameOf = (row) => row.title ?? row.name ?? row.code ?? `#${row.id}`;
  const currentLinks = (id) => {
    const out = {};
    for (const [name, f] of linkFields) {
      out[name] = db
        .prepare(`SELECT ${f.otherKey} AS id FROM ${f.joinTable} WHERE ${f.ownKey} = ?`)
        .all(id)
        .map((r) => r.id);
    }
    return out;
  };
  const log = (req, row, action, extra = {}) =>
    recordHistory(db, {
      projectId: projectIdOf(row),
      entity,
      entityId: row.id,
      action,
      actor: actorOf(req),
      ...extra,
    });

  /** Lỗi UNIQUE của SQLite -> 400 với thông báo theo field */
  const writeGuard = (fn) => {
    try {
      return fn();
    } catch (err) {
      const m = /UNIQUE constraint failed: \w+\.(\w+)/.exec(err.message ?? '');
      if (m) throw new HttpError(400, 'Dữ liệu không hợp lệ', { [m[1]]: 'Giá trị này đã tồn tại' });
      throw err;
    }
  };

  const getRow = (id) => db.prepare(`${select} WHERE id = ?`).get(id);
  const mustGet = (id) => {
    const row = getRow(id);
    if (!row) throw new HttpError(404, `Không tìm thấy ${cfg.label} #${id}`);
    return row;
  };

  router.get('/', (req, res) => {
    const where = [];
    const params = [];
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      const parts = cfg.searchable.map((c) => `${c} LIKE ? ESCAPE '\\'`);
      params.push(...cfg.searchable.map(() => like));
      // Cho phép tìm theo mã: "12", "#12", "BUG-12", "TC-0012"
      const idMatch = q.match(/^(?:#|[a-z]+-)?0*(\d+)$/i);
      if (idMatch) {
        parts.push('id = ?');
        params.push(Number(idMatch[1]));
      }
      where.push(`(${parts.join(' OR ')})`);
    }
    for (const name of cfg.filterable) {
      const raw = req.query[name];
      if (typeof raw !== 'string' || raw === '') continue;
      if (raw === 'none') {
        where.push(`${name} IS NULL`);
        continue;
      }
      const values = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (!values.length) continue;
      where.push(`${name} IN (${values.map(() => '?').join(',')})`);
      params.push(...values);
    }
    // ?category_id=X: thuộc danh mục X hoặc các danh mục con của X; ?category_id=none: chưa phân loại
    const cat = req.query.category_id;
    if (cfg.fields.category_id && typeof cat === 'string' && cat !== '') {
      if (cat === 'none') where.push('category_id IS NULL');
      else {
        where.push(`category_id IN (
          WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id)
          SELECT id FROM sub)`);
        params.push(Number(cat) || 0);
      }
    }
    cfg.extraFilters?.(req.query, where, params);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortKey = Object.hasOwn(cfg.sortable, req.query.sort) ? req.query.sort : cfg.defaultSort;
    const order =
      req.query.order === 'asc' ? 'ASC' : req.query.order === 'desc' ? 'DESC' : cfg.defaultOrder || 'DESC';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const { n: total } = db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${whereSql}`).get(...params);
    const items = db
      .prepare(
        `${select} ${whereSql}
         ORDER BY ${cfg.sortable[sortKey]} ${order}, id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);
    res.json({ items, total, limit, offset });
  });

  router.get('/:id', (req, res) => {
    const row = mustGet(parseId(req.params.id));
    res.json(cfg.expand ? { ...row, ...cfg.expand(db, row) } : row);
  });

  router.post('/', (req, res) => {
    const data = validate(db, cfg.fields, req.body);
    cfg.beforeSave?.(data, null, db);
    checkSameProject(data, null);
    const links = splitLinks(data);
    const cols = Object.keys(data);
    const sql = cols.length
      ? `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      : `INSERT INTO ${table} DEFAULT VALUES`;
    const id = writeGuard(() =>
      transaction(db, () => {
        const newId = Number(db.prepare(sql).run(...cols.map((c) => data[c])).lastInsertRowid);
        saveLinks(newId, links);
        const row = getRow(newId);
        log(req, row, 'create', { summary: `Tạo ${cfg.label} "${nameOf(row)}"` });
        return newId;
      }),
    );
    res.status(201).json(getRow(id));
  });

  const update = (req, res) => {
    const id = parseId(req.params.id);
    const existing = mustGet(id);
    const data = validate(db, cfg.fields, req.body, { partial: true });
    cfg.beforeSave?.(data, existing, db);
    checkSameProject(data, existing);
    const links = splitLinks(data);
    const cols = Object.keys(data);
    const linksBefore = currentLinks(id);
    writeGuard(() =>
      transaction(db, () => {
        if (cols.length || Object.keys(links).length) {
          db.prepare(
            `UPDATE ${table} SET ${[...cols.map((c) => `${c} = ?`), "updated_at = datetime('now')"].join(', ')} WHERE id = ?`,
          ).run(...cols.map((c) => data[c]), id);
        }
        saveLinks(id, links);
        const row = getRow(id);
        cfg.afterUpdate?.(db, row, existing);
        const changes = diffChanges(db, cfg.fields, existing, data, linksBefore, links);
        if (changes.length) log(req, row, 'update', { changes });
      }),
    );
    res.json(getRow(id));
  };
  router.put('/:id', update);
  router.patch('/:id', update);

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const row = mustGet(id);
    transaction(db, () => {
      // Xoá dự án thì lịch sử của dự án cũng bị xoá theo (FK), nên không ghi thêm
      if (table !== 'projects') log(req, row, 'delete', { summary: `Xoá ${cfg.label} "${nameOf(row)}"` });
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    });
    res.status(204).end();
  });

  return router;
}
