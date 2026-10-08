// Browser tests of the whole game (menus, shop, chat, duels, watching duels, payments ...).
// They run the real game in headless Chromium against a fake server, so no backend is needed.
//
//   npm run e2e                 all scenarios
//   npm run e2e -- chat pay     only these
//   WIDTH=320 HEIGHT=568 npm run e2e    another screen size
//
// First time: npm install && npx playwright install chromium
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { build } from 'esbuild';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'e2e/.build');
const SHOTS = join(ROOT, 'e2e/.out');
const PORT = Number(process.env.PORT || 8766);
const W = process.env.WIDTH || '390';
const H = process.env.HEIGHT || '844';
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

// 1. Build the game twice: with a plain VK Bridge stub and with one that can answer purchases.
for (const [out, bridge] of [['main', 'vkb.js'], ['main_pay', 'vkb_pay.js']]) {
  await build({
    entryPoints: [join(ROOT, 'src/main.ts')],
    bundle: true,
    format: 'esm',
    outfile: join(OUT_DIR, `${out}.js`),
    loader: { '.css': 'css' },
    alias: { '@vkontakte/vk-bridge': join(ROOT, 'e2e/stubs', bridge), '@fontsource-variable/rubik': join(ROOT, 'e2e/stubs/empty.css') },
    logLevel: 'error',
  });
}
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const [name, js] of [['index.html', 'main'], ['index_pay.html', 'main_pay']]) {
  writeFileSync(join(OUT_DIR, name), html.replace('/src/main.ts', `./${js}.js`).replace('</head>', `<link rel="stylesheet" href="./${js}.css"></head>`));
}
if (existsSync(join(ROOT, 'public'))) for (const f of readdirSync(join(ROOT, 'public'))) if (/\.(png|svg|ico|webp)$/.test(f)) copyFileSync(join(ROOT, 'public', f), join(OUT_DIR, f));

// 2. Serve the build.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const path = join(OUT_DIR, (req.url || '/').split('?')[0].replace(/^\/+$/, 'index.html'));
  if (!path.startsWith(OUT_DIR) || !existsSync(path)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(readFileSync(path));
}).listen(PORT);

// 3. Run the scenarios one after another.
const wanted = process.argv.slice(2);
const scenarios = readdirSync(join(ROOT, 'e2e/scenarios')).filter((f) => f.endsWith('.mjs')).map((f) => f.replace('.mjs', '')).filter((n) => !wanted.length || wanted.includes(n));
let failed = 0;
for (const name of scenarios) {
  const out = await new Promise((resolveRun) => {
    const p = spawn('node', [join(ROOT, `e2e/scenarios/${name}.mjs`), W, H], { cwd: ROOT, env: { ...process.env, BASE: `http://localhost:${PORT}`, OUT: SHOTS } });
    let text = '';
    p.stdout.on('data', (d) => (text += d));
    p.stderr.on('data', (d) => (text += d));
    const timer = setTimeout(() => p.kill(), 120_000);
    p.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, text });
    });
  });
  // A scenario passes when it ends normally with no page errors and no sideways scrolling.
  const ok = out.code === 0 && /errors \[\s*\]/.test(out.text) && !/hscroll true/.test(out.text);
  console.log(`${ok ? 'ok     ' : 'FAILED '} ${name}`);
  if (!ok) {
    failed++;
    console.log(out.text.split('\n').slice(-12).join('\n'));
  }
}
server.close();
console.log(failed ? `\n${failed} scenario(s) failed` : `\nall ${scenarios.length} scenarios passed (${W}x${H}); screenshots are in e2e/.out`);
process.exit(failed ? 1 : 0);
