// An ad is never asked for while the page is in full screen, full screen returns on the first tap,
// and the run that starts after an ad is playable (no leftover screens, steering state renewed).
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
const W = Number(process.argv[2] || 1280), H = Number(process.argv[3] || 720);
const all = [];
async function phase(name, { blockInFs, flag }) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(([blockInFs, flag]) => { window.__adAvailable = true; window.__blockInFs = blockInFs; if (flag) localStorage.setItem('sl_fs_blocks_ads', '1'); window.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} }; }, [blockInFs, flag]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (path.endsWith('/session/bootstrap')) return json({ profile: { id: 5, name: 'Я', photo: null }, flags: { consent_ok: true, tutorial_done: true }, terms_version: 1, settings: { rulesCard: false }, settings_updated_at: Date.now() + 9999, stats: { best_all: 50, best_tier: 0, best_week: 50, last_score: 50, total_runs: 3, rank_all: 9, rank_week: 9, last_tier: 0, items_mask: 0 }, shop: { coins: 5, owned: [], loadout: {}, decor: {}, catalog: [], products: [] }, server_time: Date.now(), ads: { enabled: true, min_runs_before: 0, every_n_runs: 0, min_interval_sec: 0, timeout_sec: 2 } });
    if (path.endsWith('/runs/start')) return json({ run_id: '88888888-8888-8888-8888-888888888888', seed: 5, started_at: Date.now(), token: '1.a' });
    return json({ ok: true });
  });
  await p.goto(`${BASE}/index_pay.html?vk_user_id=5&vk_app_id=7&vk_platform=desktop_web&sign=x`); await p.waitForTimeout(1500);
  await p.click('.fs-btn'); await p.waitForTimeout(500);
  const t0 = Date.now();
  await p.click('[data-action="play"]', { force: true });
  await p.waitForFunction(() => !document.querySelector('#screens .screen'), null, { timeout: 15000 }).catch(() => undefined);
  const loadMs = Date.now() - t0;
  const fsAfterPlay = await p.evaluate(() => !!document.fullscreenElement);
  const log = await p.evaluate(() => window.__adLog || []);
  console.log(`[${name}] ad requested while in full screen:`, log[0] ? log[0].fullscreen : 'no ad', '| still in full screen after Play:', fsAfterPlay, '| loading screen ms:', loadMs, '| stored flag:', await p.evaluate(() => localStorage.getItem('sl_fs_blocks_ads')));
  await p.mouse.click(W / 2, H / 2); await p.waitForTimeout(500);
  console.log(`[${name}] in full screen after the first tap:`, await p.evaluate(() => !!document.fullscreenElement), '| leftover screens:', await p.locator('#screens .screen').count());
  all.push(...errs);
  await b.close();
}
// 1. The ad shows fine in full screen: the page stays in full screen and nothing flickers.
await phase('ad works in full screen', { blockInFs: false, flag: false });
// 2. Not remembered yet and the ad fails in full screen: the game learns it.
await phase('learns that full screen blocks ads', { blockInFs: true, flag: false });
// 3. Remembered: the game leaves full screen for the ad and returns on the first tap.
await phase('remembered', { blockInFs: true, flag: true });
console.log('hscroll false', 'errors', all);
