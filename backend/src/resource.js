import { Router } from 'express';

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
 *   expand(db, row): thêm dữ liệu liên quan cho GET /:id,
 *   extraFilters(query, where, params): bộ lọc đặc biệt,
 * }
 */
export function createResource(db, cfg) {
  const router = Router();
  const { table } = cfg;

  const getRow = (id) => db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
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
        `SELECT * FROM ${table} ${whereSql}
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
    cfg.beforeSave?.(data, null);
    const cols = Object.keys(data);
    const sql = cols.length
      ? `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      : `INSERT INTO ${table} DEFAULT VALUES`;
    const info = db.prepare(sql).run(...cols.map((c) => data[c]));
    res.status(201).json(getRow(Number(info.lastInsertRowid)));
  });

  const update = (req, res) => {
    const id = parseId(req.params.id);
    const existing = mustGet(id);
    const data = validate(db, cfg.fields, req.body, { partial: true });
    cfg.beforeSave?.(data, existing);
    const cols = Object.keys(data);
    if (cols.length) {
      db.prepare(
        `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ).run(...cols.map((c) => data[c]), id);
    }
    res.json(getRow(id));
  };
  router.put('/:id', update);
  router.patch('/:id', update);

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    mustGet(id);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    res.status(204).end();
  });

  return router;
}
