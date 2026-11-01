import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { createMailerFromEnv } from './mailer.js';
import { getSettings, runEmailNotifications } from './notify.js';
import { today } from './resource.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const DB_FILE = process.env.DB_FILE || resolve(here, '../data/pm.db');
const STATIC_DIR = process.env.STATIC_DIR || resolve(here, '../../frontend/dist');
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const db = openDb(DB_FILE);
const mailer = await createMailerFromEnv();
const app = createApp(db, { staticDir: STATIC_DIR, mailer, appUrl: APP_URL });

const server = app.listen(PORT, () => {
  console.log(`API đang chạy tại http://localhost:${PORT}  (DB: ${DB_FILE})`);
  console.log(mailer ? `Email nhắc deadline: gửi từ ${mailer.from}` : 'Email nhắc deadline: chưa cấu hình SMTP');
});

// Mỗi 10 phút kiểm tra: nếu bật email và đã tới giờ gửi trong ngày thì gửi (mỗi mục chỉ nhắc 1 lần/ngày)
let lastRunDay = null;
async function emailTick() {
  if (!mailer) return;
  const settings = getSettings(db);
  if (!settings.email_enabled) return;
  const day = today();
  if (lastRunDay === day || new Date().getHours() < settings.email_hour) return;
  lastRunDay = day;
  try {
    const report = await runEmailNotifications(db, { mailer, settings, appUrl: APP_URL });
    console.log(`[email] ${day}: đã gửi ${report.sent.length}, lỗi ${report.errors.length}`);
  } catch (err) {
    console.error('[email] lỗi khi gửi nhắc deadline', err);
  }
}
const timer = setInterval(emailTick, 10 * 60 * 1000);
emailTick();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    clearInterval(timer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
