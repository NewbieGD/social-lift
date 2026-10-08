const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
import { chromium } from 'playwright';
const W = Number(process.argv[2]||390), H = Number(process.argv[3]||844);
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:W,height:H}});
await ctx.addInitScript(() => {
  class FakeWS { constructor(){ this.readyState=0; window.__ws=this; window.__sent=[]; setTimeout(()=>{ this.readyState=1; this.onopen&&this.onopen({}); this.emit({t:'online',n:3}); },50); }
    emit(m){ this.onmessage&&this.onmessage({data:JSON.stringify(m)}); }
    send(raw){ const m=JSON.parse(raw); window.__sent.push(m);
      if (m.t==='spec_list') this.emit({t:'spec_list',duels:[{id:'d'.repeat(36),a:{id:1,name:'Анна К.',photo:null},b:{id:2,name:'Борис П.',photo:null},elapsed:75,watchers:2}]});
      if (m.t==='spec_join') this.emit({t:'spec_start',duel:m.duel,seed:777,elapsed_ms:12000,players:[{id:1,name:'Анна К.',photo:null,look:{loadout:{head:'steel_head',torso:'steel_torso',arms:'steel_arms',legs:'steel_legs'},pet:'pet_parrot'}},{id:2,name:'Борис П.',photo:null,look:{loadout:{head:'seraph_head',torso:'seraph_torso',arms:'seraph_arms',legs:'seraph_legs',torch:'seraph_torch'},pet:'pet_spark'}}],logs:{'1':[[0,8,1]],'2':[[0,-8,1]]},scores:{'1':null,'2':null}});
    } close(){} }
  FakeWS.OPEN=1; window.WebSocket=FakeWS; });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error'&&!/404/.test(m.text())) errs.push(m.text()); });
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => { const path=new URL(route.request().url()).pathname; const json=(o)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if (path.endsWith('/session/bootstrap')) return json({profile:{id:5,name:'Я',photo:null},flags:{consent_ok:true,tutorial_done:true},terms_version:1,settings:{rulesCard:false},settings_updated_at:Date.now()+9999,stats:{best_all:50,best_tier:0,best_week:50,last_score:50,total_runs:3,rank_all:9,rank_week:9,last_tier:0,items_mask:0},shop:{coins:900,owned:[],loadout:{},decor:{},catalog:[],products:[]},server_time:Date.now(),ads:{}}); return json({ok:true}); });
const top = () => p.evaluate(()=>document.querySelector('#screens .screen:not(.leaving)')?.dataset.screen ?? null);
await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&sign=x`); await p.waitForTimeout(1500);
await p.click('[data-arg="duels"]'); await p.waitForTimeout(800);
await p.click('[data-action="specOpen"]'); await p.waitForTimeout(800);
console.log('errs so far:', errs); console.log('list screen:', await top(), '| rows:', await p.locator('.spec-row').count());
await p.screenshot({path:`${OUT}/sp_list_${W}.png`});
await p.click('[data-action="specJoin"]'); await p.waitForTimeout(2500);
console.log('spectate screen:', await top(), '| canvases:', await p.locator('.spec-field canvas').count());
const dims = await p.evaluate(()=>['specA','specB'].map(id=>{const c=document.getElementById(id); return [c.width,c.height]}));
console.log('canvas sizes', JSON.stringify(dims));
await p.waitForTimeout(2500);
console.log('scores', await p.textContent('#specAScore'), await p.textContent('#specBScore'));
await p.screenshot({path:`${OUT}/sp_watch_${W}.png`});
await p.evaluate(()=>window.__ws.emit({t:'spec_dead',duel:'d'.repeat(36),uid:1,score:321}));
await p.evaluate(()=>window.__ws.emit({t:'spec_end',duel:'d'.repeat(36),outcome:{'1':'loss','2':'win'}})); await p.waitForTimeout(500);
console.log('result:', await p.textContent('#specResult'), '| score A', await p.textContent('#specAScore'));
await p.click('[data-action="specLeave"]'); await p.waitForTimeout(600);
console.log('left, sent:', JSON.stringify(await p.evaluate(()=>window.__sent.map(m=>m.t))), 'screen', await top());
console.log('hscroll', await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1), 'errors', errs);
await b.close();
