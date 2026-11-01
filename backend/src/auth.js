// Xác thực: băm mật khẩu (PBKDF2-SHA256 qua Web Crypto — chạy được cả trên Node lẫn trình duyệt của bản demo),
// phiên đăng nhập bằng token ngẫu nhiên (DB chỉ lưu SHA-256 của token).
import { HttpError } from './resource.js';

const ITERATIONS = 210000;
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

export function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function pbkdf2(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations },
    key,
    256,
  );
  return toHex(bits);
}

/** Trả về chuỗi "pbkdf2$<vòng lặp>$<salt>$<hash>" */
export async function hashPassword(password, saltHex = randomHex(16), iterations = ITERATIONS) {
  return `pbkdf2$${iterations}$${saltHex}$${await pbkdf2(password, saltHex, iterations)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored ?? '').split('$');
  if (scheme !== 'pbkdf2' || !hash) return false;
  const actual = await pbkdf2(password, salt, Number(iter));
  // so sánh thời gian hằng
  let diff = actual.length ^ hash.length;
  for (let i = 0; i < Math.min(actual.length, hash.length); i++) diff |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export const PASSWORD_MIN = 6;
export function checkPasswordRule(password, field = 'password') {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > 200) {
    throw new HttpError(400, 'Dữ liệu không hợp lệ', { [field]: `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự` });
  }
}

const DAY = 86400000;
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

/** Tạo phiên đăng nhập; trả về token gửi cho trình duyệt */
export async function createSession(db, memberId, { remember = false } = {}) {
  const token = randomHex(32);
  const expires = sqlTime(Date.now() + (remember ? 30 : 1) * DAY);
  db.prepare('INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?, ?, ?)').run(
    await sha256Hex(token),
    memberId,
    expires,
  );
  db.prepare("UPDATE accounts SET last_login_at = datetime('now') WHERE member_id = ?").run(memberId);
  return { token, expires_at: expires };
}

/** Người dùng của token (hoặc null nếu token sai / hết hạn / tài khoản bị khoá) */
export async function userFromToken(db, token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = db
    .prepare(
      `SELECT m.id, m.name, m.email, m.position, a.is_admin, s.expires_at FROM sessions s
       JOIN accounts a ON a.member_id = s.member_id JOIN members m ON m.id = s.member_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND a.disabled = 0`,
    )
    .get(tokenHash);
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, position: row.position, is_admin: Boolean(row.is_admin), tokenHash };
}

export const bearer = (req) => {
  const h = req.headers?.authorization;
  return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

/** Chặn đoán mật khẩu: 5 lần sai liên tiếp -> khoá 5 phút (theo email) */
const failures = new Map();
export function assertNotLocked(email) {
  const f = failures.get(email);
  if (f && f.until > Date.now()) {
    const minutes = Math.ceil((f.until - Date.now()) / 60000);
    throw new HttpError(429, `Đăng nhập sai quá nhiều lần. Thử lại sau ${minutes} phút.`);
  }
}
export function recordFailure(email) {
  const f = failures.get(email) ?? { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= 5) {
    f.until = Date.now() + 5 * 60000;
    f.count = 0;
  }
  failures.set(email, f);
}
export const clearFailures = (email) => failures.delete(email);
