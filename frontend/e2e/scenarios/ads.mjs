// An ad is never asked for while the page is in full screen, full screen returns on the first tap,
// and the run that starts after an ad is playable (no leftover screens, steering state renewed).
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
const W = Number(process.argv[2] || 1280), H = Number(process.argv[3] || 720);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript(() => { window.__adAvailable = true; window.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} }; });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (path.endsWith('/session/bootstrap')) return json({ profile: { id: 5, name: 'Я', photo: null }, flags: { consent_ok: true, tutorial_done: true }, terms_version: 1, settings: { rulesCard: false }, settings_updated_at: Date.now() + 9999, stats: { best_all: 50, best_tier: 0, best_week: 50, last_score: 50, total_runs: 3, rank_all: 9, rank_week: 9, last_tier: 0, items_mask: 0 }, shop: { coins: 5, owned: [], loadout: {}, decor: {}, catalog: [], products: [] }, server_time: Date.now(), ads: { enabled: true, min_runs_before: 0, every_n_runs: 0, min_interval_sec: 0, timeout_sec: 2 } });
  if (path.endsWith('/runs/start')) return json({ run_id: '88888888-8888-8888-8888-888888888888', seed: 5, started_at: Date.now(), token: '1.a' });
  return json({ ok: true });
});
await p.goto(`${BASE}/index_pay.html?vk_user_id=5&vk_app_id=7&vk_platform=desktop_web&sign=x`); await p.waitForTimeout(1500);
// Go full screen with a real click (the browser needs a user action).
await p.click('.fs-btn'); await p.waitForTimeout(500);
const wasFs = await p.evaluate(() => !!document.fullscreenElement);
console.log('full screen on before the ad:', wasFs);
await p.click('[data-action="play"]', { force: true }); await p.waitForTimeout(3500);
const log = await p.evaluate(() => window.__adLog || []);
console.log('ads requested:', log.length, '| page in full screen when the ad was requested:', log[0] ? log[0].fullscreen : 'n/a');
console.log('leftover screens in the way:', await p.locator('#screens .screen').count());
// The first tap after the ad takes the page back to full screen.
await p.mouse.click(W / 2, H / 2); await p.waitForTimeout(500);
console.log('full screen again after a tap:', await p.evaluate(() => !!document.fullscreenElement));
await p.screenshot({ path: `${OUT}/ads_${W}.png` });
console.log('hscroll', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'errors', errs);
await b.close();
