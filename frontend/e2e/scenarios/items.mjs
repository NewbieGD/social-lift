const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const W = Number(process.argv[2]||390), H = Number(process.argv[3]||844);
const { catalog, products } = JSON.parse(readFileSync('./e2e/catalog.json','utf8'));
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:W,height:H}});
await ctx.addInitScript(() => { window.WebSocket = class { constructor(){ this.readyState=0; } send(){} close(){} }; });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error' && !/WebSocket|404/.test(m.text())) errs.push(m.text()); });
let owned = ['starter_head','wood_torch','saber_torch']; let loadout = {}; let coins = 1000; let decor = {};
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => {
  const req=route.request(); const path=new URL(req.url()).pathname;
  const json=(o)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  const state=()=>({coins,owned,loadout,decor,catalog,products,duel_streak:10});
  if (path.endsWith('/session/bootstrap')) return json({profile:{id:5,name:'Я',photo:null},flags:{consent_ok:true,tutorial_done:true},terms_version:1,settings:{rulesCard:false},settings_updated_at:Date.now()+9999,stats:{best_all:50,best_tier:0,best_week:50,last_score:50,total_runs:3,rank_all:9,rank_week:9,last_tier:0,items_mask:0},shop:state(),server_time:Date.now(),ads:{}});
  if (path.endsWith('/loadout')) { const body=JSON.parse(req.postData()).loadout; for (const [s,id] of Object.entries(body)) { if (id) loadout[s]=id; else delete loadout[s]; } return json({loadout}); }
  if (path.endsWith('/shop/buy')) { const id=JSON.parse(req.postData()).item_id; const it=catalog.find(c=>c.id===id); if (coins<it.price) return route.fulfill({status:402,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({error:{code:'not_enough_coins',message:'x'}})}); coins-=it.price; owned.push(id); return json(state()); }
  if (path.endsWith('/shop')) return json(state());
  return json({ok:true});
});
const top = () => p.evaluate(()=>document.querySelector('#screens .screen:not(.leaving)')?.dataset.screen ?? null);
await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&vk_platform=mobile_android&sign=x`); await p.waitForTimeout(1500);
await p.click('[data-arg="styles"]'); await p.waitForTimeout(900);
console.log('slot chips:', await p.locator('.slot-chip').count(), '| buyable cards:', await p.locator('.style-card.buyable').count());
// wear the owned wooden torch and the saber
await p.click('[data-action="wearStyle"][data-arg="wood_torch"]'); await p.waitForTimeout(500);
console.log('worn:', JSON.stringify(loadout));
await p.screenshot({path:`${OUT}/it_1_${W}.png`});
await p.click('[data-action="wearStyle"][data-arg="saber_torch"]'); await p.waitForTimeout(500);
console.log('torch replaced:', JSON.stringify(loadout));
// buy the phone for coins
await p.click('[data-action="askBuy"][data-arg="phone_torch"]'); await p.waitForTimeout(500);
console.log('confirm screen:', await top(), '| text:', (await p.locator('.panel p').first().textContent()));
console.log('buy preview canvas:', await p.locator('#buyPreview').count());
await p.screenshot({path:`${OUT}/items_preview_${W}.png`});
await p.click('[data-action="confirmBuy"]'); await p.waitForTimeout(1000);
console.log('bought phone:', owned.includes('phone_torch'), 'coins', coins, '| wear btn now:', await p.locator('[data-action="wearStyle"][data-arg="phone_torch"]').count());
// A purchase opens the card of the new thing; the confirmation shows the thing on the hero first.
console.log('after the purchase the screen is:', await top(), '| reveal canvas:', await p.locator('.reveal-stage canvas').count(), '| rarity class:', await p.evaluate(()=>document.querySelector('.reveal-panel')?.className.match(/rarity-\w+/)?.[0]));
await p.screenshot({path:`${OUT}/items_reveal_${W}.png`});
await p.click('[data-action="back"]'); await p.waitForTimeout(500);
// scroll to see all torch cards
await p.evaluate(()=>{ const s=document.querySelector('.styles-screen'); s && s.scrollTo(0, s.scrollHeight); }); await p.waitForTimeout(400);
await p.screenshot({path:`${OUT}/it_2_${W}.png`});
// pets: the trophy
await p.click('[data-action="back"]'); await p.waitForTimeout(700);
await p.click('[data-arg="pets"]'); await p.waitForTimeout(900);
const trophy = await p.locator('[data-arg="pet_trophy"], .decor-card:has-text("Кубок")').first().textContent();
console.log('trophy card text:', trophy.replace(/\s+/g,' ').trim());
await p.screenshot({path:`${OUT}/it_3_${W}.png`});
console.log('hscroll', await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1), 'errors', errs);
await b.close();
