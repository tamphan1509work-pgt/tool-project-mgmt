// Giả lập API DatabaseSync của node:sqlite bằng sql.js (SQLite biên dịch sang JavaScript).
import initSqlJs from 'sql.js/dist/sql-asm.js';

const SQL = await initSqlJs();

let initialData = null;
/** Dữ liệu (bytes) dùng cho database được mở tiếp theo */
export function setInitialData(bytes) {
  initialData = bytes;
}

class StatementSync {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  #with(params, fn) {
    const st = this.db.prepare(this.sql);
    try {
      if (params.length) st.bind(params);
      return fn(st);
    } finally {
      st.free();
    }
  }

  get(...params) {
    return this.#with(params, (st) => (st.step() ? st.getAsObject() : undefined));
  }

  all(...params) {
    return this.#with(params, (st) => {
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    });
  }

  run(...params) {
    this.#with(params, (st) => st.step());
    const changes = this.db.getRowsModified();
    const lastInsertRowid = this.db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    return { changes, lastInsertRowid };
  }
}

export class DatabaseSync {
  constructor() {
    this.db = new SQL.Database(initialData ?? undefined);
    initialData = null;
  }
  exec(sql) {
    this.db.exec(sql);
  }
  prepare(sql) {
    return new StatementSync(this.db, sql);
  }
  /** Xuất toàn bộ database thành bytes (dùng để lưu vào localStorage) */
  exportBytes() {
    const bytes = this.db.export();
    this.db.exec('PRAGMA foreign_keys = ON;');
    return bytes;
  }
  close() {
    this.db.close();
  }
}
