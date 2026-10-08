// Hold the hero to carry him anywhere on the main screen; a tap opens the wardrobe, which wears the same decoration.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
const W = Number(process.argv[2] || 390), H = Number(process.argv[3] || 844);
const { catalog, products } = JSON.parse(readFileSync('./e2e/catalog.json', 'utf8'));
const decor = { bg: 'bg_neon', frame: 'frame_gold', pet: 'pet_cat', props: [{ id: 'prop_tv', x: 0.8, y: 0.95, r: 0 }, { id: 'prop_lamp', x: 0.1, y: 0.9, r: 0 }] };
const owned = ['bg_neon', 'frame_gold', 'pet_cat', 'prop_tv', 'prop_lamp'];
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: false });
await ctx.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} }; });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => { const path = new URL(route.request().url()).pathname; const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (path.endsWith('/session/bootstrap')) return json({ profile: { id: 5, name: 'Я', photo: null }, flags: { consent_ok: true, tutorial_done: true }, terms_version: 1, settings: { rulesCard: false }, settings_updated_at: Date.now() + 9999, stats: { best_all: 50, best_tier: 0, best_week: 50, last_score: 50, total_runs: 3, rank_all: 9, rank_week: 9, last_tier: 0, items_mask: 0 }, shop: { coins: 5, owned, loadout: {}, decor, catalog, products }, server_time: Date.now(), ads: {} });
  return json({ ok: true }); });
const top = () => p.evaluate(() => document.querySelector('#screens .screen:not(.leaving)')?.dataset.screen ?? null);
await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&sign=x`); await p.waitForTimeout(1600);
const hit = await p.locator('.hero-hit').boundingBox();
// Hold and drag to the lower right.
await p.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2); await p.mouse.down(); await p.waitForTimeout(520);
await p.mouse.move(hit.x + hit.width / 2 + 90, hit.y + hit.height / 2 + 120, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(500);
console.log('after the carry the screen is:', await top(), '| saved:', await p.evaluate(() => localStorage.getItem('sl_menu_state')));
await p.screenshot({ path: `${OUT}/herodrag_moved_${W}.png` });
// A short tap opens the wardrobe, and it shows the same background, objects, pet and frame.
const hit2 = await p.locator('.hero-hit').boundingBox();
await p.mouse.click(hit2.x + hit2.width / 2, hit2.y + hit2.height / 2); await p.waitForTimeout(1200);
console.log('after a tap the screen is:', await top());
await p.screenshot({ path: `${OUT}/herodrag_wardrobe_${W}.png` });
console.log('hscroll', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'errors', errs);
await b.close();
