// Thông báo trễ / sắp đến deadline: trên web (chuông thông báo) và qua email (tổng hợp hằng ngày).
import { HttpError, today as localToday } from './resource.js';

export const DEFAULT_SETTINGS = {
  web_enabled: true, // hiện chuông thông báo trên web
  email_enabled: false, // gửi email nhắc hằng ngày
  remind_days_before: 1, // nhắc trước hạn bao nhiêu ngày (0 = chỉ khi đã trễ)
  email_hour: 8, // giờ gửi email hằng ngày (0–23, giờ máy chủ)
  include_milestones: true, // nhắc cả milestone
  email_to_assignee: true, // gửi cho người thực hiện task
  email_to_pm: true, // gửi cho PM của dự án
  extra_emails: '', // email nhận thêm, cách nhau dấu phẩy
  mention_web: true, // thông báo trên web khi được @nhắc tên trong bình luận
  mention_email: true, // gửi email ngay khi được @nhắc tên (nếu đã cấu hình SMTP)
};

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function getSettings(db) {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    if (r.key in DEFAULT_SETTINGS) out[r.key] = JSON.parse(r.value);
  }
  return out;
}

/** Kiểm tra & lưu cài đặt; trả về [settings mới, danh sách thay đổi] */
export function saveSettings(db, patch) {
  if (!patch || typeof patch !== 'object') throw new HttpError(400, 'Body phải là JSON object');
  const current = getSettings(db);
  const errors = {};
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === 'boolean') {
      if (typeof value !== 'boolean') errors[key] = 'Phải là bật / tắt';
      else next[key] = value;
    } else if (key === 'remind_days_before') {
      if (!Number.isInteger(value) || value < 0 || value > 30) errors[key] = 'Từ 0 đến 30 ngày';
      else next[key] = value;
    } else if (key === 'email_hour') {
      if (!Number.isInteger(value) || value < 0 || value > 23) errors[key] = 'Giờ từ 0 đến 23';
      else next[key] = value;
    } else if (key === 'extra_emails') {
      const list = String(value ?? '')
        .split(/[,;\s]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      const bad = list.find((x) => !EMAIL_RE.test(x));
      if (bad) errors[key] = `Email không hợp lệ: ${bad}`;
      else next[key] = list.join(', ');
    }
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Dữ liệu không hợp lệ', errors);
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  const changes = [];
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (next[key] !== current[key]) {
      upsert.run(key, JSON.stringify(next[key]));
      changes.push({ field: key, from: current[key], to: next[key] });
    }
  }
  return [next, changes];
}

const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

/**
 * Các task / milestone chưa xong đã trễ hạn hoặc sắp đến hạn (trong `daysBefore` ngày tới).
 * Bỏ qua dự án đã hoàn thành / huỷ.
 */
export function deadlineItems(
  db,
  { projectId = null, projectIds = null, daysBefore = 1, includeMilestones = true, today = localToday() },
) {
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + daysBefore * 86400000).toISOString().slice(0, 10);
  // projectIds: chỉ các dự án người xem được phép (null = tất cả)
  const ids = projectIds ? (projectId ? projectIds.filter((x) => x === projectId) : projectIds) : projectId ? [projectId] : null;
  const scope = ids ? (ids.length ? `AND p.id IN (${ids.map(() => '?').join(',')})` : 'AND 0') : '';
  const params = ids ? [limit, ...ids] : [limit];
  const tasks = db
    .prepare(
      `SELECT t.id, t.title, t.assignee, t.due_date, t.status, t.priority, t.project_id, p.code AS project_code, p.name AS project_name
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.status NOT IN ('released', 'canceled') AND t.due_date IS NOT NULL AND t.due_date <= ?
         AND p.status NOT IN ('completed', 'cancelled') ${scope}
       ORDER BY t.due_date, t.id`,
    )
    .all(...params)
    .map((t) => ({ ...t, type: 'task' }));
  const milestones = includeMilestones
    ? db
        .prepare(
          `SELECT m.id, m.name AS title, NULL AS assignee, m.due_date, m.status, m.project_id,
             p.code AS project_code, p.name AS project_name
           FROM milestones m JOIN projects p ON p.id = m.project_id
           WHERE m.status NOT IN ('completed', 'cancelled') AND m.due_date <= ?
             AND p.status NOT IN ('completed', 'cancelled') ${scope}
           ORDER BY m.due_date, m.id`,
        )
        .all(...params)
        .map((m) => ({ ...m, type: 'milestone' }))
    : [];
  return [...milestones, ...tasks]
    .map((it) => {
      const days = dayDiff(it.due_date, today);
      return { ...it, days, kind: days < 0 ? 'overdue' : 'due_soon' };
    })
    .sort((a, b) => a.days - b.days || (a.type === 'milestone' ? -1 : 1));
}

const fmtDate = (s) => s.split('-').reverse().join('/');
const describe = (it) =>
  it.kind === 'overdue'
    ? `trễ ${-it.days} ngày (hạn ${fmtDate(it.due_date)})`
    : it.days === 0
      ? `đến hạn hôm nay`
      : `còn ${it.days} ngày (hạn ${fmtDate(it.due_date)})`;
const itemPath = (it) => (it.type === 'task' ? `/tasks/${it.id}` : `/milestones/${it.id}`);
const itemCode = (it) => `${it.type === 'task' ? 'TASK' : 'MS'}-${String(it.id).padStart(3, '0')}`;

/** Gom các mục cần nhắc theo người nhận và soạn nội dung email */
export function buildEmailDigests(db, settings, { today = localToday(), appUrl = '' } = {}) {
  const items = deadlineItems(db, {
    daysBefore: settings.remind_days_before,
    includeMilestones: settings.include_milestones,
    today,
  });
  const members = db.prepare('SELECT id, name, email, email_notifications FROM members').all();
  const byName = new Map(members.map((m) => [m.name.trim().toLowerCase(), m]));
  const pmsOf = db.prepare(
    `SELECT m.name, m.email, m.email_notifications FROM project_members pm JOIN members m ON m.id = pm.member_id
     WHERE pm.project_id = ? AND pm.role = 'pm'`,
  );
  const recipients = new Map(); // email -> { name, items: Map(key -> item) }
  const add = (email, name, it) => {
    const key = email.toLowerCase();
    if (!recipients.has(key)) recipients.set(key, { to: email, name, items: new Map() });
    recipients.get(key).items.set(`${it.type}:${it.id}`, it);
  };
  const extra = settings.extra_emails
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  for (const it of items) {
    if (settings.email_to_assignee && it.type === 'task' && it.assignee) {
      const m = byName.get(it.assignee.trim().toLowerCase());
      if (m?.email && m.email_notifications) add(m.email, m.name, it);
    }
    if (settings.email_to_pm) {
      for (const pm of pmsOf.all(it.project_id)) if (pm.email && pm.email_notifications) add(pm.email, pm.name, it);
    }
    for (const e of extra) add(e, null, it);
  }

  return [...recipients.values()].map((r) => {
    const list = [...r.items.values()];
    const overdue = list.filter((i) => i.kind === 'overdue').length;
    const subject = `[Project Hub] ${overdue ? `${overdue} mục trễ hạn` : ''}${overdue && list.length > overdue ? ', ' : ''}${
      list.length > overdue ? `${list.length - overdue} mục sắp đến hạn` : ''
    }`;
    const lines = list.map(
      (it) =>
        `- [${it.project_code}] ${itemCode(it)} ${it.title}${it.assignee ? ` (${it.assignee})` : ''}: ${describe(it)}` +
        (appUrl ? `\n  ${appUrl}${itemPath(it)}` : ''),
    );
    const text = `Chào ${r.name ?? 'bạn'},\n\nCác task / milestone cần chú ý:\n\n${lines.join('\n')}\n\n— Project Hub (có thể tắt email này trong Cài đặt hoặc ở hồ sơ thành viên)`;
    const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const html = `<p>Chào ${esc(r.name ?? 'bạn')},</p><p>Các task / milestone cần chú ý:</p><ul>${list
      .map(
        (it) =>
          `<li><b>[${esc(it.project_code)}] ${itemCode(it)}</b> ${
            appUrl ? `<a href="${esc(appUrl + itemPath(it))}">${esc(it.title)}</a>` : esc(it.title)
          }${it.assignee ? ` (${esc(it.assignee)})` : ''}: <span style="color:${it.kind === 'overdue' ? '#b91c1c' : '#a35a00'}">${esc(
            describe(it),
          )}</span></li>`,
      )
      .join('')}</ul><p style="color:#6b7489">— Project Hub</p>`;
    return { to: r.to, name: r.name, items: list, subject, text, html };
  });
}

/**
 * Gửi email nhắc deadline. Mỗi mục chỉ gửi một lần mỗi ngày cho mỗi người nhận (trừ khi force).
 * mailer: { send({ to, subject, text, html }) } hoặc null (chỉ xem trước).
 */
export async function runEmailNotifications(db, { mailer, settings = getSettings(db), today = localToday(), appUrl, force = false }) {
  const digests = buildEmailDigests(db, settings, { today, appUrl });
  const sentBefore = db.prepare(
    `SELECT 1 FROM notification_log WHERE channel = 'email' AND recipient = ? AND item_type = ? AND item_id = ?
     AND kind = ? AND sent_on = ?`,
  );
  const logSent = db.prepare(
    `INSERT OR IGNORE INTO notification_log (channel, recipient, item_type, item_id, kind, sent_on)
     VALUES ('email', ?, ?, ?, ?, ?)`,
  );
  const report = { sent: [], skipped: [], errors: [] };
  for (const d of digests) {
    const fresh = force
      ? d.items
      : d.items.filter((it) => !sentBefore.get(d.to.toLowerCase(), it.type, it.id, it.kind, today));
    if (!fresh.length) {
      report.skipped.push({ to: d.to, reason: 'Đã gửi hôm nay' });
      continue;
    }
    try {
      // Email luôn liệt kê đầy đủ các mục cần chú ý của người nhận
      await mailer.send({ to: d.to, subject: d.subject, text: d.text, html: d.html });
      for (const it of d.items) logSent.run(d.to.toLowerCase(), it.type, it.id, it.kind, today);
      report.sent.push({ to: d.to, count: d.items.length });
    } catch (err) {
      report.errors.push({ to: d.to, error: err.message });
    }
  }
  return report;
}
