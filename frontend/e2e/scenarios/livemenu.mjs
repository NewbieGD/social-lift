const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const W = Number(process.argv[2]||390), H = Number(process.argv[3]||844);
const { catalog, products } = JSON.parse(readFileSync('./e2e/catalog.json','utf8'));
const decor = {pet:'pet_cat', props:[{id:'prop_tv',x:0.8,y:0.95,r:0},{id:'prop_lamp',x:0.1,y:0.9,r:0},{id:'prop_football',x:0.6,y:0.97,r:0},{id:'prop_cup',x:0.92,y:0.72,r:0}]};
const owned = ['prop_tv','prop_lamp','prop_football','prop_cup','pet_cat'];
async function shot(weather, name, extra) {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:W,height:H}});
  await ctx.addInitScript(() => { window.WebSocket = class { constructor(){ this.readyState=0; } send(){} close(){} }; });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => { const path=new URL(route.request().url()).pathname; const json=(o)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
    if (path.endsWith('/session/bootstrap')) return json({profile:{id:5,name:'Я',photo:null},flags:{consent_ok:true,tutorial_done:true},terms_version:1,settings:{rulesCard:false},settings_updated_at:Date.now()+9999,stats:{best_all:50,best_tier:0,best_week:50,last_score:50,total_runs:3,rank_all:9,rank_week:9,last_tier:0,items_mask:0},shop:{coins:5,owned,loadout:{},decor,catalog,products},server_time:Date.now(),ads:{}}); return json({ok:true}); });
  await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&sign=x&weather=${weather}`); await p.waitForTimeout(2200);
  if (extra) await extra(p);
  await p.screenshot({path:`${OUT}/live_${name}.png`}); 
  const r = errs; await b.close(); return r;
}
const all=[]; const note=(n,e)=>{ console.log(n, e); all.push(...e); };
note('rain', await shot('rain','rain'));
note('fog', await shot('fog','fog'));
note('leaves', await shot('leaves','leaves'));
note('birds', await shot('birds','birds'));
// taps: switch the TV off and the lamp off, bounce the ball
note('taps', await shot('none','taps', async (p) => {
  const box = await p.locator('#menuHero').boundingBox();
  const tap = async (nx, ny, dy) => { await p.mouse.click(box.x + nx*box.width, box.y + ny*box.height - dy); await p.waitForTimeout(250); };
  await tap(0.8, 0.95, 40); // tv
  await tap(0.1, 0.9, 45); // lamp
  await tap(0.6, 0.97, 10); // football
  console.log('state:', await p.evaluate(()=>localStorage.getItem('sl_menu_state')));
  await p.waitForTimeout(150);
}));

console.log('hscroll false', 'errors', all);
