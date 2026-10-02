import './styles.css';
import { gameConfig, isColorUnlocked, type ColorId, type LightId } from './core/gameConfig';
import { randomSeed } from './core/prng';
import { DT, Sim } from './core/sim';
import type { SimEvent } from './core/types';
import { ru } from './i18n/ru';
import { InputController } from './input/input';
import { scenes } from './render/palette';
import { Renderer } from './render/renderer';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

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

const renderer = new Renderer(canvas);
const input = new InputController(field);
const isTouch = window.matchMedia('(pointer: coarse)').matches;

let sim = new Sim(randomSeed(), 700);
let running = false;
let paused = false;
let deathTimer = -1;
let acc = 0;
let last = performance.now();
let shownScore = 0;

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
  buttonsEl.style.maxWidth = `${Math.max(cssW, 300)}px`;
}

new ResizeObserver(layout).observe(field);
window.addEventListener('orientationchange', () => setTimeout(layout, 200));

// ---------- Light buttons ----------

const LIGHTS: LightId[] = ['yellow', 'blue', 'green', 'red'];
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
    const label = light === 'red' ? 'Щит' : `+${gameConfig.colors[light as ColorId].points}`;
    const html = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${locked ? LOCK : ICONS[light]}</svg><span>${locked ? ru.hud.locked : label}</span>`;
    if (b.dataset.html !== html) {
      b.innerHTML = html;
      b.dataset.html = html;
    }
  }
}

// ---------- HUD & feedback ----------

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
      walletEl.classList.remove('bump');
      void walletEl.offsetWidth;
      walletEl.classList.add('bump');
    } else if (e.type === 'unlock') {
      const b = buttons.get(e.color)!;
      b.classList.add('unlocking');
      setTimeout(() => b.classList.remove('unlocking'), 800);
      toast(`${ru.hud.newColor} ${ru.colors[e.color]}`);
    } else if (e.type === 'tier') {
      if (!events.some((x) => x.type === 'unlock')) toast(ru.tiers[e.tier]);
      document.body.style.backgroundColor = scenes[e.tier].page;
    } else if (e.type === 'death') {
      deathTimer = 0;
    }
  }
}

function updateHud(dt: number): void {
  // Count the wallet up instead of jumping.
  if (shownScore < sim.score) {
    shownScore = Math.min(sim.score, shownScore + Math.max(1, (sim.score - shownScore) * dt * 10));
  }
  scoreEl.textContent = String(Math.floor(shownScore));
  const mult = sim.multiplier;
  comboEl.textContent = ru.hud.combo(mult);
  comboEl.classList.toggle('on', mult > 1);
  tierEl.textContent = ru.tiers[sim.tier];

  let hint = '';
  if (running && !sim.dead && sim.captures === 0) {
    if (sim.light !== 'yellow') hint = isTouch ? ru.hint.pressYellow : ru.hint.pressYellowKey;
    else hint = ru.hint.jumpYellow;
  }
  hintEl.textContent = hint;
  hintEl.classList.toggle('on', hint !== '');
  renderButtons();
}

// ---------- Game flow ----------

function startRun(): void {
  sim = new Sim(randomSeed(), sim.viewH);
  input.heroXProvider = () => sim.hero.x;
  input.reset();
  layout();
  shownScore = 0;
  deathTimer = -1;
  acc = 0;
  running = true;
  paused = false;
  document.body.style.backgroundColor = scenes[0].page;
  renderer.handleEvents([{ type: 'tier', tier: 0 }]);
  hide('startScreen');
  hide('resultScreen');
  hide('pauseScreen');
}

function readBest(): number {
  try {
    return Number(localStorage.getItem('sl_best') || 0);
  } catch {
    return 0;
  }
}

function writeBest(v: number): void {
  try {
    localStorage.setItem('sl_best', String(v));
  } catch {
    /* storage unavailable: ignore */
  }
}

function showResult(): void {
  running = false;
  const best = readBest();
  const isRecord = sim.score > best;
  if (isRecord) writeBest(sim.score);
  $('resultReason').textContent = sim.deathReason ? ru.result.reasons[sim.deathReason] : '';
  $('resultLabel').textContent = ru.result.title;
  $('resultTier').textContent = ru.tiers[sim.tier];
  $('resultScore').textContent = String(sim.score);
  const rec = $('resultRecord');
  rec.textContent = ru.result.record;
  rec.classList.toggle('hidden', !isRecord || sim.score === 0);
  const secs = Math.floor(sim.runTime);
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('resultStats').innerHTML = [
    [ru.result.best, String(Math.max(best, sim.score))],
    [ru.result.captures, String(sim.captures)],
    [ru.result.combo, String(sim.maxCombo)],
    [ru.result.time, time],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('');
  $('againBtn').textContent = ru.result.again;
  show('resultScreen');
}

function pause(): void {
  if (!running || paused || sim.dead) return;
  paused = true;
  input.reset();
  show('pauseScreen');
}

function resume(): void {
  if (!paused) return;
  paused = false;
  last = performance.now();
  hide('pauseScreen');
}

function show(id: string): void {
  $(id).classList.remove('hidden');
}
function hide(id: string): void {
  $(id).classList.add('hidden');
}

$('startTitle').textContent = ru.start.title;
$('startLead').textContent = ru.start.lead;
$('startControls').textContent = isTouch ? ru.start.controlsTouch : ru.start.controlsKeys;
$('startRed').textContent = ru.start.redHint;
$('startBtn').textContent = ru.start.play;
$('protoNote').textContent = ru.proto;
$('startBtn').addEventListener('click', startRun);
$('againBtn').addEventListener('click', startRun);
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', resume);
$('restartBtn').addEventListener('click', startRun);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', pause);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') (paused ? resume : pause)();
  if (e.code === 'Enter' && !running) startRun();
});

// ---------- Main loop ----------

function frame(now: number): void {
  const realDt = Math.min((now - last) / 1000, gameConfig.sim.maxFrameSec);
  last = now;
  let scale = 1;

  if (running && !paused) {
    if (deathTimer >= 0) {
      deathTimer += realDt;
      const { hitStopMs, slowMoSec, slowMoScale } = gameConfig.death;
      const stop = hitStopMs / 1000;
      scale = deathTimer < stop ? 0 : slowMoScale;
      if (deathTimer > stop + slowMoSec) showResult();
    }
    acc += realDt * scale;
    while (acc >= DT) {
      const axis = input.axis(sim.hero.x);
      const press = input.takePress();
      sim.step({ axis, press });
      renderer.handleEvents(sim.events);
      handleUiEvents(sim.events);
      acc -= DT;
    }
  }

  renderer.draw(sim, paused || !running ? 1 : acc / DT, paused ? 0 : realDt * scale);
  updateHud(realDt);
  requestAnimationFrame(frame);
}

input.heroXProvider = () => sim.hero.x;
layout();
requestAnimationFrame(frame);
