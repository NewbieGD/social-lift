const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || 'e2e/.out';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const W = Number(process.argv[2]||390), H = Number(process.argv[3]||844);
const catalog = JSON.parse(readFileSync('./e2e/catalog.json','utf8')).catalog;
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:W,height:H}});
await ctx.addInitScript(() => { window.WebSocket = class { constructor(){ this.readyState=0; } send(){} close(){} }; });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error' && !/WebSocket|404/.test(m.text())) errs.push(m.text()); });
let hide = false; const puts=[];
const rows = [
  {rank:1,user_id:101,name:'Анна К.',photo:null,deactivated:false,link:true,score:5400},
  {rank:2,user_id:102,name:'Борис П.',photo:null,deactivated:false,link:false,score:3100},
  {rank:3,user_id:103,name:'Вика С.',photo:null,deactivated:false,link:true,score:2200},
  {rank:4,user_id:5,name:'Я',photo:null,deactivated:false,link:true,score:1050},
];
const profile = (id)=>({id,name:id===101?'Анна К.':'Борис П.',photo:null,link:id===101,crown:id===101,stats:{best_all:5400,best_tier:9,last_tier:9,rank_all:1,rank_week:1,duel_wins:12,total_runs:140,best_combo:44},items_mask:0b11111,loadout:{head:'steel_head',torso:'steel_torso',arms:'steel_arms',legs:'steel_legs'},decor:{bg:'bg_neon',pet:'pet_cat',frame:'frame_gold',props:[{id:'prop_cup',x:0.9,y:0.88,r:0},{id:'prop_tv',x:0.62,y:0.96,r:0},{id:'prop_bat',x:0.07,y:0.9,r:90}]},styles_owned:9,styles_total:28,collection_owned:22,collection_total:48});
await p.route('https://sociallift1-vkgamer.mia0.amvera.tech/api/**', async (route) => {
  const req=route.request(); const path=new URL(req.url()).pathname;
  const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  if (path.endsWith('/session/bootstrap')) return json({profile:{id:5,name:'Я',photo:null},flags:{consent_ok:true,tutorial_done:true},terms_version:1,settings:{rulesCard:false},settings_updated_at:Date.now()+9999,stats:{best_all:1050,best_tier:6,best_week:300,last_score:200,total_runs:12,rank_all:4,rank_week:4,last_tier:6,items_mask:0},shop:{coins:100,owned:[],loadout:{},decor:{},catalog},privacy:{hide_vk_link:hide},server_time:Date.now(),ads:{}});
  if (path.endsWith('/privacy')) { hide = JSON.parse(req.postData()).hide_vk_link; puts.push(hide); return json({hide_vk_link:hide}); }
  if (path.includes('/players/')) { const id=Number(path.split('/').pop()); return id===999?json({error:{code:'no_player',message:'x'}},404):json(profile(id)); }
  if (path.endsWith('/leaderboard')) return json({scope:'all',week_id:'w',reset_at:Date.now()+1e8,server_time:Date.now(),rows,me:{score:1050,rank:4,next_rank:3,gap_to_next:1150}});
  return json({ok:true});
});
const top = () => p.evaluate(()=>document.querySelector('#screens .screen:not(.leaving)')?.dataset.screen ?? null);
await p.goto(`${BASE}/index.html?vk_user_id=5&vk_app_id=7&sign=x`); await p.waitForTimeout(1500);
await p.screenshot({path:`${OUT}/pf_menu_${W}.png`});
// Menu button
await p.click('[data-arg="moreMenu"]', {force:true}); await p.waitForTimeout(500);
console.log('more', await top(), 'rows', await p.locator('.menu-row').count());
await p.screenshot({path:`${OUT}/pf_more_${W}.png`});
await p.click('[data-action="openFromMore"][data-arg="settings"]'); await p.waitForTimeout(900);
console.log('after more->settings', await top(), 'hide switch', await p.locator('[data-privacy="hideVk"]').count());
await p.click('[data-privacy="hideVk"]', {force:true}); await p.waitForTimeout(500);
console.log('privacy puts', JSON.stringify(puts), 'checked', await p.isChecked('[data-privacy="hideVk"]'));
await p.screenshot({path:`${OUT}/pf_settings_${W}.png`});
await p.click('[data-action="back"]'); await p.waitForTimeout(700);
// leaderboard -> choice -> game profile
await p.click('[data-arg="leaders"]', {force:true}); await p.waitForTimeout(1200);
await p.click('[data-action="profile"][data-arg="102"]'); await p.waitForTimeout(500);
console.log('choice', await top(), 'vk btn', await p.locator('[data-action="openVkProfile"]').count(), '(Борис скрыл ссылку)');
await p.screenshot({path:`${OUT}/pf_choice2_${W}.png`});
await p.click('[data-action="back"]'); await p.waitForTimeout(600);
await p.click('[data-action="profile"][data-arg="101"]'); await p.waitForTimeout(500);
console.log('vk btn for Anna', await p.locator('[data-action="openVkProfile"]').count());
await p.screenshot({path:`${OUT}/pf_choice1_${W}.png`});
await p.click('[data-action="openGameProfile"][data-arg="101"]'); await p.waitForTimeout(2500);
console.log('profile screen', await top(), 'stats', await p.locator('.profile-screen .ward-stats div').count());
await p.screenshot({path:`${OUT}/pf_profile_${W}.png`});
console.log('hscroll', await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1), 'errors', errs);
await b.close();
