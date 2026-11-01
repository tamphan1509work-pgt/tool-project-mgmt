// Bản demo: chạy chính backend (backend/src/app.js) ngay trong trình duyệt.
// Database SQLite (sql.js) được lưu vào localStorage của từng người xem.
import { createApp } from '../../../backend/src/app.js';
import { openDb } from '../../../backend/src/db.js';
import { seed } from '../../../backend/src/seed.js';
import { setInitialData } from './shims/node-sqlite.js';

const STORAGE_KEY = 'project-hub-demo-db-v2';

const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function loadSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? fromBase64(saved) : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, toBase64(db.exportBytes()));
  } catch {
    // Không lưu được (chế độ ẩn danh, bị chặn…): dữ liệu vẫn dùng được tới khi tải lại trang
  }
}

let db;
let app;

function boot(data) {
  setInitialData(data);
  db = openDb(':memory:');
  if (!data) {
    seed(db);
    persist();
  }
  app = createApp(db);
}

try {
  boot(loadSaved());
} catch {
  // Dữ liệu lưu bị hỏng: bắt đầu lại từ dữ liệu mẫu
  boot(null);
}

/** Xoá dữ liệu đã lưu và tạo lại dữ liệu mẫu */
export function resetDemo() {
  db.close();
  boot(null);
}

/** Thay thế cho window.fetch: chuyển request /api/... vào Express app trong trình duyệt */
export async function demoFetch(url, init = {}) {
  const u = new URL(url, 'http://demo.local');
  const method = (init.method || 'GET').toUpperCase();
  const req = {
    method,
    path: u.pathname,
    url: u.pathname + u.search,
    originalUrl: u.pathname + u.search,
    baseUrl: '',
    query: Object.fromEntries(u.searchParams),
    body: init.body ? JSON.parse(init.body) : {},
    params: {},
  };

  const result = await new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: this.statusCode, body: data });
      },
      end() {
        resolve({ status: this.statusCode, body: null });
      },
      sendFile() {
        resolve({ status: 404, body: null });
      },
    };
    app(req, res, (err) => {
      console.error(err);
      resolve({ status: err ? 500 : 404, body: { error: err ? 'Lỗi máy chủ' : 'Không tìm thấy' } });
    });
  });

  if (method !== 'GET' && result.status < 400) persist();

  return result.body === null
    ? new Response(null, { status: result.status })
    : new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
}
