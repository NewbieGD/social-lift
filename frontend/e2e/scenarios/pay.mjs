const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const W = Number(process.argv[2]||390), H = Number(process.argv[3]||844), platform = process.argv[4]||'mobile_android';
const { catalog, products } = JSON.parse(readFileSync('./e2e/catalog.json','utf8'));
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:W,height:H}});
await ctx.addInitScript(() => { window.WebSocket = class { constructor(){ this.readyState=0; } send(){} close(){} }; });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error' && !/WebSocket|404/.test(m.text())) errs.push(m.text()); });
let owned = ['starter_head']; let loadout = {}; let decor = {};
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => {
  const req=route.request(); const path=new URL(req.url()).pathname;
  const json=(o)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  const state=()=>({coins:50,owned,loadout,decor,catalog,products});
  if (path.endsWith('/session/bootstrap')) return json({profile:{id:5,name:'Я',photo:null},flags:{consent_ok:true,tutorial_done:true},terms_version:1,settings:{rulesCard:false},settings_updated_at:Date.now()+9999,stats:{best_all:50,best_tier:0,best_week:50,last_score:50,total_runs:3,rank_all:9,rank_week:9,last_tier:0,items_mask:0},shop:state(),server_time:Date.now(),ads:{}});
  if (path.endsWith('/loadout')) { const body=JSON.parse(req.postData()).loadout; for (const [s,id] of Object.entries(body)) { if (id) loadout[s]=id; else delete loadout[s]; } return json({loadout}); }
  if (path.endsWith('/decor')) { const body=JSON.parse(req.postData()).decor; if ('pet' in body) { if (body.pet) decor.pet=body.pet; else delete decor.pet; } return json({decor}); }
  if (path.endsWith('/shop')) return json(state());
  return json({ok:true});
});
const top = () => p.evaluate(()=>document.querySelector('#screens .screen:not(.leaving)')?.dataset.screen ?? null);
await p.goto(`${BASE}/index_pay.html?vk_user_id=5&vk_app_id=7&vk_platform=${platform}&sign=x`); await p.waitForTimeout(1500);
await p.click('[data-arg="styles"]'); await p.waitForTimeout(700);
console.log('platform', platform, '| premium tab present:', await p.locator('[data-action="stylesTab"][data-arg="premium"]').count());
if (platform.startsWith('mobile_iphone')) { await p.screenshot({path:`${OUT}/pay_ios_${W}.png`}); console.log('hscroll', await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1), 'errors', errs); await b.close(); process.exit(0); }
await p.click('[data-action="stylesTab"][data-arg="premium"]'); await p.waitForTimeout(900);
console.log('buy buttons', await p.locator('.buy-btn').count(), '|', await p.locator('.buy-btn').first().textContent());
await p.screenshot({path:`${OUT}/pay_1_${W}.png`});
// 1) the player closes the window: nothing changes
await p.evaluate(()=>{ window.__orderResult = false; });
await p.click('[data-action="buyPremium"][data-arg="seraph_set"]'); await p.waitForTimeout(700);
console.log('after cancel: owned seraph =', owned.some(i=>i.startsWith('seraph')), '| calls:', JSON.stringify(await p.evaluate(()=>window.__calls.filter(c=>c[0]==='VKWebAppShowOrderBox'))));
// 2) the player pays: the server (mock) delivers, the game refreshes
await p.evaluate(()=>{ window.__orderResult = true; });
owned = [...owned, 'seraph_head','seraph_torso','seraph_arms','seraph_legs','seraph_torch'];
await p.click('[data-action="buyPremium"][data-arg="seraph_set"]'); await p.waitForTimeout(2200);
console.log('after purchase screen:', await top(), '| wear button:', await p.locator('[data-action="wearSet"][data-arg="seraph"]').count());
await p.click('[data-action="wearSet"][data-arg="seraph"]'); await p.waitForTimeout(700);
console.log('worn:', JSON.stringify(loadout));
await p.screenshot({path:`${OUT}/pay_2_${W}.png`});
// back to the menu to see the hero in the full set
await p.click('[data-action="back"]'); await p.waitForTimeout(1500);
await p.screenshot({path:`${OUT}/pay_3_${W}.png`});
// pets screen: the premium spark
await p.click('[data-arg="pets"]'); await p.waitForTimeout(800);
console.log('spark card locked-premium:', await p.locator('.premium-locked').count());
console.log('hscroll', await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1), 'errors', errs);
await b.close();
