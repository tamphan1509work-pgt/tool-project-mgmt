import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const DB_FILE = process.env.DB_FILE || resolve(here, '../data/pm.db');
const STATIC_DIR = process.env.STATIC_DIR || resolve(here, '../../frontend/dist');

const db = openDb(DB_FILE);
const app = createApp(db, { staticDir: STATIC_DIR });

const server = app.listen(PORT, () => {
  console.log(`API đang chạy tại http://localhost:${PORT}  (DB: ${DB_FILE})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
