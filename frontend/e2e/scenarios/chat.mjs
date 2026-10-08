const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
import { chromium } from 'playwright';
const W = Number(process.argv[2]||390), H = Number(process.argv[3]||844);
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:W,height:H}});
await ctx.addInitScript(() => {
  class FakeWS {
    constructor() { this.readyState = 0; window.__ws = this; window.__sent = []; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); this.emit({t:'online', n: 3}); }, 50); }
    emit(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }
    send(raw) { const m = JSON.parse(raw); window.__sent.push(m);
      if (m.t === 'report') this.emit({t:'report_ok'});
      if (m.t === 'chat_join') { const now = Date.now(); const u = (id,name,rank)=>({id,name,photo:null,rank,link:true});
        this.emit({t:'chat_hist', wait:0, users:[u(5,'Я',9),u(201,'Грубиян Г.',3),u(202,'Добрый Д.',4)], msgs:[
          {id:11, ts: now-60000, user:u(201,'Грубиян Г.',3), text:'ты ничтожество, не умеешь играть'},
          {id:12, ts: now-30000, user:u(202,'Добрый Д.',4), text:'всем привет! кто дуэлится?'},
          {id:13, ts: now-10000, user:u(201,'Грубиян Г.',3), text:'вторая грубость'} ]}); }
    }
    close() {}
  }
  FakeWS.OPEN = 1; window.WebSocket = FakeWS;
});
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error' && !/404/.test(m.text())) errs.push(m.text()); });
let blocked = []; let coins = 120;
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => {
  const req=route.request(); const path=new URL(req.url()).pathname; const method=req.method();
  const json=(o)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if (path.endsWith('/session/bootstrap')) return json({profile:{id:5,name:'Я',photo:null},flags:{consent_ok:true,tutorial_done:true},terms_version:1,settings:{rulesCard:false},settings_updated_at:Date.now()+9999,stats:{best_all:50,best_tier:0,best_week:50,last_score:50,total_runs:3,rank_all:9,rank_week:9,last_tier:0,items_mask:0},shop:{coins,owned:[],loadout:{},decor:{},catalog:[],products:[]},server_time:Date.now(),ads:{}});
  if (path.endsWith('/chat/blocks')) return json({blocked});
  if (path.endsWith('/chat/block') && method==='POST') { const id=JSON.parse(req.postData()).user_id; if (!blocked.find(x=>x.id===id)) blocked.push({id,name:'Грубиян Г.',photo:null}); return json({blocked}); }
  if (path.includes('/chat/block/') && method==='DELETE') { const id=Number(path.split('/').pop()); blocked=blocked.filter(x=>x.id!==id); return json({blocked}); }
  if (path.endsWith('/shop')) return json({coins,owned:[],loadout:{},decor:{},catalog:[],products:[]});
  return json({ok:true}); });
const top = () => p.evaluate(()=>document.querySelector('#screens .screen:not(.leaving)')?.dataset.screen ?? null);
await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&vk_platform=mobile_android&sign=x`); await p.waitForTimeout(1500);
// duels: stake note and the disabled button with 120 coins
await p.click('[data-arg="duels"]'); await p.waitForTimeout(900);
console.log('duels: stake note:', (await p.locator('.duel-card.stake').first().textContent()).replace(/\s+/g,' ').slice(0,110), '| find disabled:', await p.locator('[data-action="duelFind"]').isDisabled());
await p.screenshot({path:`${OUT}/ch_duels_${W}.png`});
await p.click('[data-action="back"]'); await p.waitForTimeout(500);
// chat
await p.click('[data-arg="chat"]'); await p.waitForTimeout(1200);
console.log('chat messages:', await p.locator('.chat-msg').count(), '| ⋯ buttons:', await p.locator('.chat-more').count(), '| links:', await p.locator('.chat-links button').count());
await p.screenshot({path:`${OUT}/ch_chat_${W}.png`});
await p.locator('.chat-more').first().click(); await p.waitForTimeout(500);
console.log('menu screen:', await top());
await p.screenshot({path:`${OUT}/ch_menu_${W}.png`});
await p.click('[data-action="reportAsk"]'); await p.waitForTimeout(400);
await p.click('[data-action="reportSend"][data-arg="abuse"]'); await p.waitForTimeout(500);
const toastTop = await p.evaluate(()=>{ const t=document.querySelector('.toast-top'); if(!t) return 'no toast-top'; const z=(el)=>Number(getComputedStyle(el).zIndex)||0; const layer=document.getElementById('screens'); return (t.classList.contains('on')?'shown':'hidden')+', z-index '+z(t)+' above the screens '+z(layer)+': '+(z(t)>z(layer)?'ok':'BEHIND'); });
console.log('report toast:', toastTop);
console.log('report sent:', JSON.stringify(await p.evaluate(()=>window.__sent.filter(m=>m.t==='report'))), 'screen:', await top());
// block the author of the first message
await p.locator('.chat-more').first().click(); await p.waitForTimeout(400);
await p.click('[data-action="blockAsk"]'); await p.waitForTimeout(400);
await p.screenshot({path:`${OUT}/ch_block_${W}.png`});
await p.click('[data-action="blockDo"]'); await p.waitForTimeout(900);
console.log('after block: messages', await p.locator('.chat-msg').count(), '| blocked link:', (await p.locator('#blockedLink').textContent()));
// the server removes a message after enough complaints
await p.evaluate(()=>window.__ws.emit({t:'chat_remove', id:12})); await p.waitForTimeout(300);
console.log('after server removal: messages', await p.locator('.chat-msg').count());
// rules and the list of blocked
await p.click('[data-arg="chatRules"]'); await p.waitForTimeout(700);
console.log('rules page headings:', await p.locator('.chat-rules-page h3').count());
await p.screenshot({path:`${OUT}/ch_rules_${W}.png`});
await p.click('[data-action="back"]'); await p.waitForTimeout(500);
await p.click('#blockedLink'); await p.waitForTimeout(700);
console.log('blocked rows:', await p.locator('.blocked-row').count());
await p.screenshot({path:`${OUT}/ch_blocked_${W}.png`});
await p.click('[data-action="unblock"]'); await p.waitForTimeout(700);
console.log('after unblock rows:', await p.locator('.blocked-row').count());
// The author of a reported message is warned.
await p.evaluate(()=>window.__ws.emit({t:'chat_warned', removed:false, text:'ты ничтожество'})); await p.waitForTimeout(400);
console.log('warning window:', await top(), '|', (await p.locator('.msg-menu h2').first().textContent()));
await p.click('[data-action="back"]'); await p.waitForTimeout(300);
if ((await top()) === 'blocked') { await p.click('[data-action="back"]'); await p.waitForTimeout(400); }
// The phone keyboard shrinks the page: the chat must keep a usable width.
await p.focus('#chatInput, .chat-compose input, input[type="text"]'); await p.setViewportSize({width: W, height: Math.round(H*0.45)}); await p.waitForTimeout(500);
const wInput = await p.evaluate(()=>{ const i=document.querySelector('#chatInput, .chat-compose input, input[type="text"]'); return Math.round(i.getBoundingClientRect().width); });
console.log('input width with the keyboard open:', wInput, wInput >= 150 ? 'ok' : 'TOO SMALL');
console.log('hscroll', await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1), 'errors', errs);
await b.close();
