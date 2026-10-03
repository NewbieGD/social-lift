import '@fontsource-variable/rubik';
import './styles.css';
import { audio } from './audio/audio';
import { PROFILE_URL, SUPPORT_URL, TERMS_VERSION } from './config';
import { gameConfig, type ColorId, type LightId } from './core/gameConfig';
import { randomSeed } from './core/prng';
import { DT, Sim } from './core/sim';
import type { SimEvent } from './core/types';
import { ru } from './i18n/ru';
import { DEFAULT_KEYS, InputController, keyLabel, STEER_CODES } from './input/input';
import { ApiError } from './net/api';
import { Session, type RunTicket, type Stats } from './net/session';
import { haptic, hapticsSupported, initHaptics } from './platform/haptics';
import { ads, DEFAULT_ADS, type AdsConfig } from './platform/ads';
import { canShare, initShare, shareStory, shareWall } from './platform/share';
import { lockGestures } from './platform/gestures';
import { askNotifications, initVk } from './platform/vk';
import { DuelClient, type DuelMsg, type DuelPlayer } from './net/duel';
import { scenes } from './render/palette';
import { drawItem, ITEM_BY_TIER, itemCount, outfitFromMask, type Item } from './render/hero';
import { drawHeroFront } from './render/heroFront';
import { Renderer } from './render/renderer';
import { applyControls } from './ui/controlsLayout';
import { $ } from './ui/dom';
import { Router } from './ui/router';
import { Tutorial } from './ui/tutorial';
import { settingsStore, type KeySetting, type Settings } from './ui/settingsStore';
import * as V from './ui/views';

// ---------- Elements ----------

const field = $('field');
const board = $('board');
const canvas = $<HTMLCanvasElement>('game');
const scoreEl = $('score');
const comboEl = $('combo');
const tierEl = $('tier');
const hintEl = $('hint');
const toastEl = $('toast');
const walletEl = scoreEl.parentElement as HTMLElement;
const buttonsEl = $('buttons');
const controlsEl = $('controls');
const countdownEl = $('countdown');
const pressEl = $('press');
const floorEl = $('floor');
const comboBar = $('comboBar');
const shatterEl = $('shatter');
const edgeGlow = $('edgeGlow');
const walletIcon = $('walletIcon');
const bonusEl = $('bonus');
const tutCardEl = $('tutCard');

const renderer = new Renderer(canvas);
const backdrop = $<HTMLCanvasElement>('backdrop');
const input = new InputController([field]);
const session = new Session();
const router = new Router($('screens'));
const isTouch = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;

// ---------- Game state ----------

type Mode = 'menu' | 'run' | 'tutorial' | 'result';
// The live duel in progress (declared early: layout() reads it).
// eslint-disable-next-line prefer-const
let duel: DuelRun | null = null;
let mode: Mode = 'menu';
let sim = new Sim(randomSeed(), 700);
let paused = false;
let deathTimer = -1;
let acc = 0;
let last = performance.now();
let shownScore = 0;
let ticket: RunTicket | null = null;
let starting = false;
let countdown = 0;
let resumeToken = 0;

// ---------- Layout ----------

/** Desktop browser with a wide window: bigger field, full-screen scene, buttons beside the field. */
function isWide(): boolean {
  return window.innerWidth >= 900 && window.innerWidth > window.innerHeight * 1.2;
}

function layout(): void {
  const wide = isWide();
  if (document.body.classList.contains('wide') !== wide) {
    document.body.classList.toggle('wide', wide);
    applySettings(settingsStore.get());
    return; // applySettings calls layout again with the new arrangement
  }
  const rect = field.getBoundingClientRect();
  const W = gameConfig.world.width;
  const { minHeight, maxHeight } = gameConfig.world;
  // The world is the same width everywhere (same game for every player, rule 2.3.7);
  // a wide screen gets a taller, bigger field and the scene around it.
  // Duels use one fixed view height so both players' simulations stay identical.
  const viewH = wide || duel ? 700 : Math.max(minHeight, Math.min(maxHeight, (W * rect.height) / Math.max(1, rect.width)));
  const scale = wide ? Math.min(rect.height / viewH, rect.width / W) : Math.min(rect.width / W, rect.height / viewH, 480 / W);
  const cssW = Math.floor(W * scale);
  const cssH = Math.floor(viewH * scale);
  board.style.width = `${cssW}px`;
  // Screens keep their content inside the play column (desktop shows side margins).
  document.documentElement.style.setProperty('--board-w', `${cssW}px`);
  board.style.height = `${cssH}px`;
  renderer.resize(cssW, cssH, scale);
  input.scale = scale;
  sim.setViewHeight(viewH);
  controlsEl.style.maxWidth = `${Math.max(cssW, 300)}px`;
}

new ResizeObserver(layout).observe(field);
window.addEventListener('orientationchange', () => setTimeout(layout, 200));

// ---------- Light buttons ----------

const LIGHTS: LightId[] = ['red', 'yellow', 'blue', 'green'];
const ICONS: Record<LightId, string> = {
  yellow: '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/>',
  blue: '<path d="M12 2l8 10-8 10-8-10z"/>',
  green: '<path d="M12 3l10 17H2z"/>',
  red: '<path d="M4 4h16v7c0 5.5-3.6 9.3-8 11-4.4-1.7-8-5.5-8-11z"/>',
};
const LOCK = '<path d="M7 10V7a5 5 0 0110 0v3h1.5v11h-13V10zm2.5 0h5V7a2.5 2.5 0 00-5 0z"/>';
const buttons = new Map<LightId, HTMLButtonElement>();

for (const light of LIGHTS) {
  const b = document.createElement('button');
  b.className = 'light-btn';
  b.dataset.light = light;
  b.setAttribute('aria-label', ru.colors[light]);
  buttonsEl.appendChild(b);
  buttons.set(light, b);
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // The floating shield sits on the play field: don't let the press start a steering drag.
    e.stopPropagation();
    if (b.classList.contains('locked')) return;
    b.classList.add('pressed');
    input.press(light);
  });
  const release = (): void => b.classList.remove('pressed');
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  b.addEventListener('pointerleave', release);
}

function renderButtons(): void {
  for (const light of LIGHTS) {
    const b = buttons.get(light)!;
    const locked = !sim.lightAvailable(light);
    b.classList.toggle('locked', locked);
    b.classList.toggle('active', sim.light === light);
    const label = light === 'red' ? ru.common.shield : `+${gameConfig.colors[light as ColorId].points}`;
    const html = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${locked ? LOCK : ICONS[light]}</svg><span>${label}</span>`;
    if (b.dataset.html !== html) {
      b.innerHTML = html;
      b.dataset.html = html;
    }
  }
}

// ---------- Settings ----------

function keyBindings(s: Settings): Record<LightId, string> {
  return { yellow: s.keyYellow, blue: s.keyBlue, green: s.keyGreen, red: s.keyRed };
}

function applySettings(s: Settings, changed?: (keyof Settings)[]): void {
  // Beside the wide field the buttons stand in one column.
  const placement = document.body.classList.contains('wide') ? { layout: 'row' as const, side: 'left' as const } : s;
  applyControls(placement, { controls: controlsEl, buttons: buttonsEl, board, shield: buttons.get('red')! });
  input.mode = s.steer;
  input.sensitivity = s.sens;
  const keys = keyBindings(s);
  input.setBindings(keys);
  for (const light of LIGHTS) buttons.get(light)!.dataset.key = keyLabel(keys[light]);
  board.classList.toggle('zones', s.steer === 'zones');
  renderer.reducedEffects = s.reducedFx;
  renderer.colorblind = s.colorblind;
  renderer.cinematic = s.cinematic;
  document.body.classList.toggle('reduced', s.reducedFx);
  audio.musicOn = s.music;
  audio.musicVol = s.musicVol;
  audio.sfxVol = s.sfxVol;
  audio.applyVolumes();
  if (!changed || changed.some((k) => k === 'layout' || k === 'side')) layout();
}

settingsStore.onChange((s, changed) => {
  applySettings(s, changed);
  // Keep the settings screen in sync (e.g. sensitivity row appears for drag mode).
  if (router.top === 'settings' && changed.some((k) => k === 'steer' || k === 'layout' || k === 'side')) router.refresh();
});
settingsStore.pusher = (s, updatedAt) => void session.saveSettings({ ...s }, updatedAt);
applySettings(settingsStore.get());

// ---------- HUD & feedback ----------

let prevLight: LightId | null = null;

let lastMult = 1;
let lastWallSound = 0;
let captionTimer = 0;
renderer.onCaption = (kind, value) => {
  const el = document.getElementById('caption');
  if (!el) return;
  if (kind === 'stage') {
    el.innerHTML = `<span class="cap-label">${ru.look.stage}</span><span class="cap-items">${ru.tiers[value]}</span>`;
  } else {
    const n = itemCount(sim.owned);
    el.innerHTML = `<span class="cap-label">${ru.look.item(n)}</span><span class="cap-items">${ru.items[ITEM_BY_TIER[value]]}</span>`;
  }
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(captionTimer);
  captionTimer = window.setTimeout(() => el.classList.remove('on'), 3800);
};

renderer.onFlightStart = () => audio.play('servo');
renderer.onItemSnap = (item) => {
  audio.play('snap', { item });
  if (settingsStore.get().vibration) haptic('light');
};

const WALLETS = [
  // Worn wallet, billfold, briefcase, safe.
  '<svg viewBox="0 0 28 20"><rect x="1" y="3" width="26" height="15" rx="3" fill="#8A6A4A"/><rect x="1" y="3" width="26" height="5" rx="2" fill="#6B5038"/><circle cx="21" cy="12" r="2" fill="#C9A77A"/></svg>',
  '<svg viewBox="0 0 28 20"><rect x="1" y="2" width="26" height="16" rx="3" fill="#2E2A28"/><rect x="4" y="0" width="16" height="7" rx="1" fill="#8FDC98"/><rect x="1" y="6" width="26" height="12" rx="3" fill="#3A3432"/><rect x="18" y="9" width="9" height="5" rx="2" fill="#C9A77A"/></svg>',
  '<svg viewBox="0 0 28 20"><rect x="10" y="0" width="8" height="4" rx="1.5" fill="none" stroke="#C7CCD6" stroke-width="2"/><rect x="1" y="4" width="26" height="15" rx="2.5" fill="#1F2A44"/><rect x="1" y="9" width="26" height="2" fill="#C7CCD6"/><rect x="12" y="8" width="4" height="4" rx="1" fill="#E8C060"/></svg>',
  '<svg viewBox="0 0 28 20"><rect x="1" y="1" width="26" height="18" rx="3" fill="#D9A520"/><rect x="3" y="3" width="22" height="14" rx="2" fill="#F1C84B"/><circle cx="14" cy="10" r="4.5" fill="none" stroke="#8A5A00" stroke-width="2"/><path d="M14 6v8M10 10h8" stroke="#8A5A00" stroke-width="1.5"/></svg>',
];

/** The wallet in the HUD grows with wealth. */
function setWallet(tier: number): void {
  const i = tier >= 9 ? 3 : tier >= 6 ? 2 : tier >= 3 ? 1 : 0;
  if (walletIcon.dataset.i === String(i)) return;
  walletIcon.dataset.i = String(i);
  walletIcon.innerHTML = WALLETS[i];
}

let floorTimer = 0;
/** Elevator floor display at the top of the field when a new tier is reached. */
function showFloor(tier: number): void {
  const prev = Math.max(1, tier);
  floorEl.innerHTML = `<span class="floor-arrow">▲</span><span class="floor-num"><b class="old">${prev}</b><b class="new">${tier + 1}</b></span><span class="floor-name">${ru.tiers[tier]}</span>`;
  floorEl.classList.remove('on');
  void floorEl.offsetWidth;
  floorEl.classList.add('on');
  clearTimeout(floorTimer);
  floorTimer = window.setTimeout(() => floorEl.classList.remove('on'), 2200);
}

/** A soft golden glow along the field edges for each combo step. */
function comboStep(mult: number): void {
  audio.play('combo');
  audio.setIntense(mult >= 3);
  if (settingsStore.get().reducedFx) return;
  edgeGlow.classList.remove('on');
  void edgeGlow.offsetWidth;
  edgeGlow.classList.add('on');
}

/** The multiplier cracks and crumbles when the streak breaks. */
function comboBreak(mult: number): void {
  audio.play('break');
  audio.setIntense(false);
  if (settingsStore.get().reducedFx) return;
  const text = ru.hud.combo(mult);
  shatterEl.innerHTML = [0, 1, 2, 3].map((i) => `<span class="shard s${i}">${text}</span>`).join('');
  shatterEl.classList.remove('on');
  void shatterEl.offsetWidth;
  shatterEl.classList.add('on');
}

renderer.onBillArrive = () => {
  walletEl.classList.remove('bump');
  void walletEl.offsetWidth;
  walletEl.classList.add('bump');
};

/** Buttons and panels change material with wealth: cardboard, glass, metal, gold. */
function setSkin(tier: number): void {
  const skin = tier >= 9 ? 3 : tier >= 6 ? 2 : tier >= 3 ? 1 : 0;
  for (let i = 0; i < 4; i++) document.body.classList.toggle(`skin-${i}`, i === skin);
}

let pressTimer = 0;
/** Fictional press notes at the edge of the field (never over the HUD or buttons), at most 2.5 s. */
function showPress(outlet: string, title: string, kind: 'news' | 'cover'): void {
  if (settingsStore.get().reducedFx) return;
  pressEl.className = `press ${kind}`;
  pressEl.innerHTML = `<span class="press-outlet">${outlet}</span><span class="press-title">${title}</span>`;
  void pressEl.offsetWidth;
  pressEl.classList.add('on');
  clearTimeout(pressTimer);
  pressTimer = window.setTimeout(() => pressEl.classList.remove('on'), 2500);
}

let toastTimer = 0;
function toast(text: string, ms = 1600): void {
  toastEl.textContent = text;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), ms);
}

function handleUiEvents(events: SimEvent[]): void {
  for (const e of events) {
    if (e.type === 'capture') {
      audio.play('capture', { color: e.color, streak: sim.streak });
      const m = sim.multiplier;
      if (m > lastMult && m >= 2) comboStep(m);
      lastMult = m;
      if (settingsStore.get().vibration) haptic('light');
    } else if (e.type === 'land') {
      audio.play('jump', { tier: sim.tier });
    } else if (e.type === 'warn') {
      audio.play('tick');
    } else if (e.type === 'light') {
      if (e.light === 'red') audio.play('auraOn');
      else if (prevLight === 'red') audio.play('auraOff');
      prevLight = e.light;
    } else if (e.type === 'unlock') {
      const b = buttons.get(e.color)!;
      b.classList.add('unlocking');
      setTimeout(() => b.classList.remove('unlocking'), 800);
      toast(`${ru.hud.newColor} ${ru.colors[e.color]}`);
      audio.play('unlock');
    } else if (e.type === 'tier') {
      showFloor(e.tier);
      setWallet(e.tier);
      document.body.style.backgroundColor = scenes[e.tier].page;
      audio.setTier(e.tier);
      audio.play('bell');
      setSkin(e.tier);
      if (mode === 'run') session.event('tier_reached', e.tier);
      if (e.tier === 7) showPress(ru.press.outlet, ru.press.talked, 'news');
      if (e.tier === 10) showPress(ru.press.magazine, ru.press.cover, 'cover');
    } else if (e.type === 'comboReset') {
      if (lastMult >= 2) comboBreak(lastMult);
      lastMult = 1;
    } else if (e.type === 'close') {
      audio.play('close');
    } else if (e.type === 'wall') {
      const now = performance.now();
      if (now - lastWallSound > 250) {
        lastWallSound = now;
        audio.play('wall');
      }
    } else if (e.type === 'death') {
      audio.stopTension();
      audio.play('death');
      if (settingsStore.get().vibration) haptic('heavy');
      deathTimer = 0;
      if (duel) {
        flushDuelInputs(true);
        duelClient.send({ t: 'dead', score: sim.score });
      }
    } else if (e.type === 'rescue') {
      toast(e.reason === 'red' ? ru.tutorial.shieldOn : ru.tutorial.rescued, 2600);
    }
  }
}

function updateHud(dt: number): void {
  if (shownScore < sim.score) {
    shownScore = Math.min(sim.score, shownScore + Math.max(1, (sim.score - shownScore) * dt * 10));
  }
  scoreEl.textContent = String(Math.floor(shownScore));
  const mult = sim.multiplier;
  comboEl.textContent = ru.hud.combo(mult);
  comboEl.classList.toggle('on', mult > 1);
  const pct = Math.round((sim.itemBonus - 1) * 100);
  const bonusText = pct > 0 ? `+${pct}%` : '';
  if (bonusEl.textContent !== bonusText) bonusEl.textContent = bonusText;
  // Remaining time of the 2.5 s combo window, as a shrinking bar (transform only).
  const left = sim.streak > 0 ? Math.max(0, 1 - (sim.time - sim.lastCaptureTime) / gameConfig.combo.windowSec) : 0;
  comboBar.style.transform = `scaleX(${left.toFixed(3)})`;
  comboBar.parentElement!.classList.toggle('on', sim.streak > 0 && mode !== 'menu');
  audio.setDanger(mode === 'run' && !paused ? renderer.danger : 0);
  tierEl.textContent = mode === 'tutorial' ? ru.tutorial.badge : ticket || mode !== 'run' ? ru.tiers[sim.tier] : ru.hud.unranked;
  const hint = mode === 'tutorial' ? tutorial.hint() : '';
  if (hintEl.dataset.text !== hint) {
    hintEl.dataset.text = hint;
    hintEl.textContent = hint;
  }
  hintEl.classList.toggle('on', hint !== '' && !paused);
  renderButtons();
}

// ---------- Tutorial ----------

const tutorial = new Tutorial(tutCardEl, {
  sim: () => sim,
  isTouch,
  keyLabel: (light) => keyLabel(keyBindings(settingsStore.get())[light]),
  highlight: (light) => {
    for (const l of LIGHTS) buttons.get(l)!.classList.toggle('tut-target', l === light);
    document.body.classList.toggle('tut-focus', light !== null);
  },
  finish: () => finishTutorial(),
});

function finishTutorial(): void {
  try {
    localStorage.setItem('sl_tutorial', '1');
  } catch {
    /* ignore */
  }
  void session.completeTutorial();
  session.event('tutorial_end');
  tutorial.stop();
  mode = 'result';
  router.reset('tutorialDone');
}

function tutorialDone(): boolean {
  if (session.data?.flags.tutorial_done) return true;
  try {
    return localStorage.getItem('sl_tutorial') === '1';
  } catch {
    return false;
  }
}

function startTutorial(): void {
  session.event('tutorial_start');
  ticket = null;
  newSim(randomSeed(), true);
  mode = 'tutorial';
  router.clear();
  tutorial.begin();
}

// ---------- Runs ----------

function newSim(seed: number, tutorial = false, items = false): void {
  renderer.cinematic = duel ? false : settingsStore.get().cinematic;
  // Every run starts with nothing worn; items found along the way count for this run only.
  sim = new Sim(seed, sim.viewH, { tutorial, items });
  renderer.ownedMask = 0;
  input.heroXProvider = () => sim.hero.x;
  input.reset();
  layout();
  shownScore = 0;
  deathTimer = -1;
  acc = 0;
  paused = false;
  last = performance.now();
  document.body.style.backgroundColor = scenes[0].page;
  renderer.setScene(0);
  renderer.heroTierOverride = null;
  renderer.menuGesture = null;
  renderer.sceneOnly = false;
  lastMult = 1;
  audio.setIntense(false);
  audio.stopTension();
  setWallet(0);
  renderer.camShift = 0;
  renderer.prewarm(1, sim.viewH);
  prevLight = null;
  audio.setTier(0);
  setSkin(0);
}

/**
 * New run: the "Preparing a new run" screen with elevator doors is a real load
 * (server ticket, next scene sprites, at least 1.2 s). Interstitial ads may only
 * appear here, and only under the server-side conditions (rule 5.1.5.1 "а").
 */
async function startRun(): Promise<void> {
  if (starting) return;
  starting = true;
  router.reset('preparing');
  const t0 = performance.now();
  const ticketP = session.takeTicket();
  renderer.prewarm(0, sim.viewH);
  renderer.prewarm(1, sim.viewH);
  if (adAllowed()) {
    audio.suspend();
    const shown = await ads.showInterstitial(adsConfig().timeout_sec);
    audio.resume();
    if (shown) {
      adState.runsSince = 0;
      adState.lastAt = Date.now();
      saveAdState();
      session.event('ad_shown');
    }
  }
  ticket = await ticketP;
  const left = 1200 - (performance.now() - t0);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  starting = false;
  // Items drop only in runs the server can verify, or locally when playing outside VK.
  newSim(ticket ? ticket.seed : randomSeed(), false, !!ticket || session.mode === 'outside');
  mode = 'run';
  router.clear();
  session.event('run_start');
  if (!ticket && session.mode !== 'outside') {
    const why = session.ticketError ? ru.result.reasons2[session.ticketError] : '';
    toast(why ? `${ru.result.unranked}: ${why}` : ru.result.unranked, 3200);
  }
}

// ---------- Ads policy (numbers come from the server) ----------

interface AdState {
  completed: number;
  runsSince: number;
  lastAt: number;
}
const adState: AdState = (() => {
  try {
    return { completed: 0, runsSince: 0, lastAt: 0, ...JSON.parse(localStorage.getItem('sl_ads') || '{}') } as AdState;
  } catch {
    return { completed: 0, runsSince: 0, lastAt: 0 };
  }
})();

function saveAdState(): void {
  try {
    localStorage.setItem('sl_ads', JSON.stringify(adState));
  } catch {
    /* ignore */
  }
}

function adsConfig(): AdsConfig {
  return { ...DEFAULT_ADS, ...((session.data?.ads ?? {}) as Partial<AdsConfig>) };
}

function adAllowed(): boolean {
  const c = adsConfig();
  return (
    c.enabled &&
    session.mode === 'online' &&
    tutorialDone() &&
    adState.completed >= c.min_runs_before &&
    adState.runsSince >= c.every_n_runs &&
    Date.now() - adState.lastAt >= Math.max(30, c.min_interval_sec) * 1000
  );
}

function play(): void {
  if (!tutorialDone()) startTutorial();
  else if (settingsStore.get().rulesCard) router.open('rulesCard');
  else void startRun();
}

function readLocalBest(): number {
  try {
    return Number(localStorage.getItem('sl_best') || 0);
  } catch {
    return 0;
  }
}

let resultData: V.ResultData | null = null;

function finishRun(): void {
  mode = 'result';
  finishedDuel = duel;
  duelOutcome = null;
  if (duel) endDuelView();
  adState.completed++;
  adState.runsSince++;
  saveAdState();
  session.event('run_end', sim.score);
  rememberLocalRun(sim.score, sim.tier);
  if (session.mode === 'outside') {
    const local = readLocalItems();
    writeLocalItems(local.mask | sim.picked, local.misses);
  }
  const runTicket = ticket;
  ticket = null;
  const best = session.data?.stats.best_all ?? readLocalBest();
  const record = sim.score > best;
  if (session.mode === 'outside' && record) {
    try {
      localStorage.setItem('sl_best', String(sim.score));
    } catch {
      /* ignore */
    }
  }
  resultData = {
    reason: sim.deathReason ? ru.result.reasons[sim.deathReason] : '',
    tier: sim.tier,
    score: sim.score,
    best: Math.max(best, sim.score),
    captures: sim.captures,
    maxCombo: sim.maxCombo,
    seconds: Math.floor(sim.runTime),
    record,
    canShare: sim.score > 0 && (canShare().wall || canShare().story),
    duel: finishedDuel
      ? { oppName: finishedDuel.opponent.name || ru.duel.player, me: sim.score, opp: oppScoreNow(finishedDuel), oppOut: finishedDuel.opp.dead || finishedDuel.oppFinal !== null || finishedDuel.oppLeft }
      : null,
  };
  shareData = { score: sim.score, tier: sim.tier, mask: renderer.ownedMask };
  router.reset('result');
  if (finishedDuel) setDuelLine(finishedDuel.oppLeft ? ru.duel.oppLeft : ru.duel.pending);

  const rankEl = document.getElementById('resultRank');
  if (!rankEl) return;
  if (!runTicket) {
    const why = session.ticketError ? ru.result.reasons2[session.ticketError] : '';
    rankEl.textContent = session.mode === 'outside' ? '' : why ? `${ru.result.unranked}: ${why}` : ru.result.unranked;
    return;
  }
  rankEl.textContent = ru.result.saving;
  void session
    .finish({
      run_id: runTicket.run_id,
      token: runTicket.token,
      score: sim.score,
      duration_ms: Math.round(sim.runTime * 1000),
      tier: sim.tier,
      captures: sim.captures,
      max_combo: sim.maxCombo,
      input_log: sim.inputLog,
      items: sim.picked,
    })
    .then((res) => {
      const el = document.getElementById('resultRank');
      if (el) {
        if (!res) el.textContent = ru.result.saveFailed;
        else if (res.status === 'rejected') el.textContent = res.reason === 'too_short' ? ru.result.tooShort : ru.result.rejected;
        else {
          el.innerHTML = V.rankHtml(res);
          document.getElementById('resultRecord')?.classList.toggle('hidden', !res.is_record);
          const bestEl = document.getElementById('resultBest');
          if (bestEl) bestEl.textContent = String(res.best_all);
        }
      }
      if (res?.duel && finishedDuel) {
        const myId = String(session.data?.profile.id ?? '');
        if (res.duel.status === 'done' && res.duel.outcome) showDuelOutcome(res.duel.outcome[myId] ?? 'draw');
        else if (!duelOutcome) setDuelLine(ru.duel.pending);
      }
      session.prefetch();
    });
}

let shareData: { score: number; tier: number; mask: number } | null = null;

/**
 * A 1080x1920 story card: the scene's colors, the hero facing the viewer in the run's
 * outfit, the score and the reached place, and a call to beat it.
 */
function buildStoryImage(score: number, tier: number, mask: number): string {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1920;
  const g = c.getContext('2d')!;
  const sc = scenes[Math.min(tier, scenes.length - 1)];
  const bg = g.createLinearGradient(0, 0, 0, 1920);
  bg.addColorStop(0, sc.skyTop);
  bg.addColorStop(1, sc.skyBottom);
  g.fillStyle = bg;
  g.fillRect(0, 0, 1080, 1920);
  // Soft light behind the hero.
  const glow = g.createRadialGradient(540, 980, 40, 540, 980, 520);
  glow.addColorStop(0, 'rgba(255,230,160,0.45)');
  glow.addColorStop(1, 'rgba(255,230,160,0)');
  g.fillStyle = glow;
  g.fillRect(0, 400, 1080, 1200);
  const font = "'Rubik Variable', Rubik, system-ui, sans-serif";
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = `800 64px ${font}`;
  g.fillText(ru.appTitle, 540, 200);
  g.font = `600 46px ${font}`;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(ru.share.storyLead, 540, 300);
  g.fillStyle = '#FFD640';
  g.font = `900 190px ${font}`;
  g.fillText(String(score), 540, 470);
  g.font = `700 50px ${font}`;
  g.fillStyle = '#ffffff';
  g.fillText(ru.share.points(score), 540, 545);
  // Hero
  g.save();
  g.translate(540, 1450);
  g.scale(11, 11);
  drawHeroFront(g, outfitFromMask(mask), 1, 'wave', 'grin');
  g.restore();
  // Place
  g.fillStyle = 'rgba(10,12,18,0.7)';
  g.beginPath();
  g.roundRect(140, 1530, 800, 170, 40);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = `600 40px ${font}`;
  g.fillText(ru.result.reachedTitle, 540, 1595);
  g.fillStyle = '#ffffff';
  g.font = `800 56px ${font}`;
  g.fillText(ru.tiers[tier], 540, 1665);
  g.fillStyle = '#FFD640';
  g.font = `800 60px ${font}`;
  g.fillText(ru.share.storyCta, 540, 1810);
  return c.toDataURL('image/jpeg', 0.9);
}

/** The hero portrait for the glossy magazine cover on high tiers. */
function drawCoverHero(c: HTMLCanvasElement, tier: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 72 * dpr;
  c.height = 96 * dpr;
  const g = c.getContext('2d');
  if (!g) return;
  g.scale(dpr, dpr);
  g.translate(36, 92);
  g.scale(1.3, 1.3);
  drawHeroFront(g, outfitFromMask(renderer.ownedMask), 1, 'hips', 'grin');
  void tier;
}

let confettiTimer = 0;
/** New record: a shower of bills over the results and a fanfare. */
function celebrate(): void {
  audio.play('fanfare');
  if (settingsStore.get().reducedFx) return;
  const host = document.getElementById('confetti') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'confetti' }));
  host.className = 'confetti';
  const flashes = Array.from({ length: 6 }, (_, i) => {
    const left = i % 2 === 0;
    return `<b class="flash" style="${left ? 'left' : 'right'}:${4 + Math.random() * 12}%;top:${12 + Math.random() * 60}%;--d:${(0.3 + i * 0.4).toFixed(2)}s"></b>`;
  }).join('');
  host.innerHTML = Array.from({ length: 26 }, (_, i) => {
    const x = Math.round(Math.random() * 100);
    const d = (Math.random() * 0.6).toFixed(2);
    const r = Math.round(Math.random() * 720 - 360);
    return `<i style="left:${x}%;--d:${d}s;--r:${r}deg;--s:${(0.8 + Math.random() * 0.6).toFixed(2)}" class="${i % 3 === 0 ? 'gold' : ''}"></i>`;
  }).join('') + flashes;
  clearTimeout(confettiTimer);
  confettiTimer = window.setTimeout(() => (host.innerHTML = ''), 2600);
}

/** Score counts up on the results card. */
function countUp(el: HTMLElement): void {
  const target = Number(el.dataset.target || 0);
  const start = performance.now();
  const dur = Math.min(1200, 300 + target * 4);
  const step = (now: number): void => {
    const k = Math.min(1, (now - start) / dur);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function lastTier(): number {
  return session.data?.stats.last_tier ?? localStats()?.last_tier ?? 0;
}

function goMenu(): void {
  if (duel) {
    // Leaving a duel counts as a loss.
    duelClient.send({ t: 'leave' });
    endDuelView();
  }
  mode = 'menu';
  ticket = null;
  tutorial.stop();
  newSim(randomSeed());
  // The menu is a calm scene of the last reached place: no gameplay behind it.
  const tier = lastTier();
  renderer.heroTierOverride = tier;
  renderer.sceneOnly = true;
  renderer.setScene(tier);
  audio.setTier(tier);
  setSkin(tier);
  setWallet(tier);
  document.body.style.backgroundColor = scenes[tier].page;
  router.reset('menu');
}

// ---------- Menu showcase: the hero on a stage ----------

function sizeCanvas(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return null;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d');
  g?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

/** The hero facing the player on a small podium: breathing, blinking, waving now and then. */
function drawStageHero(c: HTMLCanvasElement, _tier: number, t: number, _silhouette = false, still = false, mask = ownedMask()): void {
  const g = sizeCanvas(c);
  if (!g) return;
  const w = c.clientWidth;
  const h = c.clientHeight;
  g.clearRect(0, 0, w, h);
  // About a quarter smaller than the stage, so the hero does not crowd the menu.
  const scale = Math.min(w / 58, h / 96);
  const base = h - 6 * scale;
  // Podium: the soles stand exactly on its top surface.
  g.fillStyle = '#565C6B';
  g.beginPath();
  g.roundRect(w / 2 - 16 * scale, base, 32 * scale, 4.6 * scale, 2.3 * scale);
  g.fill();
  g.fillStyle = '#8C93A3';
  g.beginPath();
  g.roundRect(w / 2 - 16 * scale, base, 32 * scale, 3 * scale, 2.3 * scale);
  g.fill();
  // A little hop every few seconds.
  const cycle = still ? 3 : t % 6;
  const hop = cycle > 5.3 ? Math.sin(((cycle - 5.3) / 0.7) * Math.PI) * 6 * scale : 0;
  g.save();
  g.translate(w / 2, base - hop);
  g.scale(scale, scale);
  drawHeroFront(g, outfitFromMask(mask), t, still ? 'hips' : 'idle', !still && cycle < 2.2 ? 'grin' : 'normal');
  g.restore();
}

function drawShowcase(t: number): void {
  const tier = lastTier();
  const menuHero = document.getElementById('menuHero') as HTMLCanvasElement | null;
  if (menuHero) drawStageHero(menuHero, tier, t);
  const ward = document.getElementById('wardHero') as HTMLCanvasElement | null;
  if (ward) drawStageHero(ward, tier, t);
}

/** The 13 items of the collection: owned ones in color, the rest as silhouettes. */
function drawCollection(root: HTMLElement): void {
  const mask = ownedMask();
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-item]').forEach((c) => {
    const i = Number(c.dataset.item);
    const g = sizeCanvas(c);
    if (!g) return;
    const w = c.clientWidth;
    const h = c.clientHeight;
    g.clearRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2 + 2);
    const k = Math.min(w, h) / 30;
    g.scale(k, k);
    drawItem(g, ITEM_BY_TIER[i] as Item);
    g.restore();
    if (!(mask & (1 << i))) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(30,34,46,0.95)';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    }
  });
}

/** Collected items: from the server, or kept locally when playing outside VK. */
function ownedMask(): number {
  return session.data?.stats.items_mask ?? readLocalItems().mask;
}

function readLocalItems(): { mask: number; misses: number[] } {
  try {
    const v = JSON.parse(localStorage.getItem('sl_items') || '{}');
    return { mask: Number(v.mask) || 0, misses: Array.isArray(v.misses) ? v.misses : [] };
  } catch {
    return { mask: 0, misses: [] };
  }
}

function writeLocalItems(mask: number, misses: number[]): void {
  try {
    localStorage.setItem('sl_items', JSON.stringify({ mask, misses }));
  } catch {
    /* ignore */
  }
}

// ---------- Pause ----------

function pause(): void {
  if ((mode !== 'run' && mode !== 'tutorial') || sim.dead) return;
  if (paused && router.top !== null) return;
  paused = true;
  resumeToken++; // cancels a running 3-2-1
  countdown = 0;
  countdownEl.classList.remove('on');
  input.reset();
  router.reset('pause');
}

function resume(): void {
  router.clear();
  // 3-2-1 before the game continues.
  countdown = 3;
  const token = ++resumeToken;
  const tick = (): void => {
    if (!paused || token !== resumeToken) return;
    if (countdown <= 0) {
      countdownEl.classList.remove('on');
      paused = false;
      last = performance.now();
      return;
    }
    countdownEl.textContent = String(countdown);
    countdownEl.classList.remove('on');
    void countdownEl.offsetWidth;
    countdownEl.classList.add('on');
    countdown--;
    setTimeout(tick, 650);
  };
  tick();
}

// ---------- Screens ----------

let consentError: string | null = null;
let deleteError: string | null = null;
let lbScope: 'week' | 'all' = 'week';
let bootState = { progress: 0, label: ru.loading.fonts, error: null as string | null };
let docKind: 'terms' | 'privacy' | 'rules' = 'rules';

router.register('loading', { html: () => V.loadingView(bootState.progress, bootState.label, bootState.error), cls: 'solid' });
router.register('consent', {
  html: () => V.consentView(consentError),
  cls: 'solid',
  mount: (root) => {
    const check = root.querySelector<HTMLInputElement>('#consentCheck')!;
    const btn = root.querySelector<HTMLButtonElement>('#acceptBtn')!;
    check.addEventListener('change', () => (btn.disabled = !check.checked));
  },
});
router.register('declined', { html: () => V.declinedView(), cls: 'solid' });
router.register('doc', { html: () => V.docView(docKind), cls: 'solid' });
router.register('rules', { html: () => V.docView('rules'), cls: 'solid' });
router.register('wardrobe', {
  html: () => V.wardrobeView(session.data?.stats ?? localStats(), ownedMask()),
  cls: 'solid',
  mount: (root) => requestAnimationFrame(() => drawCollection(root)),
});
router.register('menu', {
  html: () => V.menuView({ stats: session.data?.stats ?? localStats(), mode: session.mode }),
  cls: 'menu-screen',
});
router.register('preparing', { html: () => V.preparingView(), cls: 'solid preparing' });
router.register('rulesCard', { html: () => V.rulesCardView(), modal: true });
router.register('settings', {
  html: () =>
    V.settingsView(settingsStore.get(), {
      vibration: hapticsSupported(),
      playerId: session.data?.profile.id ?? null,
      canDelete: session.mode === 'online',
      keys: { show: !isTouch, rebinding, error: keyError },
    }),
  cls: 'solid',
});
router.register('confirmDelete', { html: () => V.confirmDeleteView(deleteError), modal: true });
router.register('leaders', { html: () => V.leadersShell(lbScope), cls: 'solid', mount: () => void loadLeaders(false) });
router.register('contact', { html: () => V.contactView(!!SUPPORT_URL, session.data?.profile.id ?? null), cls: 'solid' });
router.register('pause', { html: () => V.pauseView(settingsStore.get()), modal: true });
router.register('result', {
  html: () => V.resultView(resultData!),
  modal: true,
  mount: (root) => {
    countUp(root.querySelector<HTMLElement>('#resultScore')!);
    const thumb = root.querySelector<HTMLCanvasElement>('#coverHero');
    if (thumb) drawCoverHero(thumb, resultData?.tier ?? 0);
    if (resultData?.record && resultData.score > 0) celebrate();
  },
});
router.register('duels', {
  html: () =>
    V.duelsView({
      status: session.mode !== 'online' ? 'offline' : !duelClient.connected ? 'connecting' : duelUi,
      online: duelClient.online,
      waitingFor: duelWaitingFor,
      leadersHtml: duelLbHtml,
    }),
  cls: 'solid',
  mount: () => {
    if (session.mode === 'online') duelClient.connect();
    void loadDuelLeaders();
  },
});
router.register('invite', {
  html: () => (invite ? V.inviteView(invite.from, invite.timeout) : ''),
  modal: true,
});
router.register('share', { html: () => V.shareView(canShare()), modal: true });
router.register('tutorialDone', { html: () => V.tutorialDoneView(), modal: true });
let stubKind: V.StubKind = 'offline';
router.register('stub', { html: () => V.stubView(stubKind, errorCode()), cls: 'solid' });

function errorCode(): string | null {
  const e = session.lastError;
  if (!e) return null;
  return e.status ? `${e.status} ${e.code}` : e.code;
}

router.onChange = (top) => {
  if (top !== 'settings') {
    rebinding = null;
    keyError = null;
  }
  // Players who are in a run are not offered as duel opponents.
  duelClient.send({ t: 'state', v: mode === 'run' || mode === 'tutorial' ? 'run' : 'idle' });
  document.body.classList.toggle('playing', top === null && (mode === 'run' || mode === 'tutorial'));
  document.body.classList.toggle('tutorial', mode === 'tutorial');
  document.body.classList.toggle('in-menu', top !== null && !['pause', 'result', 'rulesCard', 'tutorialDone'].includes(top));
};

function localStats(): Stats | null {
  const best = readLocalBest();
  let local: { last?: number; lastTier?: number; bestTier?: number; runs?: number } = {};
  try {
    local = JSON.parse(localStorage.getItem('sl_local') || '{}');
  } catch {
    /* ignore */
  }
  return best > 0 || local.runs
    ? {
        best_all: best,
        best_tier: local.bestTier ?? 0,
        best_week: 0,
        last_score: local.last ?? null,
        total_runs: local.runs ?? 1,
        rank_all: null,
        rank_week: null,
        last_tier: local.lastTier ?? 0,
      }
    : null;
}

/** Without a server (outside VK) the last run is remembered locally for the menu. */
function rememberLocalRun(score: number, tier: number): void {
  try {
    const prev = JSON.parse(localStorage.getItem('sl_local') || '{}');
    localStorage.setItem(
      'sl_local',
      JSON.stringify({ last: score, lastTier: tier, bestTier: Math.max(prev.bestTier ?? 0, tier), runs: (prev.runs ?? 0) + 1 }),
    );
  } catch {
    /* ignore */
  }
}

let duelLbHtml: { rows: string; me: string } | null = null;

/** Rating of duel wins, shown on the Duels screen. */
async function loadDuelLeaders(): Promise<void> {
  const list = document.getElementById('duelLbList');
  const me = document.getElementById('duelLbMe');
  if (!list || !me || session.mode !== 'online') return;
  try {
    const lb = await session.leaderboard('duels', false);
    duelLbHtml = { rows: V.leadersRows(lb, session.data?.profile.id ?? null, true), me: V.leadersMe(lb) };
    if (router.top !== 'duels') return;
    list.innerHTML = duelLbHtml.rows;
    me.innerHTML = duelLbHtml.me;
    list.querySelectorAll<HTMLElement>('.stagger > *').forEach((c, i) => c.style.setProperty('--i', String(i)));
    list.querySelectorAll<HTMLImageElement>('img').forEach((img) =>
      img.addEventListener('error', () => img.remove(), { once: true }),
    );
  } catch {
    if (!duelLbHtml) list.innerHTML = V.leadersError(ru.leaders.error, false);
  }
}

async function loadLeaders(force: boolean): Promise<void> {
  const list = document.getElementById('lbList');
  const me = document.getElementById('lbMe');
  const reset = document.getElementById('lbReset');
  if (!list || !me || !reset) return;
  if (session.mode !== 'online') {
    list.innerHTML = V.leadersError(ru.leaders.unavailable, session.mode === 'offline');
    me.innerHTML = '';
    return;
  }
  const scope = lbScope;
  try {
    const lb = await session.leaderboard(scope, force);
    if (router.top !== 'leaders' || scope !== lbScope) return;
    const offset = lb.server_time - Date.now();
    list.innerHTML = V.leadersRows(lb, session.data?.profile.id ?? null, true);
    me.innerHTML = V.leadersMe(lb);
    reset.textContent = V.resetLine(lb, offset);
    list.querySelectorAll<HTMLElement>('.stagger > *').forEach((c, i) => c.style.setProperty('--i', String(i)));
    list.querySelectorAll<HTMLImageElement>('img').forEach((img) =>
      img.addEventListener('error', () => img.remove(), { once: true }),
    );
  } catch (e) {
    const msg = e instanceof ApiError && e.status === 429 ? ru.stub.rateLimited : ru.leaders.error;
    list.innerHTML = V.leadersError(msg, true);
    me.innerHTML = '';
  }
}

/** Once per device, after a tap: VK asks whether the game may send notifications (duel challenges). */
function askNotificationsOnce(): void {
  if (session.mode !== 'online') return;
  try {
    if (localStorage.getItem('sl_notif_asked')) return;
    localStorage.setItem('sl_notif_asked', '1');
  } catch {
    /* ask anyway */
  }
  void askNotifications();
}

// ---------- Key bindings (browser) ----------

const KEY_FIELD: Record<LightId, KeySetting> = { yellow: 'keyYellow', blue: 'keyBlue', green: 'keyGreen', red: 'keyRed' };
let rebinding: LightId | null = null;
let keyError: string | null = null;

/** While a button waits for its key, the next key press is taken as the new binding. */
window.addEventListener(
  'keydown',
  (e) => {
    if (!rebinding) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') {
      rebinding = null;
      keyError = null;
    } else if (STEER_CODES.includes(e.code)) {
      keyError = ru.settings.keyBusy;
    } else if (/^[A-Za-z0-9]{2,20}$/.test(e.code)) {
      const cur = keyBindings(settingsStore.get());
      const patch: Partial<Settings> = { [KEY_FIELD[rebinding]]: e.code };
      // A key that already belongs to another button swaps places with this one.
      const other = LIGHTS.find((l) => l !== rebinding && cur[l] === e.code);
      if (other) patch[KEY_FIELD[other]] = cur[rebinding] as never;
      settingsStore.set(patch);
      rebinding = null;
      keyError = null;
    } else return; // Meta/unknown keys: keep waiting
    if (router.top === 'settings') router.refresh();
  },
  true,
);

// ---------- Actions ----------

const actions: Record<string, (arg: string, el: HTMLElement) => void> = {
  back: () => router.back(),
  open: (arg) => {
    if (arg === 'confirmDelete') deleteError = null;
    router.open(arg);
  },
  doc: (arg) => {
    docKind = arg as typeof docKind;
    router.open('doc');
  },
  play: () => play(),
  playFromCard: () => {
    const dont = document.querySelector<HTMLInputElement>('#dontShowRules');
    if (dont?.checked) settingsStore.set({ rulesCard: false });
    void startRun();
  },
  again: () => (settingsStore.get().rulesCard ? router.open('rulesCard') : void startRun()),
  afterTutorial: () => void startRun(),
  skipTutorial: () => {
    // Skipping counts as done: the player goes straight to the menu.
    tutorial.stop();
    try {
      localStorage.setItem('sl_tutorial', '1');
    } catch {
      /* ignore */
    }
    void session.completeTutorial();
    session.event('tutorial_end');
    goMenu();
  },
  tutOk: () => tutorial.ok(),
  rebind: (arg) => {
    rebinding = rebinding === arg ? null : (arg as LightId);
    keyError = null;
    router.refresh();
  },
  keysReset: () => {
    rebinding = null;
    keyError = null;
    settingsStore.set({
      keyYellow: DEFAULT_KEYS.yellow,
      keyBlue: DEFAULT_KEYS.blue,
      keyGreen: DEFAULT_KEYS.green,
      keyRed: DEFAULT_KEYS.red,
    });
    router.refresh();
  },
  toMenu: () => goMenu(),
  resume: () => resume(),
  setSeg: (arg, el) => settingsStore.set({ [el.dataset.key as keyof Settings]: arg } as Partial<Settings>),
  lbScope: (arg) => {
    lbScope = arg as 'week' | 'all';
    router.refresh();
  },
  lbRetry: () => {
    if (session.mode === 'offline') void reconnect().then(() => router.refresh());
    else void loadLeaders(true);
  },
  profile: (arg) => {
    if (/^\d+$/.test(arg)) window.open(`${PROFILE_URL}${arg}`, '_blank', 'noopener');
  },
  support: () => {
    if (SUPPORT_URL) window.open(SUPPORT_URL, '_blank', 'noopener');
  },
  acceptConsent: () => void acceptConsent(),
  duelFind: () => {
    askNotificationsOnce();
    duelUi = 'waiting';
    duelWaitingFor = null;
    duelClient.send({ t: 'find' });
    router.refresh();
  },
  duelCancel: () => {
    duelUi = 'idle';
    duelClient.send({ t: 'cancel' });
    router.refresh();
  },
  duelAccept: () => {
    askNotificationsOnce();
    duelClient.send({ t: 'accept' });
    router.back();
  },
  duelDecline: () => {
    invite = null;
    duelClient.send({ t: 'decline' });
    router.back();
  },
  shareWall: () => {
    if (!shareData) return;
    void shareWall(ru.share.wallText(shareData.score, ru.tiers[shareData.tier])).then(() => router.back());
  },
  shareStory: () => {
    if (!shareData) return;
    const img = buildStoryImage(shareData.score, shareData.tier, shareData.mask);
    void shareStory(img).then(() => router.back());
  },
  declineConsent: () => router.open('declined'),
  deleteData: () => void deleteData(),
  reconnect: () => void reconnect().then(() => router.refresh()),
  retryBoot: () => void boot(),
  playOffline: () => {
    session.mode = 'offline';
    afterBoot();
  },
};

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const fn = actions[el.dataset.action!];
  if (fn) {
    audio.play('click');
    fn(el.dataset.arg ?? '', el);
  }
});

// Toggles and sliders on the settings screen.
document.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const key = el.dataset?.setting as keyof Settings | undefined;
  if (!key) return;
  settingsStore.set({ [key]: el.type === 'checkbox' ? el.checked : Number(el.value) } as Partial<Settings>);
});

$('pauseBtn').addEventListener('click', pause);
$('pauseBtn').setAttribute('aria-label', ru.pause.title);
$('skipBtn').textContent = ru.tutorial.skip;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    audio.suspend();
  } else audio.resume();
});
// Audio may only start after a user gesture.
const unlockAudio = (): void => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
window.addEventListener('blur', pause);
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  const top = router.top;
  if (top === 'pause') resume();
  else if (top === null) pause();
  else if (!['menu', 'result', 'loading', 'consent', 'tutorialDone', 'preparing'].includes(top)) router.back();
});

// ---------- Consent & data ----------

function localConsent(): boolean {
  try {
    return Number(localStorage.getItem('sl_consent') || 0) >= TERMS_VERSION;
  } catch {
    return false;
  }
}

function hasConsent(): boolean {
  if (session.mode === 'online' && session.data) return session.data.flags.consent_ok;
  return localConsent();
}

async function acceptConsent(): Promise<void> {
  const btn = document.getElementById('acceptBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    if (session.mode === 'online') await session.acceptConsent();
    localStorage.setItem('sl_consent', String(TERMS_VERSION));
    consentError = null;
    goMenu();
  } catch {
    consentError = ru.consent.failed;
    router.refresh();
  }
}

async function deleteData(): Promise<void> {
  try {
    await session.deleteMe();
  } catch {
    deleteError = session.mode === 'online' ? ru.confirmDelete.failed : ru.confirmDelete.offline;
    router.refresh();
    return;
  }
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('sl_')) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  settingsStore.reset();
  await session.bootstrap();
  consentError = null;
  router.reset('consent');
}

async function reconnect(): Promise<void> {
  await session.bootstrap();
  if (session.data) settingsStore.adoptServer(session.data.settings, session.data.settings_updated_at);
}

// ---------- Boot ----------

function supported(): boolean {
  const c = document.createElement('canvas');
  return !!c.getContext('2d') && 'PointerEvent' in window && typeof fetch === 'function';
}

function setBoot(progress: number, label: string): void {
  bootState = { progress, label, error: null };
  if (router.top === 'loading') router.refresh();
}

async function boot(): Promise<void> {
  if (!supported()) {
    stubKind = 'unsupported';
    router.reset('stub');
    return;
  }
  bootState = { progress: 0.05, label: ru.loading.fonts, error: null };
  router.reset('loading');
  await Promise.race([
    Promise.all([document.fonts?.load("700 16px 'Rubik Variable'"), document.fonts?.load("400 16px 'Rubik Variable'")]),
    new Promise((r) => setTimeout(r, 2000)),
  ]).catch(() => undefined);
  setBoot(0.35, ru.loading.graphics);
  await initHaptics();
  await initShare();
  await new Promise((r) => requestAnimationFrame(r));
  setBoot(0.6, ru.loading.profile);
  await session.bootstrap();
  setBoot(1, ru.loading.profile);
  if (session.mode === 'offline') {
    // A clear stub with retry instead of endless loading (rule 2.2.2).
    const st = session.lastError?.status ?? 0;
    stubKind = st === 503 ? 'maintenance' : st >= 500 || st === 401 ? 'server' : 'offline';
    router.reset('stub');
    return;
  }
  if (session.data) settingsStore.adoptServer(session.data.settings, session.data.settings_updated_at);
  afterBoot();
}

function afterBoot(): void {
  if (session.mode === 'online') duelClient.connect();
  if (!hasConsent()) router.reset('consent');
  else goMenu();
}

// ---------- Duels ----------

interface DuelRun {
  id: string;
  seed: number;
  startAt: number;
  opponent: DuelPlayer;
  opp: Sim;
  oppRenderer: Renderer;
  queue: number[][];
  upto: number;
  oppAxis: number;
  sent: number;
  lastSend: number;
  oppDeadShown: boolean;
  oppLeft: boolean;
  /** Playback clock of the opponent (smoothed against network jitter). */
  oppAcc: number;
  oppStarted: boolean;
  /** Exact final score once the opponent is out. */
  oppFinal: number | null;
  skipDraw: boolean;
}

const duelClient = new DuelClient();
let finishedDuel: DuelRun | null = null;
let duelOutcome: 'win' | 'loss' | 'draw' | null = null;
let duelUi: V.DuelView['status'] = 'idle';
let duelWaitingFor: string | null = null;
let invite: { from: DuelPlayer; timeout: number } | null = null;
const oppCanvas = $<HTMLCanvasElement>('opp');
const oppName = $('oppName');
const duelMeEl = $('duelMe');
const duelOppEl = $('duelOpp');
const duelOppNameEl = $('duelOppName');
const duelBarEl = $('duelBar');

duelClient.onStatus = () => {
  if (router.top === 'duels') router.refresh();
};

duelClient.onMessage = (m: DuelMsg) => {
  switch (m.t) {
    case 'none':
      duelUi = 'none';
      break;
    case 'waiting':
      duelUi = 'waiting';
      duelWaitingFor = m.to.name;
      break;
    case 'declined':
      duelUi = 'declined';
      break;
    case 'invite':
      // Only offered while not playing; the invite card opens over any menu screen.
      if (mode === 'run' || mode === 'tutorial') {
        duelClient.send({ t: 'decline' });
        return;
      }
      invite = { from: m.from, timeout: m.timeout };
      audio.play('unlock');
      router.open('invite');
      break;
    case 'invite_cancel':
      invite = null;
      if (router.top === 'invite') router.back();
      break;
    case 'start':
      void startDuel(m);
      break;
    case 'inputs': {
      // Keeps arriving after our own run is over, so the result card can show the live score.
      const d = duel ?? finishedDuel;
      if (d) {
        for (const e of m.log) d.queue.push(e);
        d.upto = Math.max(d.upto, m.upto);
      }
      break;
    }
    case 'opp_dead': {
      const d = duel ?? finishedDuel;
      if (d) d.oppFinal = m.score;
      break;
    }
    case 'opp_left': {
      const d = duel ?? finishedDuel;
      if (d) {
        d.oppLeft = true;
        toast(ru.duel.oppLeft, 2500);
        if (!duel) setDuelLine(ru.duel.oppLeft);
      }
      break;
    }
    case 'result':
      showDuelOutcome(m.outcome);
      break;
  }
};

async function startDuel(m: Extract<DuelMsg, { t: 'start' }>): Promise<void> {
  invite = null;
  duelUi = 'idle';
  router.reset('preparing');
  ticket = { run_id: m.ticket.run_id, seed: m.seed, started_at: m.ticket.started_at, token: m.ticket.token };
  const oppRenderer = new Renderer(oppCanvas);
  oppRenderer.reducedEffects = true;
  oppRenderer.cinematic = false;
  duel = {
    id: m.duel,
    seed: m.seed,
    startAt: m.start_at,
    opponent: m.opponent,
    opp: new Sim(m.seed, 700, { items: true }),
    oppRenderer,
    queue: [],
    upto: 0,
    oppAxis: 0,
    sent: 0,
    lastSend: 0,
    oppDeadShown: false,
    oppLeft: false,
    oppAcc: 0,
    oppStarted: false,
    oppFinal: null,
    skipDraw: false,
  };
  finishedDuel = null;
  duelOutcome = null;
  oppName.textContent = m.opponent.name || ru.duel.player;
  duelOppNameEl.textContent = m.opponent.name || ru.duel.player;
  document.body.classList.add('duel');
  newSim(m.seed, false, true);
  sizeOpp();
  // Both start at the same moment (server time + countdown).
  const wait = Math.max(1200, m.start_at - Date.now());
  await new Promise((r) => setTimeout(r, wait));
  mode = 'run';
  router.clear();
  session.event('run_start');
}

function sizeOpp(): void {
  if (!duel) return;
  const wide = document.body.classList.contains('wide');
  const boardW = board.clientWidth;
  const w = wide ? Math.min(260, Math.max(160, (window.innerWidth - boardW) / 2 - 60)) : Math.round(boardW * 0.3);
  const s = w / gameConfig.world.width;
  duel.oppRenderer.resize(w, Math.round(700 * s), s);
}

const OPP_BUFFER_TICKS = 6;

/**
 * Plays the opponent's relayed inputs at a steady pace. Inputs arrive in bursts (network jitter),
 * so the playback speed follows how much is buffered: a little slower when it runs dry, faster
 * when it piles up. This replaces jumping ahead by whole bursts, which looked like lag.
 */
function advanceOpp(d: DuelRun, dt: number): void {
  const lag = d.upto - d.opp.tick;
  if (!d.oppStarted) {
    if (lag < OPP_BUFFER_TICKS) return;
    d.oppStarted = true;
  }
  let rate = 1;
  if (lag > 90) rate = 4;
  else if (lag > 40) rate = 2.2;
  else if (lag > 20) rate = 1.35;
  else if (lag < 2) rate = 0.5;
  else if (lag < OPP_BUFFER_TICKS) rate = 0.85;
  d.oppAcc += dt * rate;
  let steps = 0;
  while (d.oppAcc >= DT && d.opp.tick < d.upto && steps < 60) {
    let press: LightId | null = null;
    while (d.queue.length && d.queue[0][0] <= d.opp.tick) {
      const e = d.queue.shift()!;
      if (e[0] === d.opp.tick) {
        d.oppAxis = e[1] / 8;
        if (e[2] > 0) press = (['yellow', 'blue', 'green', 'red'] as LightId[])[e[2] - 1];
      }
    }
    d.opp.step({ axis: d.oppAxis, press });
    d.oppRenderer.handleEvents(d.opp.events, d.opp);
    d.oppAcc -= DT;
    steps++;
  }
  if (d.opp.tick >= d.upto) d.oppAcc = Math.min(d.oppAcc, DT * 0.99);
  else if (d.oppAcc > DT * 4) d.oppAcc = DT * 4;
}

/** Re-simulates the opponent from the relayed inputs, and sends ours ~20 times a second. */
function duelFrame(dt: number): void {
  const d = duel!;
  advanceOpp(d, dt);
  // On a slow device the small preview draws every other frame so the player's own game stays smooth.
  d.skipDraw = dt > 0.024 ? !d.skipDraw : false;
  if (!d.skipDraw) {
    d.oppRenderer.ownedMask = d.opp.owned;
    d.oppRenderer.draw(d.opp, Math.min(1, d.oppAcc / DT), dt);
  }
  updateDuelBar(d);
  if (d.opp.dead && !d.oppDeadShown) {
    d.oppDeadShown = true;
    toast(ru.duel.oppDead(d.oppFinal ?? d.opp.score), 2200);
  }
  flushDuelInputs(false);
}

function oppScoreNow(d: DuelRun): number {
  return d.oppFinal ?? d.opp.score;
}

/** Big scoreboard on the field: our score against the opponent's, the leader is highlighted. */
function updateDuelBar(d: DuelRun): void {
  const me = sim.score;
  const op = oppScoreNow(d);
  duelMeEl.textContent = String(me);
  duelOppEl.textContent = String(op);
  duelBarEl.classList.toggle('lead-me', me > op);
  duelBarEl.classList.toggle('lead-opp', op > me);
  duelBarEl.classList.toggle('opp-out', d.opp.dead || d.oppFinal !== null);
}

/** After our run ended the opponent may still be playing: keep following them for the result card. */
function followFinishedDuel(dt: number): void {
  const d = finishedDuel;
  if (!d || duelOutcome || d.opp.dead) {
    if (d) refreshDuelScore(d);
    return;
  }
  advanceOpp(d, dt);
  refreshDuelScore(d);
}

function refreshDuelScore(d: DuelRun): void {
  const el = document.getElementById('duelOppFinal');
  if (!el) return;
  const out = d.opp.dead || d.oppFinal !== null || d.oppLeft;
  el.textContent = String(oppScoreNow(d));
  const st = document.getElementById('duelOppState');
  if (st) st.textContent = out ? '' : ru.duel.playing;
}

function flushDuelInputs(force: boolean): void {
  const d = duel;
  if (!d) return;
  const now = performance.now();
  if (!force && now - d.lastSend < 50) return;
  d.lastSend = now;
  const log = sim.inputLog.slice(d.sent);
  d.sent = sim.inputLog.length;
  duelClient.send({ t: 'inputs', upto: sim.tick, log });
}

function endDuelView(): void {
  duel = null;
  document.body.classList.remove('duel');
}

function setDuelLine(text: string): void {
  const el = document.getElementById('duelLine');
  if (el) el.textContent = text;
}

function showDuelOutcome(outcome: 'win' | 'loss' | 'draw'): void {
  duelOutcome = outcome;
  document.getElementById('duelScore')?.classList.add(outcome);
  setDuelLine(outcome === 'win' ? ru.duel.win : outcome === 'loss' ? ru.duel.loss : ru.duel.draw);
  if (outcome === 'win') audio.play('fanfare');
  if (session.data && outcome === 'win') session.data.stats.duel_wins = (session.data.stats.duel_wins ?? 0) + 1;
}

// ---------- Main loop ----------

function frame(now: number): void {
  const realDt = Math.min((now - last) / 1000, gameConfig.sim.maxFrameSec);
  last = now;
  let scale = 1;
  const active = (mode === 'run' || mode === 'tutorial') && !paused;

  if (active) {
    if (deathTimer >= 0) {
      deathTimer += realDt;
      const { hitStopMs, slowMoSec, slowMoScale } = gameConfig.death;
      const stop = hitStopMs / 1000;
      scale = deathTimer < stop ? 0 : slowMoScale;
      renderer.deathK = Math.min(1, deathTimer / (stop + slowMoSec));
      if (deathTimer > stop + slowMoSec) finishRun();
    } else if (mode === 'tutorial') {
      scale = 0.8; // the tutorial runs a little slower
    }
    const tutFrozen = mode === 'tutorial' && tutorial.frozen;
    if (tutFrozen) {
      // A tutorial card is open: the game waits. The awaited light press stays queued for the game.
      acc = 0;
      const pending = input.peekPress();
      if (pending && !tutorial.acceptPress(pending)) input.takePress();
    } else if (renderer.cineActive) {
      // The suit-up is a short movie: the game is frozen, input is ignored.
      acc = 0;
      input.takePress();
    } else acc += realDt * scale;
    while (acc >= DT && (mode === 'run' || mode === 'tutorial') && !renderer.cineActive && !(mode === 'tutorial' && tutorial.frozen)) {
      sim.step({ axis: input.axis(sim.hero.x), press: input.takePress() });
      renderer.handleEvents(sim.events, sim);
      handleUiEvents(sim.events);
      if (mode === 'tutorial') tutorial.tick();
      acc -= DT;
    }
  }
  if (duel) duelFrame(realDt);
  else if (finishedDuel) followFinishedDuel(realDt);

  const renderDt = paused ? 0 : renderer.cineActive || mode === 'menu' ? realDt : realDt * scale;
  const tutFrozenNow = mode === 'tutorial' && tutorial.frozen;
  renderer.draw(sim, active && !renderer.cineActive && !tutFrozenNow ? acc / DT : 1, renderDt);
  if (document.body.classList.contains('wide')) renderer.drawBackdrop(backdrop, sim);
  if (router.top === 'menu' || router.top === 'wardrobe') drawShowcase(now / 1000);
  updateHud(realDt);
  requestAnimationFrame(frame);
}

input.heroXProvider = () => sim.hero.x;
lockGestures();
initVk({
  onHide: () => {
    pause();
    audio.suspend();
  },
  onRestore: () => audio.resume(),
});
layout();
requestAnimationFrame(frame);
void boot();
