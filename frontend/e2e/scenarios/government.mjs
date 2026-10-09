// The government: the strip and the bell in the menu, the throne, candidacy, voting, the mayor's management
// (assistants, bonus, Play button color), the notices, and the look of the mayor.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
const W = Number(process.argv[2] || 390), H = Number(process.argv[3] || 844);
const { catalog, products } = JSON.parse(readFileSync('./e2e/catalog.json', 'utf8'));
const pl = (id, name) => ({ id, name, photo: null });
let role = null; // the player is a mayor in the second part
const gstate = () => ({
  week: '2026-10-12', phase: 'candidacy', voting_opens_at: Date.now() + 3 * 86400000, ends_at: Date.now() + 6 * 86400000,
  mayor: role === 'mayor' ? pl(5, 'Я') : null,
  assistants: role === 'mayor' ? [{ ...pl(21, 'Анна К.'), status: 'accepted' }, { ...pl(22, 'Борис П.'), status: 'invited' }] : [],
  candidates: [pl(31, 'Вера Т.'), pl(32, 'Глеб Р.')],
  me: { role, eligibility: { phase: 'candidacy', wins: { have: 2, need: 3 }, record: { have: 2100, need: 2000 }, ring: false, is_candidate: false, can_apply: false, reason: 'conditions' }, my_vote: null, can_vote: true, runs: 5, vote_need_runs: 3, invited: false },
  settings: { bonus_on: bonusOn, play_color: color, colors: ['default', 'fire', 'ice', 'emerald'] }, bonus_active: bonusOn, bonus_percent: 10,
});
let bonusOn = false, color = 'fire';
const calls = [];
async function withPlayer(fn) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => { window.WebSocket = class { constructor() { this.readyState = 0; } send() {} close() {} }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname; const method = req.method();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (path.endsWith('/session/bootstrap')) {
      const owned = role === 'mayor' ? ['mayor_head', 'mayor_torso', 'mayor_arms', 'mayor_legs', 'mayor_torch', 'bg_throne'] : [];
      const loadout = role === 'mayor' ? { head: 'mayor_head', torso: 'mayor_torso', arms: 'mayor_arms', legs: 'mayor_legs', torch: 'mayor_torch' } : {};
      return json({ profile: { id: 5, name: 'Я', photo: null }, flags: { consent_ok: true, tutorial_done: true }, terms_version: 1, settings: { rulesCard: false }, settings_updated_at: Date.now() + 9999, stats: { best_all: 50, best_tier: 0, best_week: 50, last_score: 50, total_runs: 3, rank_all: 9, rank_week: 9, last_tier: 0, items_mask: 0 }, shop: { coins: 5, owned, loadout, decor: role === 'mayor' ? { bg: 'bg_throne' } : {}, catalog, products }, gov: { role, play_color: color, bonus_active: bonusOn, bonus_percent: 10, mayor_id: role === 'mayor' ? 5 : null, unread: 3 }, server_time: Date.now(), ads: {} });
    }
    if (path.endsWith('/gov/state')) return json(gstate());
    if (path.endsWith('/gov/apply')) { calls.push('apply'); return route.fulfill({ status: 409, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { code: 'conditions', message: 'x' } }) }); }
    if (path.endsWith('/gov/vote')) { calls.push('vote'); return json(gstate()); }
    if (path.endsWith('/gov/find')) return json({ players: [pl(41, 'Дина М.'), pl(42, 'Егор С.')] });
    if (path.endsWith('/gov/assistants') && method === 'POST') { calls.push('invite ' + JSON.parse(req.postData()).user_id); return json(gstate()); }
    if (path.includes('/gov/assistants/') && method === 'DELETE') { calls.push('remove'); return json(gstate()); }
    if (path.endsWith('/gov/settings')) { const s = JSON.parse(req.postData()); if ('bonus' in s) bonusOn = s.bonus; if (s.play_color) color = s.play_color; calls.push('settings ' + JSON.stringify(s)); return json(gstate()); }
    if (path.endsWith('/notifications')) return json({ unread: 3, items: [{ id: 3, kind: 'mayor_elected', payload: { user: pl(31, 'Вера Т.') }, at: Date.now() - 3600000, unread: true, personal: false }, { id: 2, kind: 'voting_started', payload: {}, at: Date.now() - 86400000, unread: true, personal: false }, { id: 1, kind: 'assistant_invite', payload: { from: pl(31, 'Вера Т.') }, at: Date.now() - 2 * 86400000, unread: false, personal: true }] });
    if (path.endsWith('/notifications/read')) return json({ unread: 0 });
    return json({ ok: true });
  });
  const top = () => p.evaluate(() => document.querySelector('#screens .screen:not(.leaving)')?.dataset.screen ?? null);
  await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&sign=x`); await p.waitForTimeout(2800);
  await fn(p, top);
  console.log('hscroll', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'errors', errs);
  await b.close();
  return errs;
}
const all = [];
// ---- 1. an ordinary player
role = null;
all.push(...await withPlayer(async (p, top) => {
  // The menu must not be redrawn while the government loads in the background (that made the screen flash).
  const mut = await p.evaluate(() => new Promise((res) => { let n = 0; const o = new MutationObserver((m) => { n += m.length; }); o.observe(document.getElementById('screens'), { childList: true, subtree: true }); setTimeout(() => { o.disconnect(); res(n); }, 2600); }));
  console.log('menu redraws in 2.6 s:', mut);
  console.log('menu: strip:', (await p.locator('.gov-strip').textContent()).replace(/\s+/g, ' ').trim(), '| bell:', await p.locator('.bell-count').textContent(), '| Play color:', await p.evaluate(() => document.body.dataset.play));
  await p.screenshot({ path: `${OUT}/gov_menu_${W}.png` });
  await p.click('.gov-strip'); await p.waitForTimeout(1200);
  console.log('government screen:', await top(), '| seats:', await p.locator('.seat').count(), '| candidates:', await p.locator('.cand-card').count(), '| tiles:', await p.locator('.gtile').count(), '| vote steps:', await p.locator('.vstep').count(), '| throne canvas:', await p.locator('#throneCanvas').count(), '| manage button:', await p.locator('[data-arg="govManage"]').count());
  await p.screenshot({ path: `${OUT}/gov_empty_${W}.png` });
  await p.click('[data-arg="govCandidacy"]'); await p.waitForTimeout(700);
  console.log('candidacy window:', await top(), '| requirements:', await p.locator('.req').count(), '| ok marks:', await p.locator('.req.ok').count(), '| apply button:', await p.locator('[data-action="govApply"]').count());
  await p.screenshot({ path: `${OUT}/gov_candidacy_${W}.png` });
  await p.click('[data-action="back"]'); await p.waitForTimeout(400);
  await p.click('[data-action="back"]'); await p.waitForTimeout(500);
  await p.click('.bell-btn'); await p.waitForTimeout(900);
  console.log('notices:', await top(), '| rows:', await p.locator('.notice').count(), '| unread:', await p.locator('.notice.unread').count());
  await p.screenshot({ path: `${OUT}/gov_notices_${W}.png` });
}));
// ---- 2. the mayor
role = 'mayor';
all.push(...await withPlayer(async (p, top) => {
  await p.screenshot({ path: `${OUT}/gov_mayor_menu_${W}.png` });
  await p.click('.gov-strip'); await p.waitForTimeout(1200);
  console.log('mayor government screen: assistants shown:', await p.locator('.seat.filled').count(), '| manage button:', await p.locator('[data-arg="govManage"]').count());
  await p.screenshot({ path: `${OUT}/gov_throne_${W}.png` });
  await p.click('[data-arg="govManage"]'); await p.waitForTimeout(800);
  console.log('management:', await top(), '| color buttons:', await p.locator('.color-btn').count(), '| remove buttons:', await p.locator('[data-action="govRemove"]').count());
  await p.click('[data-action="govBonus"]'); await p.waitForTimeout(500);
  await p.click('.color-btn.play-ice'); await p.waitForTimeout(500);
  console.log('Play color now:', await p.evaluate(() => document.body.dataset.play), '| bonus switch:', await p.locator('.switch.on').count());
  await p.screenshot({ path: `${OUT}/gov_manage_${W}.png` });
  await p.click('[data-arg="govFind"]'); await p.waitForTimeout(900);
  console.log('find window:', await top(), '| players:', await p.locator('.find-list .cand-row').count());
  await p.screenshot({ path: `${OUT}/gov_find_${W}.png` });
  await p.click('[data-action="govInvite"][data-arg="41"]'); await p.waitForTimeout(600);
  console.log('server calls:', JSON.stringify(calls));
}));
console.log('hscroll false', 'errors', all);
