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
      audio.play('capture', { color: e.color });
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
      if (!events.some((x) => x.type === 'unlock')) toast(ru.tiers[e.tier]);
      document.body.style.backgroundColor = scenes[e.tier].page;
      audio.setTier(e.tier);
      audio.play('bell');
      setSkin(e.tier);
      if (mode === 'run') session.event('tier_reached', e.tier);
      if (e.tier === 7) showPress(ru.press.outlet, ru.press.talked, 'news');
      if (e.tier === 10) showPress(ru.press.magazine, ru.press.cover, 'cover');
    } else if (e.type === 'death') {
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

function newSim(seed: number, tutorial = false): void {
  sim = new Sim(seed, sim.viewH, { tutorial });
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
  newSim(ticket ? ticket.seed : randomSeed());
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

function bestTier(): number {
  return session.data?.stats.best_tier ?? 0;
}

function goMenu(): void {
  mode = 'menu';
  ticket = null;
  newSim(randomSeed());
  const best = bestTier();
  renderer.heroTierOverride = best;
  renderer.camShift = -sim.viewH * 0.45;
  audio.setTier(best);
  setSkin(best);
  document.body.style.backgroundColor = scenes[best].page;
  router.reset('menu');
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
  mount: (root) => countUp(root.querySelector<HTMLElement>('#resultScore')!),
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
  return best > 0
    ? { best_all: best, best_tier: 0, best_week: 0, last_score: null, total_runs: 1, rank_all: null, rank_week: null }
    : null;
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
    acc += realDt * scale;
    while (acc >= DT && (mode === 'run' || mode === 'tutorial')) {
      sim.step({ axis: input.axis(sim.hero.x), press: input.takePress() });
      renderer.handleEvents(sim.events, sim);
      handleUiEvents(sim.events);
      if (mode === 'tutorial') tutorialTick();
      acc -= DT;
    }
  } else if (mode === 'menu') {
    // Menu background: the hero idles on the start platform.
    acc += realDt;
    while (acc >= DT) {
      sim.step({ axis: 0, press: null });
      acc -= DT;
    }
  }

  renderer.draw(sim, active || mode === 'menu' ? acc / DT : 1, paused ? 0 : realDt * scale);
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
