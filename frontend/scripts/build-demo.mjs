// Build bản demo thành MỘT file HTML duy nhất (CSS + JS nhúng sẵn), chạy hoàn toàn trong trình duyệt.
// Kết quả: frontend/dist-demo/project-hub.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-demo');

await build({ root, mode: 'demo', logLevel: 'warn' });

const html = readFileSync(join(out, 'index.html'), 'utf8');
const jsPath = html.match(/<script type="module"[^>]*src="([^"]+)"/)[1];
const cssPath = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"/)[1];
const js = readFileSync(join(out, jsPath), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(out, cssPath), 'utf8').replace(/<\/style/gi, '<\\/style');

const page = `<title>Project Hub</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync(join(out, 'project-hub.html'), page);
console.log(`Demo: ${join(out, 'project-hub.html')} (${(page.length / 1024).toFixed(0)} KB)`);
