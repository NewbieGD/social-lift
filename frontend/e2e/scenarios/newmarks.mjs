// Things found, bought or earned since the last visit are marked NEW once, and the marks go away after a look.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:8766';
const W = Number(process.argv[2] || 390), H = Number(process.argv[3] || 844);
const { catalog, products } = JSON.parse(readFileSync('./e2e/catalog.json', 'utf8'));
const owned = ['starter_head', 'starter_torso', 'wood_torch', 'prop_cup', 'pet_cat'];
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H } });
// The player has already seen the starter things; the others are new.
await ctx.addInitScript(() => { localStorage.setItem('sl_seen_items', JSON.stringify(['starter_head', 'starter_torso'])); window.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} }; });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => { const path = new URL(route.request().url()).pathname; const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (path.endsWith('/session/bootstrap')) return json({ profile: { id: 5, name: 'Я', photo: null }, flags: { consent_ok: true, tutorial_done: true }, terms_version: 1, settings: { rulesCard: false }, settings_updated_at: Date.now() + 9999, stats: { best_all: 50, best_tier: 0, best_week: 50, last_score: 50, total_runs: 3, rank_all: 9, rank_week: 9, last_tier: 0, items_mask: 0 }, shop: { coins: 5, owned, loadout: {}, decor: {}, catalog, products }, server_time: Date.now(), ads: {} });
  return json({ ok: true }); });
await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&sign=x`); await p.waitForTimeout(1500);
console.log('menu NEW marks (styles, decor, pets):', await p.locator('.styles-tile .new-dot').count(), await p.locator('.decor-tile .new-dot').count(), await p.locator('.pets-tile .new-dot').count());
await p.click('[data-arg="styles"]'); await p.waitForTimeout(900);
console.log('new cards in Styles:', await p.locator('.style-card.is-new').count(), '| rarity classes:', JSON.stringify(await p.evaluate(()=>[...new Set([...document.querySelectorAll('.style-card')].map(c=>c.className.match(/rarity-\w+/)?.[0]))])));
await p.click('[data-action="back"]'); await p.waitForTimeout(700);
console.log('after a look, Styles mark:', await p.locator('.styles-tile .new-dot').count(), '| Decor mark still there:', await p.locator('.decor-tile .new-dot').count());
await p.click('[data-arg="styles"]'); await p.waitForTimeout(700);
console.log('new cards on a second visit:', await p.locator('.style-card.is-new').count());
console.log('hscroll', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'errors', errs);
await b.close();
