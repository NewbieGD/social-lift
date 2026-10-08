const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
import { chromium } from 'playwright';
const W = Number(process.argv[2]||390), H = Number(process.argv[3]||844);
const b = await chromium.launch();
const ctx = await b.newContext({viewport:{width:W,height:H},deviceScaleFactor:1});
await ctx.addInitScript(() => {
  class FakeWS {
    constructor(url) { this.readyState = 0; window.__ws = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); this.emit({t:'online', n: 3}); }, 50); }
    emit(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }
    send(raw) { const m = JSON.parse(raw); (window.__sent = window.__sent || []).push(m.t);
      if (m.t === 'find') setTimeout(() => this.emit({t:'start', duel:'x'.repeat(36), seed: 777, start_at: Date.now()+1500, ticket:{run_id:'22222222-2222-2222-2222-222222222222', seed:777, started_at: Date.now(), token:'1.a'}, opponent:{id:9, name:'Соперник С.', photo:null, look:{loadout:{head:'steel_head',torso:'steel_torso',arms:'steel_arms',legs:'steel_legs'},pet:'pet_parrot'}}}), 200);
      if (m.t === 'inputs') setTimeout(() => this.emit({t:'inputs', upto: m.upto, log: m.log}), 120); // mirror: opponent = our own inputs
    }
    close() {}
  }
  FakeWS.OPEN = 1;
  window.WebSocket = FakeWS;
});
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => {
  const req=route.request(); const path=new URL(req.url()).pathname;
  const json=(o)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if (path.endsWith('/session/bootstrap')) return json({profile:{id:5,name:'Я',photo:null},flags:{consent_ok:true,tutorial_done:true},terms_version:1,settings:{},settings_updated_at:0,stats:{best_all:10,best_tier:0,best_week:10,last_score:10,total_runs:5,rank_all:3,rank_week:1,items_mask:3},server_time:Date.now(),ads:{}});
  if (path.endsWith('/runs/finish')) { const body=JSON.parse(req.postData()); return json({run_id:body.run_id,status:'finished',reason:null,score:body.score,best_all:10,best_tier:0,best_week:10,is_record:false,is_week_record:false,rank_all:3,rank_week:1,prev_rank_all:3,prev_rank_week:1,duel:{status:'done',outcome:{'5':'win','9':'loss'}}}); }
  return json({ok:true});
});
const top = () => p.evaluate(()=>document.querySelector('#screens .screen:not(.leaving)')?.dataset.screen ?? null);
await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&sign=x`); await p.waitForTimeout(1500);
console.log('menu', await top());
await p.click('[data-action="open"][data-arg="duels"]'); await p.waitForTimeout(500);
await p.screenshot({path:`${OUT}/duels_${W}.png`});
await p.click('[data-action="duelFind"]'); await p.waitForTimeout(2600);
console.log('after start', await top());
await p.keyboard.press('Digit1');
for (let i=0;i<10;i++){ const k=i%2?'ArrowLeft':'ArrowRight'; await p.keyboard.down(k); await p.waitForTimeout(400); await p.keyboard.up(k); }
await p.screenshot({path:`${OUT}/duelrun_${W}.png`}); const ob = await p.evaluate(()=>{const r=document.getElementById('oppWrap').getBoundingClientRect(); const b=document.getElementById('board').getBoundingClientRect(); return [Math.round(r.width), Math.round(b.width), getComputedStyle(document.getElementById('oppWrap')).display]}); console.log('opp panel', JSON.stringify(ob)); await p.evaluate(()=>document.body.classList.add('hide-opp')); console.log('hidden display:', await p.evaluate(()=>getComputedStyle(document.getElementById('oppWrap')).display)); await p.evaluate(()=>document.body.classList.remove('hide-opp'));
for (let i=0;i<60;i++){ if((await top())==='result') break; const k=i%3===0?'ArrowLeft':'ArrowRight'; await p.keyboard.down(k); await p.waitForTimeout(600); await p.keyboard.up(k); }
await p.waitForTimeout(1500);
console.log('result', await top());
console.log('sent', (await p.evaluate(()=>window.__sent)).slice(0,8).join(','), 'errors', errs);
await b.close();
