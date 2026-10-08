const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const W = Number(process.argv[2]||390), H = Number(process.argv[3]||844);
const catalog = JSON.parse(readFileSync('./e2e/catalog.json','utf8')).catalog;
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:W,height:H}});
await ctx.addInitScript(() => { window.WebSocket = class { constructor(){ this.readyState=0; } send(){} close(){} }; });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error' && !/WebSocket|404/.test(m.text())) errs.push(m.text()); });
let decor = {}; const owned = ['pet_cat','pet_dog','pet_parrot'];
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => {
  const req=route.request(); const path=new URL(req.url()).pathname;
  const json=(o)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  const state=()=>({coins:100,owned,loadout:{},decor,catalog});
  if (path.endsWith('/session/bootstrap')) return json({profile:{id:5,name:'Я',photo:null},flags:{consent_ok:true,tutorial_done:true},terms_version:1,settings:{rulesCard:false},settings_updated_at:Date.now()+9999,stats:{best_all:1400,best_tier:6,best_week:300,last_score:200,total_runs:12,rank_all:59,rank_week:4,last_tier:6,items_mask:0},shop:state(),server_time:Date.now(),ads:{}});
  if (path.endsWith('/decor')) { const body=JSON.parse(req.postData()).decor; if ('pet' in body) { if (body.pet) decor.pet=body.pet; else delete decor.pet; } return json({decor}); }
  if (path.endsWith('/runs/start')) return json({run_id:'55555555-5555-5555-5555-555555555555',seed:9,started_at:Date.now(),token:'1.a'});
  if (path.endsWith('/shop')) return json(state());
  return json({ok:true});
});
const top = () => p.evaluate(()=>document.querySelector('#screens .screen:not(.leaving)')?.dataset.screen ?? null);
await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&sign=x`); await p.waitForTimeout(1500);
await p.screenshot({path:`${OUT}/pt_menu_${W}.png`});
await p.click('[data-arg="pets"]', {force:true}); await p.waitForTimeout(900);
console.log('screen', await top(), 'cards', await p.locator('.decor-card').count());
await p.click('[data-action="petPick"][data-arg="pet_dog"]'); await p.waitForTimeout(3000);
console.log('pet ->', JSON.stringify(decor));
await p.screenshot({path:`${OUT}/pt_screen_${W}.png`});

await p.screenshot({path:`${OUT}/pt_screen2_${W}.png`});
await p.click('[data-action="back"]'); await p.waitForTimeout(1200);
await p.screenshot({path:`${OUT}/pt_menu2_${W}.png`});
// a run with the parrot
await p.click('[data-action="petPick"]', {timeout:500}).catch(()=>{});
await p.click('[data-action="play"]', {force:true}); await p.waitForTimeout(2200);
console.log('in run', await top());
for (let i=0;i<14;i++){ if (i===0) await p.keyboard.press('Digit1'); const k=i%2?'ArrowLeft':'ArrowRight'; await p.keyboard.down(k); await p.waitForTimeout(350); await p.keyboard.up(k); }
await p.screenshot({path:`${OUT}/pt_run_${W}.png`}); await p.waitForTimeout(250); await p.screenshot({path:`${OUT}/pt_run2_${W}.png`});
console.log('hscroll', await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1), 'errors', errs);
await b.close();
