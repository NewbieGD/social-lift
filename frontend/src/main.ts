import '@fontsource-variable/rubik';
import './styles.css';
import { audio } from './audio/audio';
import { PROFILE_URL, SUPPORT_URL, TERMS_VERSION } from './config';
import { gameConfig, isColorUnlocked, type ColorId, type LightId } from './core/gameConfig';
import { randomSeed } from './core/prng';
import { DT, Sim } from './core/sim';
import type { SimEvent } from './core/types';
import { ru } from './i18n/ru';
import { InputController } from './input/input';
import { ApiError } from './net/api';
import { Session, type RunTicket, type Stats } from './net/session';
import { haptic, hapticsSupported, initHaptics } from './platform/haptics';
import { ads, DEFAULT_ADS, type AdsConfig } from './platform/ads';
import { initVk } from './platform/vk';
import { scenes } from './render/palette';
import { drawHeroBody, drawItem, ITEM_BY_TIER, itemCount, outfitFromMask, type Item } from './render/hero';
import { Renderer } from './render/renderer';
import { applyControls } from './ui/controlsLayout';
import { $ } from './ui/dom';
import { Router } from './ui/router';
import { settingsStore, type Settings } from './ui/settingsStore';
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

const renderer = new Renderer(canvas);
const input = new InputController([field]);
const session = new Session();
const router = new Router($('screens'));
const isTouch = window.matchMedia('(pointer: coarse)').matches;

// ---------- Game state ----------

type Mode = 'menu' | 'run' | 'tutorial' | 'result';
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

function layout(): void {
  const rect = field.getBoundingClientRect();
  const W = gameConfig.world.width;
  const { minHeight, maxHeight } = gameConfig.world;
  const viewH = Math.max(minHeight, Math.min(maxHeight, (W * rect.height) / Math.max(1, rect.width)));
  // On wide desktop screens the field stays a vertical column (~480 CSS px max).
  const scale = Math.min(rect.width / W, rect.height / viewH, 480 / W);
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
    const locked = light !== 'red' && !isColorUnlocked(light as ColorId, sim.tier);
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

function applySettings(s: Settings, changed?: (keyof Settings)[]): void {
  applyControls(s, { controls: controlsEl, buttons: buttonsEl, board, shield: buttons.get('red')! });
  input.mode = s.steer;
  input.sensitivity = s.sens;
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
function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), 1600);
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
    } else if (e.type === 'death') {
      audio.stopTension();
      audio.play('death');
      if (settingsStore.get().vibration) haptic('heavy');
      if (mode === 'tutorial') tutorialDeath();
      else deathTimer = 0;
    } else if (e.type === 'aura' && mode === 'tutorial' && tutStep === 3) {
      advanceTutorial();
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
  const hint = mode === 'tutorial' ? tutorialHint() : '';
  if (hintEl.dataset.text !== hint) {
    hintEl.dataset.text = hint;
    hintEl.textContent = hint;
  }
  hintEl.classList.toggle('on', hint !== '' && !paused);
  renderButtons();
}

// ---------- Tutorial ----------

let tutStep = 0;
let tutRetry = false;

function tutorialHint(): string {
  if (tutRetry) return ru.tutorial.retry;
  switch (tutStep) {
    case 0:
      return isTouch ? ru.tutorial.pressYellow : ru.tutorial.pressYellowKey;
    case 1:
      return isTouch ? ru.tutorial.jumpYellow : ru.tutorial.jumpYellowKey;
    case 2:
      return ru.tutorial.combo;
    case 3:
      return isTouch ? ru.tutorial.shield : ru.tutorial.shieldKey;
    default:
      return '';
  }
}

function tutorialTick(): void {
  if (tutStep === 0 && sim.light === 'yellow') advanceTutorial();
  else if (tutStep === 1 && sim.captures >= 1) advanceTutorial();
  else if (tutStep === 2 && sim.streak >= 3) advanceTutorial();
  else if (tutStep === 3 && !sim.hasRedPhase) sim.forceRedPhase();
}

function advanceTutorial(): void {
  tutStep++;
  tutRetry = false;
  if (tutStep === 3) sim.forceRedPhase();
  if (tutStep >= 4) {
    try {
      localStorage.setItem('sl_tutorial', '1');
    } catch {
      /* ignore */
    }
    void session.completeTutorial();
    session.event('tutorial_end');
    mode = 'result';
    router.reset('tutorialDone');
  }
}

function tutorialDeath(): void {
  // In the tutorial a mistake simply restarts the current lesson.
  tutRetry = true;
  const step = tutStep;
  newSim(randomSeed(), true);
  if (step >= 2) sim.light = 'yellow';
  if (step === 3) sim.forceRedPhase();
  setTimeout(() => (tutRetry = false), 2500);
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
  tutStep = 0;
  tutRetry = false;
  ticket = null;
  newSim(randomSeed(), true);
  mode = 'tutorial';
  router.clear();
}

// ---------- Runs ----------

function newSim(seed: number, tutorial = false, items = false): void {
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
  if (!ticket && session.mode !== 'outside') toast(ru.result.unranked);
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
  };
  router.reset('result');

  const rankEl = document.getElementById('resultRank');
  if (!rankEl) return;
  if (!runTicket) {
    rankEl.textContent = session.mode === 'outside' ? '' : ru.result.unranked;
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
      session.prefetch();
    });
}

/** The hero portrait for the glossy magazine cover on high tiers. */
function drawCoverHero(c: HTMLCanvasElement, tier: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 72 * dpr;
  c.height = 96 * dpr;
  const g = c.getContext('2d');
  if (!g) return;
  g.scale(dpr, dpr);
  g.translate(36, 90);
  g.scale(1.45, 1.45);
  drawHeroBody(g, { tier, light: '255,214,64', neutral: true, sinceLand: 1, vy: 0, time: 0, face: 'grin', gesture: 'pocket', outfit: outfitFromMask(renderer.ownedMask) });
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
  mode = 'menu';
  ticket = null;
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

/** Draws the hero standing on a small podium, alive: breathing, blinking, waving, hopping. */
function drawStageHero(c: HTMLCanvasElement, tier: number, t: number, silhouette = false, still = false, mask = ownedMask()): void {
  const g = sizeCanvas(c);
  if (!g) return;
  const w = c.clientWidth;
  const h = c.clientHeight;
  g.clearRect(0, 0, w, h);
  const scale = Math.min(w / 66, h / 76);
  const cx = w / 2 - 9 * scale;
  const base = h - 10 * scale * 0.35 - 8;
  // Podium
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(w / 2, base + 4, 18 * scale, 3.2 * scale, 0, 0, Math.PI * 2);
  g.fill();
  if (!silhouette) {
    g.fillStyle = '#565C6B';
    g.beginPath();
    g.roundRect(w / 2 - 17 * scale, base - 1, 34 * scale, 5 * scale, 2.5 * scale);
    g.fill();
    g.fillStyle = '#8C93A3';
    g.beginPath();
    g.roundRect(w / 2 - 17 * scale, base - 1, 34 * scale, 3.4 * scale, 2.5 * scale);
    g.fill();
  }
  // A little hop every few seconds, with squash on landing.
  const cycle = still ? 3 : t % 6;
  const hop = cycle > 5.3 ? Math.sin(((cycle - 5.3) / 0.7) * Math.PI) * 9 * scale : 0;
  const sinceLand = cycle > 5.3 ? 1 : cycle;
  const gesture = still ? undefined : cycle < 2.2 ? 'wave' : tier >= 8 && cycle < 4 ? 'tie' : undefined;
  g.save();
  g.translate(cx, base - hop);
  g.scale(scale, scale);
  drawHeroBody(g, {
    tier,
    light: '255,214,64',
    neutral: true,
    sinceLand,
    vy: hop > 0 ? 300 : 0,
    time: t,
    face: still ? 'normal' : cycle < 2.2 ? 'grin' : 'normal',
    gesture,
    noBeam: true,
    outfit: outfitFromMask(mask),
  });
  g.restore();
  if (silhouette) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(20,24,34,0.92)';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
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
router.register('tutorialDone', { html: () => V.tutorialDoneView(), modal: true });
let stubKind: V.StubKind = 'offline';
router.register('stub', { html: () => V.stubView(stubKind, errorCode()), cls: 'solid' });

function errorCode(): string | null {
  const e = session.lastError;
  if (!e) return null;
  return e.status ? `${e.status} ${e.code}` : e.code;
}

router.onChange = (top) => {
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
    tutStep = 3;
    advanceTutorial();
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
  if (!hasConsent()) router.reset('consent');
  else goMenu();
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
    if (renderer.cineActive) {
      // The suit-up is a short movie: the game is frozen, input is ignored.
      acc = 0;
      input.takePress();
    } else acc += realDt * scale;
    while (acc >= DT && (mode === 'run' || mode === 'tutorial') && !renderer.cineActive) {
      sim.step({ axis: input.axis(sim.hero.x), press: input.takePress() });
      renderer.handleEvents(sim.events, sim);
      handleUiEvents(sim.events);
      if (mode === 'tutorial') tutorialTick();
      acc -= DT;
    }
  }

  const renderDt = paused ? 0 : renderer.cineActive || mode === 'menu' ? realDt : realDt * scale;
  renderer.draw(sim, active && !renderer.cineActive ? acc / DT : 1, renderDt);
  if (router.top === 'menu' || router.top === 'wardrobe') drawShowcase(now / 1000);
  updateHud(realDt);
  requestAnimationFrame(frame);
}

input.heroXProvider = () => sim.hero.x;
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
