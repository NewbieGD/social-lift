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
import { Session, type BlockedPlayer, type Decor, type PropPlacement, type CrownNotice, type RunTicket, type Stats } from './net/session';
import { haptic, hapticsSupported, initHaptics } from './platform/haptics';
import { ads, DEFAULT_ADS, type AdsConfig } from './platform/ads';
import { canShare, initShare, shareStory, shareWall } from './platform/share';
import { lockGestures } from './platform/gestures';
import { askNotifications, initVk } from './platform/vk';
import { DuelClient, type SpecRow, type ChatMsg, type ChatUser, type DuelMsg, type DuelPlayer } from './net/duel';
import { scenes } from './render/palette';
import { buffIcon } from './ui/buffIcons';
import { drawItem, ITEM_BY_TIER, itemCount, outfitFromMask, type Item } from './render/hero';
import { fullscreenSupported, isFullscreen, leaveFullscreenForAd, onFullscreenChange, toggleFullscreen } from './platform/fullscreen';
import { StageWind, stageLayout } from './render/ground';
import { drawMenuBackdrop } from './render/menuBackdrops';
import { drawFrame, drawFx, drawProp, propHalfWidth, propHeight } from './render/menuProps';
import { ReplayTv, saveReplay } from './render/replayTv';
import { PetWalker } from './render/petMotion';
import { LiveReplica } from './render/liveReplica';
import { perf } from './core/perf';
import { markSeen, unseen } from './ui/seen';
import { gov as govApi, type GovPlayer, type GovState, type Notice } from './net/gov';
import { drawDayTint, drawWeather, weatherFor, weatherForced, type WeatherKind } from './render/menuWeather';
import { menuState } from './render/menuState';
import { drawPet, PET_IDS, petHeight, type PetKind } from './render/pets';
import { buyWithVotes, canPay } from './platform/pay';
import { isIOS } from './platform/vk';
import { CROWN_LIFT_FRONT, crownBob, drawCrown } from './render/crown';
import { drawGovAura, drawThrone, type GovRole } from './render/govArt';
import { occupiedSlots, splitBonus, type Slot } from './render/slots';
import { STYLE_SETS, STYLES, type StyleLoadout } from './render/styles';
import { drawStyleIcon } from './render/styleArt';
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
const buffsEl = $('buffs');
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
  // On a phone the on-screen keyboard shrinks the page: the field would be measured as tiny, and
  // the screens (the chat) would shrink with it. While a text field has focus the size is kept.
  const typing = document.activeElement;
  if (typing && (typing.tagName === 'INPUT' || typing.tagName === 'TEXTAREA') && mode !== 'run' && mode !== 'tutorial') return;
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
  // Never narrower than a phone's chat needs (the keyboard can still make the measured field small).
  document.documentElement.style.setProperty('--board-w', `${Math.max(cssW, Math.min(300, window.innerWidth - 16))}px`);
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
  document.body.classList.toggle('hide-opp', !s.duelPreview);
  // "Reduced effects" forces the lowest quality; otherwise the monitor chooses (core/perf.ts).
  perf.forced = s.reducedFx ? 2 : null;
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
// ---------- Buff icons: bonus items that count but are not drawn (their slot holds a style) ----------

let buffMask = 0;

function renderBuffs(): void {
  buffsEl.replaceChildren();
  buffsEl.setAttribute('aria-label', ru.hud.buffs);
  for (let t = 0; t < ITEM_BY_TIER.length; t++) {
    if (!(buffMask & (1 << t))) continue;
    const chip = document.createElement('span');
    chip.className = 'buff';
    chip.setAttribute('role', 'listitem');
    chip.title = `${ru.items[ITEM_BY_TIER[t]]}: +5%`;
    chip.appendChild(buffIcon(t));
    buffsEl.appendChild(chip);
  }
  // The mayor's bonus to coins (while the mayor is in the game).
  const g = session.data?.gov;
  if (g?.bonus_active) {
    const chip = document.createElement('span');
    chip.className = 'buff gov-buff';
    chip.setAttribute('role', 'listitem');
    chip.title = ru.gov.buff(g.bonus_percent);
    chip.textContent = `+${g.bonus_percent}%`;
    buffsEl.appendChild(chip);
  }
}

renderer.onBuff = (tier) => {
  buffMask |= 1 << tier;
  renderBuffs();
  const last = buffsEl.lastElementChild;
  last?.classList.add('pop');
  audio.play('snap', { item: ITEM_BY_TIER[tier] });
  renderer.onCaption('item', tier);
};

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
  captionTimer = window.setTimeout(() => el.classList.remove('on'), 2600);
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
/** A second toast that lives above the screens (menus, chat): the board's own toast is under them. */
let toastTopEl: HTMLElement | null = null;

function toast(text: string, ms = 1600): void {
  let el = toastEl;
  if (router.top !== null) {
    if (!toastTopEl) {
      toastTopEl = document.createElement('div');
      toastTopEl.className = 'toast toast-top';
      document.body.appendChild(toastTopEl);
    }
    el = toastTopEl;
    // Only one of them is visible at a time.
    toastEl.classList.remove('on');
  } else toastTopEl?.classList.remove('on');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('on'), ms);
}

function handleUiEvents(events: SimEvent[]): void {
  for (const e of events) {
    if (e.type === 'capture') {
      audio.play('capture', { color: e.color, streak: sim.streak });
      const m = sim.multiplier;
      if (m > lastMult && m >= 2) comboStep(m);
      lastMult = m;
      if (settingsStore.get().vibration) haptic('light');
    } else if (e.type === 'dropPickup') {
      // Found a cosmetic: it becomes yours when the run is counted.
      audio.play('unlock');
      if (settingsStore.get().vibration) haptic('light');
      const name = runDrop ? ru.styles.parts[runDrop] : '';
      toast(`${ru.styles.found(name)}. ${ru.styles.foundHint}`, 3200);
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

/** Worn cosmetic styles (from the server; empty outside VK). */
function heroLoadout(): StyleLoadout {
  return stageOverride ? stageOverride.loadout : ((session.data?.shop?.loadout ?? {}) as StyleLoadout);
}

/** The bonus items that are drawn on the hero: those in slots without a worn style. */
function visibleMask(mask: number): number {
  return splitBonus(mask, occupiedSlots(heroLoadout())).worn;
}

/** The cosmetic the server offered for the current run (it may lie on a platform). */
let runDrop: string | null = null;

function newSim(seed: number, tutorial = false, items = false, drop = false): void {
  renderer.cinematic = duel ? false : settingsStore.get().cinematic;
  // Every run starts with nothing worn; items found along the way count for this run only.
  sim = new Sim(seed, sim.viewH, { tutorial, items, drop });
  renderer.styles = heroLoadout();
  renderer.pet = PET_IDS[heroDecor().pet ?? ''] ?? null;
  renderer.dropColor = (runDrop && STYLES[runDrop]?.palette.main) || '#FFD640';
  renderer.ownedMask = 0;
  // Worn styles keep their slots: bonus items for those slots become buff icons.
  renderer.occupied = occupiedSlots(session.data?.shop?.loadout);
  buffMask = 0;
  renderBuffs();
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
  renderer.crown = hasCrown();
  renderer.role = heroRole();
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
  if (!adAllowed()) console.info('[ads] не показываем:', adBlockReason());
  if (adAllowed()) {
    // Full screen is left alone unless an ad really does not show in it: some browsers hide VK's ad
    // behind a full-screen page. After one such miss the game remembers it on this device, and then
    // leaves full screen before asking for an ad and comes back on the first tap.
    const inFs = isFullscreen();
    const leave = inFs && fsBlocksAds();
    const backToFullscreen = leave ? await leaveFullscreenForAd() : () => undefined;
    // Never wait long for the answer: the loading screen must stay short.
    const available = await ads.check(Math.min(adsConfig().timeout_sec, 3));
    let shown = false;
    if (available) {
      audio.suspend();
      shown = await ads.show();
      audio.resume();
      // An ad was offered, but nothing appeared while the page was in full screen: remember that.
      if (!shown && inFs && !leave) setFsBlocksAds(true);
    } else if (leave) {
      // Full screen was left for nothing (no ad is available): it is not the cause.
      setFsBlocksAds(false);
    }
    backToFullscreen();
    // The ad covered the game: forget any touch that began before it and measure the field again.
    settleAfterAd();
    if (!shown) console.info('[ads] ВК не отдал рекламу (VKWebAppCheckNativeAds вернул false или ошибку)');
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
  settleAfterAd();
  // Items drop only in runs the server can verify, or locally when playing outside VK.
  runDrop = ticket?.drop ?? null;
  newSim(ticket ? ticket.seed : randomSeed(), false, !!ticket || session.mode === 'outside', !!runDrop);
  mode = 'run';
  router.clear();
  session.event('run_start');
  if (!ticket && session.mode !== 'outside') {
    const why = session.ticketError ? ru.result.reasons2[session.ticketError] : '';
    toast(why ? `${ru.result.unranked}: ${why}` : ru.result.unranked, 3200);
  }
}

/** Whether ads must be asked for outside full screen on this device (learned from a missed ad). */
function fsBlocksAds(): boolean {
  try {
    return localStorage.getItem('sl_fs_blocks_ads') === '1';
  } catch {
    return false;
  }
}

function setFsBlocksAds(on: boolean): void {
  try {
    localStorage.setItem('sl_fs_blocks_ads', on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * After an ad the webview may have lost the end of a touch, kept a half-closed screen, or changed size
 * without telling us: steering would then not work. Everything that steering depends on is renewed.
 */
function settleAfterAd(): void {
  input.reset();
  // Screens that were closing while the page was covered may never get their "finished" event.
  document.querySelectorAll('#screens .screen.leaving').forEach((el) => el.remove());
  layout();
  window.setTimeout(() => {
    input.reset();
    layout();
  }, 400);
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

/** Why no ad is shown right now (visible in the browser console, for debugging). */
function adBlockReason(): string {
  const c = adsConfig();
  if (!c.enabled) return 'выключена на сервере (ADS_ENABLED не равно 1)';
  if (session.mode !== 'online') return `режим ${session.mode}: реклама только внутри ВК`;
  if (!tutorialDone()) return 'обучение не пройдено';
  if (adState.completed < c.min_runs_before) return `сыграно ${adState.completed} из ${c.min_runs_before} забегов до первой рекламы`;
  if (adState.runsSince < c.every_n_runs) return `с прошлой рекламы ${adState.runsSince} из ${c.every_n_runs} забегов`;
  return 'пауза между показами';
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
  // How smoothly the run went on this device (anonymous; shows how the game runs on weak phones).
  const speed = perf.report();
  if (!deviceSent) {
    deviceSent = true;
    session.event('device_mem', Math.round(navigator.deviceMemory ?? 0));
    session.event('device_cores', Math.min(64, navigator.hardwareConcurrency ?? 0));
  }
  if (speed.fps > 0) {
    session.event('perf_fps', Math.min(240, speed.fps));
    session.event('perf_level', speed.level);
  }
  rememberLocalRun(sim.score, sim.tier);
  if (!finishedDuel && sim.score > 0) {
    // The TV on the main screen replays this run.
    saveReplay({ v: 1, seed: sim.seed, viewH: sim.viewH, items: sim.itemsOn, log: sim.inputLog.slice(), score: sim.score });
    tv.reload();
  }
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
      drop_found: sim.dropFound,
    })
    .then((res) => {
      const el = document.getElementById('resultRank');
      if (el) {
        if (!res) el.textContent = ru.result.saveFailed;
        else if (res.status === 'rejected') el.textContent = res.reason === 'too_short' ? ru.result.tooShort : ru.result.rejected;
        else {
          el.innerHTML = V.rankHtml(res);
          document.getElementById('resultRecord')?.classList.toggle('hidden', !res.is_record);
          // The server confirmed a new record: golden rays turn behind the card.
          if (res.is_record && sim.score > 0) document.querySelector('.panel.result')?.classList.add('is-record');
          const bestEl = document.getElementById('resultBest');
          if (bestEl) bestEl.textContent = String(res.best_all);
        }
      }
      if (res?.ring_found) {
        audio.play('unlock');
        toast(`${ru.gov.ringFound} ${ru.gov.ringNote}`, 5200);
      }
      if (res?.new_items?.length) {
        const line = document.getElementById('stylesLine');
        if (line) line.textContent = ru.styles.newStyles(res.new_items.map((id) => ru.styles.parts[id] ?? id).join(', '));
      }
      if (res && res.status === 'finished' && (res.coins_earned ?? 0) > 0) {
        const line = document.getElementById('coinsLine');
        if (line) {
          line.innerHTML = `${V.COIN_ICON}<span>${ru.result.coinsEarned(res.coins_earned ?? 0)}</span>`;
          coinBurst(line);
        }
      }
      if (res?.duel && finishedDuel) {
        const myId = String(session.data?.profile.id ?? '');
        if (res.duel.status === 'done' && res.duel.outcome) showDuelOutcome(res.duel.outcome[myId] ?? 'draw', res.duel.stake?.[myId] ?? 0);
        else if (!duelOutcome) setDuelLine(ru.duel.pending);
      }
      if (res?.is_week_record) void checkCrown(true);
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
  drawHeroFront(g, outfitFromMask(visibleMask(mask)), 1, 'wave', 'grin', heroLoadout());
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
  drawHeroFront(g, outfitFromMask(visibleMask(renderer.ownedMask)), 1, 'hips', 'grin', heroLoadout());
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

/** Score counts up on the results card, then lands with a pop and a glow. */
function countUp(el: HTMLElement): void {
  const target = Number(el.dataset.target || 0);
  const delay = 700; // the newspaper lands first
  const start = performance.now() + delay;
  const dur = Math.min(1300, 400 + target * 3);
  const step = (now: number): void => {
    const k = Math.max(0, Math.min(1, (now - start) / dur));
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
    else if (target > 0) {
      el.classList.add('landed');
      if (settingsStore.get().vibration) haptic('light');
    }
  };
  requestAnimationFrame(step);
}

/** A handful of coins jumps out of the "+N coins" line. */
function coinBurst(line: HTMLElement): void {
  if (settingsStore.get().reducedFx) return;
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('i');
    c.className = 'coin-fly';
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const d = 40 + Math.random() * 60;
    c.style.setProperty('--dx', `${Math.round(Math.cos(a) * d)}px`);
    c.style.setProperty('--dy', `${Math.round(Math.sin(a) * d)}px`);
    c.style.setProperty('--d', `${(i * 0.045).toFixed(2)}s`);
    line.appendChild(c);
    window.setTimeout(() => c.remove(), 1400);
  }
}

function lastTier(): number {
  return session.data?.stats.last_tier ?? localStats()?.last_tier ?? 0;
}

onFullscreenChange((on) => {
  document.body.classList.toggle('is-fs', on);
  window.dispatchEvent(new Event('resize'));
});

// ---------- Weekly crown ----------

let crownNotice: CrownNotice | null = null;
const crownQueue: CrownNotice[] = [];
let crownCheckedAt = 0;

/** Asks the server who wears the crown (at most every 30 s unless forced) and queues the messages. */
async function checkCrown(force = false): Promise<void> {
  if (session.mode !== 'online') return;
  if (!force && Date.now() - crownCheckedAt < 30_000) return;
  crownCheckedAt = Date.now();
  const info = await session.syncCrown();
  if (!info) return;
  crownQueue.push(...info.notices);
  showCrownNotice();
}

/** One message at a time, only over the menu, never in the middle of a run. */
function showCrownNotice(): void {
  if (crownNotice && !router.has('crownCard')) crownNotice = null;
  if (crownNotice || !crownQueue.length || router.top !== 'menu') return;
  crownNotice = crownQueue.shift() ?? null;
  if (crownNotice) router.open('crownCard');
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
  void checkCrown();
  showCrownNotice();
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

const stageWinds = new Map<string, { wind: StageWind; last: number }>();

/** The hero facing the player on a small podium: breathing, blinking, waving now and then. */
const petWalkers = new Map<string, PetWalker>();
const petLast = new Map<string, number>();

/** The hero of the main screen is being carried (hold and drag). */
let heroDragging = false;
let lastHeroDragEnd = -1e9;
/** Pixels per hero unit on the main screen (to place the hero under the finger). */
let menuScale = 3;

/**
 * Before a purchase the player sees the thing on his own hero (and in his own room): the item is
 * added to what he wears or has on the stage, only on the screen.
 */
function drawBuyPreview(t: number): void {
  const c = document.getElementById('buyPreview') as HTMLCanvasElement | null;
  const shop = session.data?.shop;
  const item = buyTarget ? shop?.catalog.find((x) => x.id === buyTarget) : undefined;
  if (!c || !shop || !item) return;
  const decor: Decor = { ...(shop.decor ?? {}) };
  const loadout = { ...(shop.loadout ?? {}) } as Record<string, string>;
  if (item.kind === 'style') loadout[item.slot] = item.id;
  else if (item.kind === 'bg') decor.bg = item.id;
  else if (item.kind === 'frame') decor.frame = item.id;
  else if (item.kind === 'fx') decor.fx = item.id;
  else if (item.kind === 'pet') decor.pet = item.id;
  else if (item.kind === 'prop') decor.props = [...(Array.isArray(decor.props) ? decor.props.filter((p) => p.id !== item.id) : []), { id: item.id, x: 0.78, y: 0.9, r: 0 }];
  stageOverride = { decor, loadout: loadout as StyleLoadout, mask: ownedMask(), crown: hasCrown(), role: heroRole() };
  drawStageHero(c, 0, t);
  stageOverride = null;
}

/** Hold the hero for a moment, then drag him to any place on the stage; a short tap still opens the wardrobe. */
function setupHeroDrag(): void {
  let timer = 0;
  let start: { x: number; y: number; id: number; el: HTMLElement } | null = null;
  const place = (e: PointerEvent): void => {
    const c = document.getElementById('menuHero') as HTMLCanvasElement | null;
    if (!c) return;
    const r = c.getBoundingClientRect();
    // The finger holds the hero at about the middle of his body.
    menuState.hero = {
      x: Math.max(0.04, Math.min(0.96, (e.clientX - r.left) / r.width)),
      y: Math.max(0.3, Math.min(0.99, (e.clientY - r.top + 30 * menuScale) / r.height)),
    };
  };
  document.addEventListener('pointerdown', (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || !el.classList.contains('hero-hit')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, el };
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!start) return;
      heroDragging = true;
      start.el.setPointerCapture?.(start.id);
      if (settingsStore.get().vibration) haptic('light');
      audio.play('click');
    }, 380);
  });
  document.addEventListener('pointermove', (e) => {
    if (!start) return;
    if (heroDragging) {
      place(e);
      return;
    }
    // Moving before the hold is long enough is a swipe, not a carry.
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) {
      window.clearTimeout(timer);
      start = null;
    }
  });
  const end = (e: PointerEvent): void => {
    window.clearTimeout(timer);
    if (heroDragging) {
      place(e);
      menuState.save();
      heroDragging = false;
      lastHeroDragEnd = performance.now();
      e.preventDefault();
    }
    start = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  // The long press must not open the system menu of the browser.
  document.addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement | null)?.classList?.contains('hero-hit')) e.preventDefault();
  });
}
setupHeroDrag();

/** When the player last tapped the pet on a canvas (seconds on the page clock). */
const petReactions = new Map<string, number>();
/** Where the pet of the main screen was drawn (for taps). */
let menuPetBox: { x: number; y: number; r: number } | null = null;

function paintStagePet(g: CanvasRenderingContext2D, walker: PetWalker, kind: PetKind, base: number, scale: number, t: number, canvasId = ''): void {
  const v = walker.view();
  const since = petReactions.has(canvasId) ? performance.now() / 1000 - (petReactions.get(canvasId) ?? 0) : 99;
  // A tap makes the pet hop.
  const hopY = since < 1 ? Math.abs(Math.sin(since * 10)) * 9 * scale * Math.exp(-since * 3) : 0;
  const py = base + (walker.lane === 'front' ? 3.2 : -3) * scale - v.lift - hopY;
  g.save();
  // Behind the hero the pet walks a little higher up the floor; in front of him a little lower.
  g.translate(v.x, py);
  g.scale(scale * v.facing, scale);
  drawPet(g, kind, { t, mode: v.mode, phase: v.phase });
  g.restore();
  if (canvasId === 'menuHero') menuPetBox = { x: v.x, y: py - 7 * scale, r: 13 * scale };
  if (since < 1.4) {
    // Hearts (or sparkles for the flying ones) float up from the pet.
    const flying = kind === 'spark' || kind === 'trophy' || kind === 'parrot';
    for (let i = 0; i < 4; i++) {
      const k = Math.max(0, since - i * 0.12) / 1.1;
      if (k <= 0 || k >= 1) continue;
      const x = v.x + (i - 1.5) * 7 * scale + Math.sin(k * 6 + i) * 3 * scale;
      const y = py - 16 * scale - k * 26 * scale;
      g.save();
      g.globalAlpha = 1 - k;
      g.translate(x, y);
      g.scale(scale * 0.5, scale * 0.5);
      g.fillStyle = flying ? '#FFE27A' : '#FF6F8E';
      g.beginPath();
      if (flying) {
        for (let j = 0; j < 8; j++) {
          const a = (j / 8) * Math.PI * 2;
          const r = j % 2 ? 2 : 5;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
      } else {
        g.moveTo(0, 4);
        g.bezierCurveTo(-7, -1, -4, -7, 0, -3);
        g.bezierCurveTo(4, -7, 7, -1, 0, 4);
      }
      g.fill();
      g.restore();
    }
  }
}

/** Proportions of the main screen stage (the editor and profiles copy them). */
let menuAspect = 320 / 430;
// The hero stands in the middle of the stage: the stats cards unfold over it on demand.
const menuSideFrac = 0;
/** The statistics cards on the main screen are folded until tapped. */
let statsOpen = false;

/** Sizes a preview stage like the main screen stage, as large as the screen allows. */
function fitStage(root: HTMLElement, selector: string): void {
  const stage = root.querySelector<HTMLElement>(selector);
  const box = stage?.parentElement;
  if (!stage || !box) return;
  const maxH = window.innerHeight * 0.56;
  const w = Math.max(160, Math.min(box.clientWidth, maxH * menuAspect));
  stage.style.width = `${Math.round(w)}px`;
  stage.style.aspectRatio = String(menuAspect);
}

/** Where each placed object was drawn on a canvas (for dragging them in the editor). */
interface PropBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
const propBoxes = new Map<string, PropBox[]>();
/** The object selected in the decoration editor. */
let decorSelected: string | null = null;

function paintStageProps(
  g: CanvasRenderingContext2D,
  props: PropPlacement[],
  canvasId: string,
  w: number,
  h: number,
  L: { wallBase: number },
  scale: number,
  t: number,
  base: number,
  layer: 'back' | 'front',
  mode: 'view' | 'edit',
): void {
  if (layer === 'back') propBoxes.set(canvasId, []);
  const boxes = propBoxes.get(canvasId) ?? [];
  let tvShown = false;
  for (const p of [...props].sort((a, b) => a.y - b.y)) {
    const py = p.y * h;
    const inFront = py > base + 1 * scale;
    if ((layer === 'front') !== inFront) {
      if (p.id === 'prop_tv' && !stageOverride && menuState.tvOn) tvShown = true;
      continue;
    }
    const px = p.x * w;
    const hw = propHalfWidth(p.id);
    const ph = propHeight(p.id);
    g.save();
    g.translate(px, py);
    // A lying object rests on the floor: lift it by half of its thickness.
    if (p.r) g.translate(0, -hw * scale);
    if (p.r) g.rotate((p.r * Math.PI) / 180);
    g.scale(scale, scale);
    if (p.y * h < L.wallBase - 2 * scale && !p.r) {
      // On the wall: a little shelf under the object.
      g.fillStyle = '#6B4A2E';
      g.fillRect(-hw - 2, 0, hw * 2 + 4, 1.6);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(-hw - 2, 1.6, hw * 2 + 4, 0.8);
    }
    // Another player's TV shows no signal (their last run lives on their device).
    const since = menuState.touched.has(p.id) ? performance.now() / 1000 - (menuState.touched.get(p.id) ?? 0) : undefined;
    const tvPainter =
      p.id === 'prop_tv'
        ? (gg: CanvasRenderingContext2D, ww: number, hh: number): void => {
            if (stageOverride) tv.paintNoSignal(gg, ww, hh);
            else if (!menuState.tvOn) paintTvOff(gg, ww, hh);
            else tv.paint(gg, ww, hh);
          }
        : undefined;
    drawProp(g, p.id, t, tvPainter, { on: p.id === 'prop_lamp' && !stageOverride ? menuState.lampOn : undefined, touch: since });
    g.restore();
    if (p.id === 'prop_tv' && !stageOverride && menuState.tvOn) tvShown = true;
    // Bounds on the canvas (for picking the object up with a finger).
    const lenS = ph * scale;
    const thick = hw * 2 * scale;
    const box: PropBox =
      p.r === 0
        ? { id: p.id, x: px - thick / 2, y: py - lenS, w: thick, h: lenS }
        : p.r === 90
          ? { id: p.id, x: px, y: py - thick, w: lenS, h: thick }
          : { id: p.id, x: px - lenS, y: py - thick, w: lenS, h: thick };
    boxes.push(box);
    if (mode === 'edit' && decorSelected === p.id) {
      g.save();
      g.strokeStyle = '#ffd640';
      g.lineWidth = 1.6;
      g.setLineDash([5, 4]);
      g.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
      g.restore();
    }
  }
  propBoxes.set(canvasId, boxes);
  if (layer === 'front') {
    if (tvShown) {
      const dtTv = tvLast < 0 ? 0 : Math.min(0.1, Math.max(0, t - tvLast));
      tvLast = t;
      tv.setStyles(heroLoadout());
      tv.update(dtTv);
    } else tvLast = -1;
  }
}

/** A TV that is switched off: a dark glass with a faint reflection. */
function paintTvOff(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#06070A';
  g.fillRect(0, 0, w, h);
  const r = g.createLinearGradient(0, 0, w, h);
  r.addColorStop(0, 'rgba(120,150,200,0.16)');
  r.addColorStop(0.5, 'rgba(120,150,200,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, w, h);
}

const tv = new ReplayTv();
tv.reload();
let tvLast = -1;

function heroDecor(): Decor {
  return stageOverride ? stageOverride.decor : session.data?.shop?.decor ?? {};
}

function drawStageHero(c: HTMLCanvasElement, _tier: number, t: number, _silhouette = false, still = false, mask = ownedMask()): void {
  const g = sizeCanvas(c);
  if (!g) return;
  const w = c.clientWidth;
  const h = c.clientHeight;
  g.clearRect(0, 0, w, h);
  // The hero stands on the street in front of a brick wall; the soles are on the `feet` line.
  const L = stageLayout(h);
  const scale = Math.min(w / 58, (L.feet - 6) / (crownShown() ? 124 : 96));
  let base = L.feet;
  // The main screen, the wardrobe and the previews wear the chosen decoration.
  const decorOn = c.id === 'menuHero' || c.id === 'decorHero' || c.id === 'petsHero' || c.id === 'profileHero' || c.id === 'wardHero' || c.id === 'buyPreview';
  const decor = decorOn ? heroDecor() : ({} as Decor);
  drawMenuBackdrop(g, decor.bg, w, h, L, scale, t);
  // The living main screen: the time of day, a darker room with the lamp off, and the weather.
  let weather: WeatherKind = 'none';
  if ((c.id === 'menuHero' || c.id === 'decorHero') && !stageOverride) {
    const now = new Date();
    drawDayTint(g, w, h, now.getHours() + now.getMinutes() / 60);
    if (Array.isArray(decor.props) && decor.props.some((p) => p.id === 'prop_lamp') && !menuState.lampOn) {
      g.fillStyle = 'rgba(4,8,28,0.3)';
      g.fillRect(0, 0, w, h);
    }
    if (c.id === 'menuHero' && (perf.effective === 0 || weatherForced()) && !settingsStore.get().reducedFx) {
      weather = weatherFor(decor.bg);
      drawWeather(g, weather, 'back', w, h, L, scale, t);
    }
  }
  // Light wind: leaves and scraps of paper blow along the street (not with "less effects").
  const windOn = !settingsStore.get().reducedFx && !still;
  let wind: StageWind | null = null;
  if (windOn) {
    let st = stageWinds.get(c.id);
    if (!st) {
      st = { wind: new StageWind(), last: t };
      stageWinds.set(c.id, st);
    }
    const dt = Math.max(0, Math.min(0.1, t - st.last));
    st.last = t;
    st.wind.update(dt, w, h, L, scale);
    wind = st.wind;
    wind.draw(g, 0, scale);
  }
  // On the main screen the stats panel stands at the right: the hero is centered in the free part.
  // The editor and the profile reserve the same room (and have the same proportions) as the
  // main screen stage, so objects stand where they do there.
  let side = 0;
  if (c.id === 'menuHero') {
    menuAspect = w / h;
  } else if (c.id === 'decorHero' || c.id === 'profileHero') side = Math.round(w * menuSideFrac);
  let cx = side ? (w - side - 8) / 2 : w / 2;
  if (c.id === 'menuHero') {
    // The player can put the hero anywhere on the stage (hold him and drag).
    if (menuState.hero) {
      cx = Math.max(10 * scale, Math.min(w - 10 * scale, menuState.hero.x * w));
      base = Math.max(L.wallBase + 8 * scale, Math.min(h - 2 * scale, menuState.hero.y * h));
    }
    menuScale = scale;
  }
  if (c.id === 'menuHero') {
    // The "tap the hero" hint sits exactly over the hero.
    const hint = c.parentElement?.querySelector<HTMLElement>('.tap-hint');
    if (hint) {
      hint.style.left = `${cx}px`;
      // Just above the crown (or the head), with a small gap so they never touch.
      const topY = base - (crownShown() ? 100 : 72) * scale;
      hint.style.top = `${Math.max(0, topY - hint.offsetHeight - 6)}px`;
    }
    // Only the hero himself opens the wardrobe: an invisible button exactly over his figure.
    const hit = c.parentElement?.querySelector<HTMLElement>('.hero-hit');
    if (hit) {
      const top = base - (crownShown() ? 100 : 72) * scale;
      hit.style.left = `${cx - 24 * scale}px`;
      hit.style.top = `${top}px`;
      hit.style.width = `${48 * scale}px`;
      hit.style.height = `${base - top + 2 * scale}px`;
    }
  }
  // Objects stand wherever the player put them. Those behind the hero's feet line are drawn
  // first, those in front of him after the hero, so nothing is hidden by mistake.
  const placed = decorOn && Array.isArray(decor.props) ? decor.props : [];
  const propLayer = c.id === 'decorHero' ? 'edit' : 'view';
  if (decorOn) paintStageProps(g, placed, c.id, w, h, L, scale, t, base, 'back', propLayer);
  if (c.id === 'decorHero' && decorTab === 'prop') {
    // The buttons and the folded statistics sit over the top edge of the main screen.
    g.save();
    g.fillStyle = 'rgba(8,10,16,0.3)';
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.setLineDash([4, 4]);
    g.beginPath();
    g.roundRect(4, 4, w - 8, Math.max(30, h * 0.085), 8);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = '600 10px sans-serif';
    g.textAlign = 'center';
    g.fillText(ru.decor.statsZone, w / 2, 4 + Math.max(30, h * 0.085) / 2 + 3);
    g.restore();
  }
  // The pet wanders around on the floor, sometimes behind the hero, sometimes in front of him.
  const petKind = decorOn && decor.pet ? PET_IDS[decor.pet] : undefined;
  let walker: PetWalker | null = null;
  if (petKind) {
    walker = petWalkers.get(c.id) ?? new PetWalker();
    petWalkers.set(c.id, walker);
    const free = side ? w - side - 8 : w;
    const dtPet = Math.max(0, Math.min(0.1, t - (petLast.get(c.id) ?? t)));
    petLast.set(c.id, t);
    walker.update(dtPet, petKind, 14 * scale, free - 14 * scale, scale);
    if (walker.lane === 'back') paintStagePet(g, walker, petKind, base, scale, t, c.id);
  }
  g.save();
  // While he is being carried he is lifted a little above the ground.
  g.translate(cx, base - (c.id === 'menuHero' && heroDragging ? 5 * scale : 0));
  g.scale(scale, scale);
  const outfit = outfitFromMask(visibleMask(mask));
  // The glow of the mayor or of an assistant, behind the hero.
  drawGovAura(g, heroRole(), t, -34, settingsStore.get().reducedFx);
  drawHeroFront(g, outfit, t, still ? 'hips' : 'idle', !still && t % 6 < 2.2 ? 'grin' : 'normal', heroLoadout());
  // The weekly leader's crown (or the mayor's diamond crown) floats above the head (higher than a cap or a helmet).
  if (crownShown()) {
    g.translate(0, -(outfit.suit ? 68 : outfit.cap || heroLoadout().head ? 64 : 61) - CROWN_LIFT_FRONT - crownBob(t));
    g.scale(1.15, 1.15);
    drawCrown(g, t, settingsStore.get().reducedFx, heroRole() === 'mayor' ? 'mayor' : 'leader');
  }
  g.restore();
  if (decorOn) paintStageProps(g, placed, c.id, w, h, L, scale, t, base, 'front', propLayer);
  if (walker && petKind && walker.lane === 'front') paintStagePet(g, walker, petKind, base, scale, t, c.id);
  wind?.draw(g, 1, scale);
  if (weather !== 'none') drawWeather(g, weather, 'front', w, h, L, scale, t);
  if (decorOn && decor.fx) drawFx(g, decor.fx, w, h, t, cx, base);
  if (decorOn && decor.frame) drawFrame(g, decor.frame, w, h, t);
}

/** The player holds the crown of the weekly leader. */
/** How another player looks, while their profile is drawn (the stage reads these instead of ours). */
interface StageView {
  decor: Decor;
  loadout: StyleLoadout;
  mask: number;
  crown: boolean;
  role?: GovRole;
}
let stageOverride: StageView | null = null;

/** A post of the player (or of the player on view): the mayor or an assistant. */
function heroRole(): GovRole {
  return stageOverride ? stageOverride.role ?? null : session.data?.gov?.role ?? null;
}

/** Whether a crown floats above the hero: the leader's, or the mayor's (it takes its place). */
function crownShown(): boolean {
  return hasCrown() || heroRole() === 'mayor';
}

function hasCrown(): boolean {
  return stageOverride ? stageOverride.crown : !!session.data?.stats.crown;
}

// ---------- Other players' profiles ----------

const lbKnown = new Map<number, import('./net/session').LeaderRow>();
let profileWho: V.ProfileWho | null = null;
let profileData: import('./net/session').PublicProfile | null = null;
let profileState: 'loading' | 'ready' | 'failed' = 'loading';
let profileId = 0;

async function showGameProfile(id: number): Promise<void> {
  profileId = id;
  profileData = null;
  profileState = 'loading';
  router.open('profile');
  const p = await session.fetchPlayer(id);
  if (profileId !== id) return;
  profileData = p;
  profileState = p ? 'ready' : 'failed';
  if (router.top === 'profile') router.refresh();
}

/** Paints the part icons of the styles screen (parts you do not have yet are dark silhouettes). */
function drawStyleIcons(root: HTMLElement): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-style]').forEach((c) => {
    const d = STYLES[c.dataset.style ?? ''];
    const g = sizeCanvas(c);
    if (!d || !g) return;
    const w = c.clientWidth;
    const h = c.clientHeight;
    g.clearRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2);
    const k = Math.min(w, h) / 44;
    g.scale(k, k);
    drawStyleIcon(g, d);
    g.restore();
    if (c.dataset.locked === '1') {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(28,32,44,0.93)';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    }
  });
}

// ---------- Premium: things sold for VK votes ----------

let stylesTab: 'mine' | 'premium' | 'gov' = 'mine';
const SERAPH_LOADOUT = { head: 'seraph_head', torso: 'seraph_torso', arms: 'seraph_arms', legs: 'seraph_legs', torch: 'seraph_torch' } as StyleLoadout;
let buying = false;

/** Live previews on the premium tab: the full set with its glow and wings, and the golden spark. */
function drawPremiumPreviews(t: number): void {
  const hc = document.getElementById('premiumHero') as HTMLCanvasElement | null;
  const hg = hc ? sizeCanvas(hc) : null;
  if (hc && hg) {
    const w = hc.clientWidth;
    const h = hc.clientHeight;
    hg.clearRect(0, 0, w, h);
    const scale = Math.min(w / 74, (h - 4) / 86);
    hg.save();
    hg.translate(w / 2, h - 5 * scale);
    hg.scale(scale, scale);
    drawHeroFront(hg, outfitFromMask(0), t, 'hips', 'normal', SERAPH_LOADOUT);
    hg.restore();
  }
  const pc = document.getElementById('premiumPet') as HTMLCanvasElement | null;
  const pg = pc ? sizeCanvas(pc) : null;
  if (pc && pg) {
    const w = pc.clientWidth;
    const h = pc.clientHeight;
    pg.clearRect(0, 0, w, h);
    const k = Math.min(w / 30, h / 24);
    pg.save();
    pg.translate(w / 2, h * 0.86);
    pg.scale(k, k);
    drawPet(pg, 'spark', { t, mode: 'fly', phase: 0 });
    pg.restore();
  }
}

/** Waits a moment for the server to confirm the order (VK reports success after it did). */
async function waitForDelivery(productId: string): Promise<boolean> {
  for (let i = 0; i < 5; i++) {
    const shop = await session.refreshShop();
    const items = shop?.products?.find((q) => q.id === productId)?.items ?? [];
    if (shop && items.length && items.every((id) => shop.owned.includes(id))) return true;
    await new Promise((r) => setTimeout(r, 900));
  }
  return false;
}

async function buyPremium(productId: string): Promise<void> {
  if (buying) return;
  if (!canPay()) {
    toast(ru.premium.notHere, 3200);
    return;
  }
  buying = true;
  try {
    const res = await buyWithVotes(productId);
    if (res === 'ok') {
      toast(ru.premium.pending, 4000);
      const done = await waitForDelivery(productId);
      toast(done ? ru.premium.done : ru.premium.failed, 3200);
      if (done) audio.play('fanfare');
      if (router.top === 'styles') router.refresh();
    } else if (res === 'error') {
      toast(ru.premium.failed, 3200);
    }
  } finally {
    buying = false;
  }
}

// ---------- Pets screen ----------

function drawPetIcons(root: HTMLElement): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-pet]').forEach((c) => {
    const id = c.dataset.pet ?? '';
    const g = sizeCanvas(c);
    if (!g) return;
    const w = c.clientWidth;
    const h = c.clientHeight;
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.roundRect(0, 0, w, h, 8);
    g.clip();
    g.fillStyle = '#242A38';
    g.fillRect(0, 0, w, h);
    const kind = PET_IDS[id];
    if (kind) {
      const k = Math.min((h - 12) / petHeight(kind), (w - 8) / 14);
      g.translate(w / 2, h - 7);
      g.scale(k, k);
      drawPet(g, kind, { t: 1.1, mode: kind === 'parrot' ? 'perch' : 'sit', phase: 0 });
    }
    g.restore();
    if (c.dataset.locked === '1') {
      g.fillStyle = 'rgba(14,17,26,0.7)';
      g.beginPath();
      g.roundRect(0, 0, w, h, 8);
      g.fill();
    }
  });
}

// ---------- Decoration screen ----------

let decorTab: V.DecorTab = 'bg';
let buyTarget: string | null = null;

// ---------- The government (the weekly mayor election) ----------
let govCache: GovState | null = null;
let govNotices: Notice[] | null = null;
let govFindTab: 'top' | 'chat' | 'rivals' = 'top';
let govFindList: GovPlayer[] | null = null;
let govFindQuery = '';

/** The color of the Play button chosen by the mayor (it is the same for everybody). */
function applyPlayColor(color: string | undefined): void {
  document.body.dataset.play = color && color !== 'default' ? color : '';
}

/** Loads the state of the government and remembers what the rest of the game needs from it. */
async function refreshGov(): Promise<void> {
  if (session.mode !== 'online') return;
  const res = await govApi.state();
  if (!res.ok) return;
  govCache = res.state;
  const cur = session.data?.gov;
  if (session.data) {
    session.data.gov = {
      role: res.state.me.role,
      play_color: res.state.settings.play_color,
      bonus_active: res.state.bonus_active,
      bonus_percent: res.state.bonus_percent,
      mayor_id: res.state.mayor?.id ?? null,
      unread: cur?.unread ?? 0,
    };
  }
  applyPlayColor(res.state.settings.play_color);
  if (router.top === 'government' || router.top === 'govManage' || router.top === 'menu') router.refresh();
}

/** Loads the list of players the mayor can appoint (the search box keeps its focus while it is redrawn). */
async function loadGovFind(show: boolean): Promise<void> {
  govFindList = null;
  if (show) router.refresh();
  const list = await govApi.find(govFindTab, govFindQuery);
  govFindList = list ?? [];
  if (router.top !== 'govFind') return;
  const hadFocus = document.activeElement?.id === 'govSearch';
  router.refresh();
  if (hadFocus) {
    const input = document.getElementById('govSearch') as HTMLInputElement | null;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }
}

async function loadNotices(): Promise<void> {
  const res = await govApi.notices();
  govNotices = res?.items ?? [];
  if (session.data?.gov) session.data.gov.unread = 0;
  if (router.top === 'notices') router.refresh();
  // The messages are shown (the unread ones stay highlighted in this window), and now count as read.
  void govApi.markRead();
}

/** The throne hall of the Government screen. */
function drawGovThrone(t: number): void {
  const c = document.getElementById('throneCanvas') as HTMLCanvasElement | null;
  const g = c ? sizeCanvas(c) : null;
  if (!c || !g) return;
  drawThrone(g, c.clientWidth, c.clientHeight, t, govCache?.mayor ?? null);
}

/** The text of a failed government request. */
function govError(code: string): string {
  return ru.gov.errors[code] ?? ru.gov.errors.network;
}

/** The result of a government request: the new state is kept, a failure is explained. */
function govDone(res: Awaited<ReturnType<typeof govApi.state>>, okText?: string): boolean {
  if (!res.ok) {
    toast(govError(res.code), 3400);
    return false;
  }
  govCache = res.state;
  if (session.data?.gov) {
    session.data.gov.role = res.state.me.role;
    session.data.gov.play_color = res.state.settings.play_color;
    session.data.gov.bonus_active = res.state.bonus_active;
  }
  applyPlayColor(res.state.settings.play_color);
  if (okText) toast(okText, 2400);
  router.refresh();
  return true;
}

/** The strip under the Play button: who is the mayor, or what stage the election is at. */
function govStrip(): { kind: 'mayor' | 'voting' | 'candidacy' | 'empty'; text: string; unread: number } {
  const unread = session.data?.gov?.unread ?? 0;
  const g = govCache;
  if (g?.mayor) return { kind: 'mayor', text: ru.gov.stripMayor(g.mayor.name || ru.leaders.player), unread };
  if (g?.phase === 'voting') return { kind: 'voting', text: ru.gov.stripVoting, unread };
  if (g) return { kind: 'candidacy', text: ru.gov.stripCandidacy, unread };
  return { kind: 'empty', text: ru.gov.stripEmpty, unread };
}
/** The item shown in the "new thing!" card after a purchase. */
let revealId: string | null = null;

/** Items found, bought or earned since the player last looked: highlighted once in their screen. */
const shopNew = { styles: new Set<string>(), decor: new Set<string>(), pets: new Set<string>() };
type ShopArea = 'styles' | 'decor' | 'pets';
const AREA_KINDS: Record<ShopArea, string[]> = { styles: ['style'], decor: ['bg', 'prop', 'frame', 'fx'], pets: ['pet'] };

/** The unseen owned items of each area (nothing is marked as seen here). */
function unseenByArea(): Record<ShopArea, Set<string>> {
  const shop = session.data?.shop;
  const out = { styles: new Set<string>(), decor: new Set<string>(), pets: new Set<string>() };
  if (!shop) return out;
  const fresh = unseen(shop.owned);
  for (const id of fresh) {
    const kind = shop.catalog.find((c) => c.id === id)?.kind;
    if (!kind) continue;
    for (const area of Object.keys(AREA_KINDS) as ShopArea[]) if (AREA_KINDS[area].includes(kind)) out[area].add(id);
  }
  return out;
}

/** The player opens Styles, Decoration or Pets: what is new there is highlighted now, and counted as seen. */
function enterShopArea(area: ShopArea): void {
  const fresh = unseenByArea()[area];
  shopNew[area] = fresh;
  markSeen(fresh);
}

/** Paints the cards of the decoration screen: background thumbnails, objects, frames, effects. */
function drawDecorIcons(root: HTMLElement): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-decor]').forEach((c) => {
    const id = c.dataset.decor ?? '';
    const kind = c.dataset.kind ?? '';
    const g = sizeCanvas(c);
    if (!g) return;
    const w = c.clientWidth;
    const h = c.clientHeight;
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.roundRect(0, 0, w, h, 8);
    g.clip();
    if (kind === 'bg') {
      const L = stageLayout(h);
      drawMenuBackdrop(g, id === 'bg_default' ? undefined : id, w, h, L, Math.max(1, h / 130), 1.4);
    } else {
      g.fillStyle = '#242A38';
      g.fillRect(0, 0, w, h);
      if (kind === 'prop') {
        const k = Math.min((h - 12) / propHeight(id), (w - 8) / 14);
        g.translate(w / 2, h - 6);
        g.scale(k, k);
        drawProp(g, id, 1.2, (gg, ww, hh) => {
          gg.fillStyle = '#2E7D52';
          gg.fillRect(0, 0, ww, hh);
          gg.fillStyle = '#FFD640';
          gg.fillRect(ww * 0.3, hh * 0.45, ww * 0.4, hh * 0.1);
        });
      } else if (kind === 'frame' && id !== 'none') {
        drawFrame(g, id, w, h, 1.2);
      } else if (kind === 'fx' && id !== 'none') {
        drawFx(g, id, w, h, 2.1, w / 2, h - 4);
      }
    }
    g.restore();
    if (c.dataset.locked === '1') {
      g.fillStyle = 'rgba(14,17,26,0.55)';
      g.beginPath();
      g.roundRect(0, 0, w, h, 8);
      g.fill();
    }
  });
}

/** Applies a decoration change at once and lets the server confirm it. */
function applyDecor(change: Parameters<Session['setDecor']>[0], save = true): void {
  const shop = session.data?.shop;
  if (!shop) return;
  const next: Decor = { ...(shop.decor ?? {}) };
  for (const key of ['bg', 'frame', 'fx', 'pet'] as const) {
    if (key in change) {
      if (change[key]) next[key] = change[key] as string;
      else delete next[key];
    }
  }
  if (change.props) {
    if (change.props.length) next.props = change.props;
    else delete next.props;
  }
  shop.decor = next;
  tvLast = -1;
  if (!save) return;
  if (router.top === 'decor') router.refresh();
  void session.setDecor(change).then((saved) => {
    if (saved) return;
    void session.refreshShop().then(() => router.top === 'decor' && router.refresh());
  });
}

// ---------- Objects: place, drag, turn, remove ----------

const MAX_PROPS = 8;

function currentProps(): PropPlacement[] {
  const list = session.data?.shop?.decor?.props;
  return Array.isArray(list) ? list.map((p) => ({ ...p })) : [];
}

/** A free spot for a new object: far from the hero and from the objects already placed. */
function defaultPlacement(existing: PropPlacement[]): { x: number; y: number } {
  // The hero fills the middle-left of the stage (x about 0.15 to 0.45), so new objects start
  // beside him: along the right edge, the left edge and the back of the floor.
  const candidates = [
    [0.92, 0.93], [0.64, 0.96], [0.9, 0.72], [0.66, 0.76], [0.8, 0.58], [0.06, 0.92], [0.06, 0.62], [0.64, 0.56], [0.78, 0.84], [0.06, 0.45],
  ];
  const obstacles: [number, number][] = existing.map((p) => [p.x, p.y] as [number, number]);
  let best = candidates[0];
  let bestD = -1;
  for (const c of candidates) {
    const d = Math.min(...obstacles.map(([ox, oy]) => Math.hypot(c[0] - ox, (c[1] - oy) * 1.4)));
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return { x: best[0], y: best[1] };
}

function placeProp(id: string): void {
  const props = currentProps();
  const at = props.findIndex((p) => p.id === id);
  if (at >= 0) {
    // Tapping a placed object in the list takes it away.
    props.splice(at, 1);
    if (decorSelected === id) decorSelected = null;
    applyDecor({ props });
    return;
  }
  if (props.length >= MAX_PROPS) {
    toast(ru.decor.tooMany(MAX_PROPS), 2200);
    return;
  }
  const pos = defaultPlacement(props);
  props.push({ id, x: pos.x, y: pos.y, r: 0 });
  decorSelected = id;
  applyDecor({ props });
}

function turnSelected(): void {
  const props = currentProps();
  const p = props.find((q) => q.id === decorSelected);
  if (!p) return;
  p.r = p.r === 0 ? 90 : p.r === 90 ? 270 : 0;
  applyDecor({ props });
}

function removeSelected(): void {
  if (!decorSelected) return;
  const id = decorSelected;
  decorSelected = null;
  applyDecor({ props: currentProps().filter((p) => p.id !== id) });
}

/** Updates the object buttons without rebuilding the screen (it must stay put during a drag). */
function syncDecorControls(): void {
  const has = !!decorSelected && currentProps().some((p) => p.id === decorSelected);
  for (const sel of ['[data-action="decorTurn"]', '[data-action="decorRemove"]']) {
    const b = document.querySelector<HTMLButtonElement>(sel);
    if (b) b.disabled = !has;
  }
  const label = document.querySelector<HTMLElement>('.spot-row > span:first-child');
  if (label) label.textContent = has && decorSelected ? ru.decor.names[decorSelected] ?? '' : ru.decor.dragHint;
}

/** Dragging objects in the editor preview with a finger or the mouse. */
function setupPropDragging(): void {
  let drag: { id: string; dx: number; dy: number; moved: boolean } | null = null;
  const canvasOf = (e: PointerEvent): HTMLCanvasElement | null => {
    const c = e.target as HTMLElement | null;
    return c && c.id === 'decorHero' ? (c as HTMLCanvasElement) : null;
  };
  document.addEventListener('pointerdown', (e) => {
    const c = canvasOf(e);
    if (!c || decorTab !== 'prop') return;
    const r = c.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const boxes = propBoxes.get('decorHero') ?? [];
    // The object drawn last (lowest on the screen) is on top.
    const hit = [...boxes].reverse().find((b) => px >= b.x - 6 && px <= b.x + b.w + 6 && py >= b.y - 6 && py <= b.y + b.h + 6);
    if (!hit) {
      decorSelected = null;
      syncDecorControls();
      return;
    }
    const p = currentProps().find((q) => q.id === hit.id);
    if (!p) return;
    decorSelected = hit.id;
    drag = { id: hit.id, dx: p.x * c.clientWidth - px, dy: p.y * c.clientHeight - py, moved: false };
    c.setPointerCapture(e.pointerId);
    e.preventDefault();
    syncDecorControls();
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const c = document.getElementById('decorHero') as HTMLCanvasElement | null;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = Math.max(0.03, Math.min(0.97, (e.clientX - r.left + drag.dx) / c.clientWidth));
    const y = Math.max(0.06, Math.min(0.99, (e.clientY - r.top + drag.dy) / c.clientHeight));
    const props = currentProps();
    const p = props.find((q) => q.id === drag!.id);
    if (!p) return;
    p.x = Math.round(x * 1000) / 1000;
    p.y = Math.round(y * 1000) / 1000;
    drag.moved = true;
    // Smooth on screen, saved when the finger lifts.
    applyDecor({ props }, false);
  });
  const end = (): void => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) applyDecor({ props: currentProps() });
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}
setupPropDragging();

/** Taps on the main screen: the TV and the lamp switch on and off, balls bounce, the pet reacts. */
function setupMenuTaps(): void {
  document.addEventListener('click', (e) => {
    const c = e.target as HTMLElement | null;
    if (!c || c.id !== 'menuHero') return;
    const r = c.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const now = performance.now() / 1000;
    const boxes = propBoxes.get('menuHero') ?? [];
    // The object drawn last (lowest on the screen) is on top.
    const hit = [...boxes].reverse().find((b) => px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4);
    if (hit) {
      if (hit.id === 'prop_tv') {
        menuState.tvOn = !menuState.tvOn;
        menuState.save();
        tvLast = -1;
      } else if (hit.id === 'prop_lamp') {
        menuState.lampOn = !menuState.lampOn;
        menuState.save();
      }
      menuState.touched.set(hit.id, now);
      audio.play('click');
      if (settingsStore.get().vibration) haptic('light');
      return;
    }
    if (menuPetBox && Math.hypot(px - menuPetBox.x, py - menuPetBox.y) <= menuPetBox.r + 6) {
      petReactions.set('menuHero', now);
      audio.play('unlock');
      if (settingsStore.get().vibration) haptic('light');
    }
  });
}
setupMenuTaps();

// The government: load it soon after the start, keep it fresh, and let the server know that the mayor is in the game.
window.setTimeout(() => void refreshGov(), 1800);
window.setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  void refreshGov();
  void govApi.notices().then((r) => {
    if (r && session.data?.gov) {
      session.data.gov.unread = r.unread;
      if (router.top === 'menu') router.refresh();
    }
  });
}, 90_000);
window.setInterval(() => {
  if (document.visibilityState === 'visible' && session.data?.gov?.role === 'mayor') govApi.ping();
}, 60_000);

/** The live preview of the hero in the styles screen. */
function drawStylesPreview(t: number): void {
  const c = document.getElementById('stylesHero') as HTMLCanvasElement | null;
  const g = c ? sizeCanvas(c) : null;
  if (!c || !g) return;
  const w = c.clientWidth;
  const h = c.clientHeight;
  g.clearRect(0, 0, w, h);
  const scale = Math.min(w / 58, (h - 8) / 82);
  g.save();
  g.translate(w / 2, h - 6 * scale);
  g.scale(scale, scale);
  drawHeroFront(g, outfitFromMask(0), t, 'idle', 'normal', heroLoadout());
  g.restore();
}

/** Wears (id) or takes off (null) pieces. The screen updates at once; the server confirms. */
function applyLoadout(change: Partial<Record<Slot, string | null>>): void {
  const shop = session.data?.shop;
  if (!shop) return;
  const next = { ...shop.loadout } as Record<string, string>;
  for (const [slot, id] of Object.entries(change)) {
    if (id) next[slot] = id;
    else delete next[slot];
  }
  shop.loadout = next;
  if (router.top === 'styles') router.refresh();
  void session.setLoadout(change).then((saved) => {
    if (saved) return;
    // The server refused: show what it really has.
    void session.refreshShop().then(() => router.top === 'styles' && router.refresh());
  });
}

function setParts(setId: string): { slot: Slot; id: string }[] {
  const owned = new Set(session.data?.shop?.owned ?? []);
  const set = STYLE_SETS.find((s) => s.id === setId);
  if (!set) return [];
  return set.parts.filter((slot) => owned.has(`${setId}_${slot}`)).map((slot) => ({ slot, id: `${setId}_${slot}` }));
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
  if (stageOverride) return stageOverride.mask;
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
router.register('pets', {
  html: () => V.petsView(session.data?.shop ?? null, shopNew.pets),
  cls: 'solid',
  mount: (root) => requestAnimationFrame(() => drawPetIcons(root)),
});
router.register('decor', {
  html: () => V.decorView(session.data?.shop ?? null, decorTab, decorSelected, shopNew.decor),
  cls: 'solid',
  mount: (root) => {
    fitStage(root, '.decor-stage');
    requestAnimationFrame(() => drawDecorIcons(root));
  },
});
router.register('buyConfirm', {
  html: () => {
    const target = buyTarget ? session.data?.shop?.catalog.find((c) => c.id === buyTarget) : undefined;
    const label = target ? ru.decor.names[target.id] ?? ru.styles.parts[target.id] ?? ru.pets.names[target.id] ?? target.id : '';
    return target ? V.buyConfirmView(label, target.price ?? 0, session.data?.shop?.coins ?? 0, target) : '';
  },
  modal: true,
});
router.register('government', {
  html: () => V.governmentView(govCache, session.data?.profile.id ?? 0),
  cls: 'solid',
});
router.register('govCandidacy', { html: () => V.candidacyView(govCache), modal: true });
router.register('govManage', { html: () => V.govManageView(govCache), cls: 'solid' });
router.register('govFind', {
  html: () => V.govFindView(govFindTab, govFindList, govFindQuery),
  modal: true,
  mount: (root) => {
    const input = root.querySelector<HTMLInputElement>('#govSearch');
    let timer = 0;
    input?.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        govFindQuery = input.value.trim();
        void loadGovFind(false);
      }, 350);
    });
  },
});
router.register('notices', { html: () => V.noticesView(govNotices), cls: 'solid' });
router.register('reveal', {
  html: () => {
    const c = revealId ? session.data?.shop?.catalog.find((x) => x.id === revealId) : undefined;
    if (!c) return '';
    const name = ru.decor.names[c.id] ?? ru.styles.parts[c.id] ?? ru.pets.names[c.id] ?? c.id;
    const attr = c.kind === 'style' ? `data-style="${c.id}"` : c.kind === 'pet' ? `data-pet="${c.id}"` : `data-decor="${c.id}" data-kind="${c.kind}"`;
    const action = c.kind === 'style' ? ru.shop.wear : c.kind === 'prop' ? ru.shop.place : ru.shop.choose;
    return V.revealView(c, name, attr, action);
  },
  modal: true,
  mount: (root) =>
    requestAnimationFrame(() => {
      drawStyleIcons(root);
      drawDecorIcons(root);
      drawPetIcons(root);
    }),
});
router.register('styles', {
  html: () => V.stylesView(session.data?.shop ?? null, stylesTab, canPay(), !isIOS(), shopNew.styles),
  cls: 'solid',
  mount: (root) => requestAnimationFrame(() => drawStyleIcons(root)),
});
router.register('wardrobe', {
  html: () =>
    V.wardrobeView(session.data?.stats ?? localStats(), ownedMask(), {
      name: session.data?.profile.name ?? null,
      crown: hasCrown(),
    }),
  cls: 'solid',
  mount: (root) => requestAnimationFrame(() => drawCollection(root)),
});
router.register('menu', {
  html: () =>
    V.menuView({
      stats: session.data?.stats ?? localStats(),
      statsOpen,
      newDots: (() => {
        const u = unseenByArea();
        return { styles: u.styles.size > 0, decor: u.decor.size > 0, pets: u.pets.size > 0 };
      })(),
      gov: govStrip(),
      coins: session.mode === 'online' && session.data?.shop ? session.data.shop.coins : null,
      mode: session.mode,
    }),
  cls: 'menu-screen',
});
router.register('preparing', { html: () => V.preparingView(), cls: 'solid preparing' });
router.register('crownCard', { html: () => V.crownCardView(crownNotice), modal: true });
router.register('rulesCard', { html: () => V.rulesCardView(), modal: true });
router.register('settings', {
  html: () =>
    V.settingsView(settingsStore.get(), {
      vibration: hapticsSupported(),
      playerId: session.data?.profile.id ?? null,
      canDelete: session.mode === 'online',
      keys: { show: !isTouch, rebinding, error: keyError },
      hideLink: session.mode === 'online' && session.data ? !!session.data.privacy?.hide_vk_link : null,
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
    if (resultData?.record && resultData.score > 0) {
      root.querySelector('.panel.result')?.classList.add('is-record');
      window.setTimeout(celebrate, 900);
    }
  },
});
router.register('duels', {
  html: () =>
    V.duelsView({
      status: session.mode !== 'online' ? 'offline' : !duelClient.connected ? 'connecting' : duelUi,
      online: duelClient.online,
      waitingFor: duelWaitingFor,
      leadersHtml: duelLbHtml,
      coins: session.data?.shop?.coins ?? null,
      stake: duelStake(),
    }),
  cls: 'solid',
  mount: (root) => {
    if (session.mode === 'online') duelClient.connect();
    void loadDuelLeaders();
    // The icons of the reward card.
    requestAnimationFrame(() => {
      drawStyleIcons(root);
      drawPetIcons(root);
    });
  },
});
/** Watching a duel (spectator): the list of running duels and the two live copies. */
const spec = {
  list: null as SpecRow[] | null,
  match: null as { duel: string; a: LiveReplica; b: LiveReplica; ids: [number, number]; names: [string, string]; sized: boolean; ended: boolean } | null,
};
/** The live copies are created before the screen exists: put them onto the screen's canvases. */
function bindSpecCanvases(m: NonNullable<typeof spec.match>, ca: HTMLCanvasElement, cb: HTMLCanvasElement): void {
  for (const [r, c] of [[m.a, ca], [m.b, cb]] as [LiveReplica, HTMLCanvasElement][]) {
    r.attach(c);
    r.resize(Math.max(90, Math.floor(c.parentElement?.clientWidth ?? 160)));
    (r as unknown as { canvasEl: HTMLCanvasElement }).canvasEl = c;
  }
  m.sized = true;
}

router.register('specList', {
  html: () => V.specListView(spec.list),
  cls: 'solid',
});
router.register('spectate', {
  html: () => (spec.match ? V.spectateView(spec.match.names[0], spec.match.names[1]) : ''),
  cls: 'solid',
});
router.register('msgMenu', { html: () => (chat.menuMsg ? V.chatMsgMenuView(chat.menuMsg) : ''), modal: true });
router.register('chatWarn', {
  html: () => V.chatWarnView(chatWarn.removed, chatWarn.text),
  modal: true,
});
router.register('reportReason', { html: () => V.reportReasonView(), modal: true });
router.register('blockConfirm', {
  html: () => (chat.menuMsg ? V.blockConfirmView(chat.menuMsg.user.name || ru.leaders.player) : ''),
  modal: true,
});
router.register('blocked', { html: () => V.blockedView(chat.blocked), cls: 'solid' });
router.register('chatRules', { html: () => V.chatRulesView(), cls: 'solid' });
router.register('invite', {
  html: () => (invite ? V.inviteView(invite.from, invite.timeout, invite.stake) : ''),
  modal: true,
});
router.register('chat', {
  html: () => V.chatView(chat.blocked.length),
  cls: 'solid',
  mount: () => mountChat(),
});
router.register('player', {
  html: () => {
    const u = chat.known.get(chat.cardId);
    return u ? V.profileChoiceView({ id: u.id, name: u.name, photo: u.photo, link: u.link !== false, canDuel: true, mine: u.id === myId() }) : '';
  },
  modal: true,
});
router.register('profileChoice', {
  html: () => (profileWho ? V.profileChoiceView(profileWho) : ''),
  modal: true,
});
router.register('profile', {
  html: () => V.profileView(profileData, profileState),
  cls: 'solid',
  mount: (root) => fitStage(root, '.profile-stage'),
});
router.register('moreMenu', { html: () => V.moreMenuView(!!menuState.hero), modal: true });
router.register('coinsInfo', { html: () => V.coinsInfoView(session.data?.shop?.coins ?? 0, session.data?.tunables?.points_per_coin ?? 10), modal: true });
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
  syncChatRoom();
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
    duelLbHtml = { rows: V.leadersBoard(lb, session.data?.profile.id ?? null, true), me: V.leadersMe(lb) };
    if (router.top !== 'duels') return;
    list.innerHTML = duelLbHtml.rows;
    me.innerHTML = duelLbHtml.me;
    list.querySelectorAll<HTMLElement>('.stagger > *, .podium > *, .lb-rest .stagger > *').forEach((c, i) => c.style.setProperty('--i', String(i)));
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
    for (const r of lb.rows) lbKnown.set(r.user_id, r);
    if (router.top !== 'leaders' || scope !== lbScope) return;
    const offset = lb.server_time - Date.now();
    list.innerHTML = V.leadersBoard(lb, session.data?.profile.id ?? null, true);
    me.innerHTML = V.leadersMe(lb);
    reset.textContent = V.resetLine(lb, offset);
    list.querySelectorAll<HTMLElement>('.stagger > *, .podium > *').forEach((c, i) => c.style.setProperty('--i', String(i)));
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
  fullscreen: () => {
    void toggleFullscreen().then((ok) => {
      if (!ok && !fullscreenSupported()) toast(ru.menu.fullscreenNo, 3600);
    });
  },
  crownOk: () => {
    crownNotice = null;
    router.back();
    window.setTimeout(showCrownNotice, 350);
  },
  heroReset: () => {
    menuState.hero = null;
    menuState.save();
    toast(ru.menu.heroReset, 2000);
    router.back();
  },
  govApply: () => {
    void govApi.apply().then((res) => {
      if (govDone(res, ru.gov.applied)) {
        audio.play('unlock');
        router.back();
        router.refresh();
      }
    });
  },
  govVote: (id) => void govApi.vote(Number(id)).then((res) => govDone(res, ru.gov.voteDone)),
  govRespond: (arg) => void govApi.respond(arg === 'yes').then((res) => govDone(res)),
  govInvite: (id) => {
    void govApi.invite(Number(id)).then((res) => {
      if (govDone(res, ru.gov.invited) && router.top === 'govFind') router.back();
    });
  },
  govRemove: (id) => void govApi.remove(Number(id)).then((res) => govDone(res, ru.gov.removed)),
  govBonus: () => void govApi.settings({ bonus: !govCache?.settings.bonus_on }).then((res) => govDone(res)),
  govColor: (c) => void govApi.settings({ play_color: c }).then((res) => govDone(res)),
  govFindTab: (tab) => {
    govFindTab = tab === 'chat' || tab === 'rivals' ? tab : 'top';
    void loadGovFind(true);
  },
  open: (arg) => {
    if (arg === 'government' || arg === 'govCandidacy' || arg === 'govManage') void refreshGov();
    if (arg === 'govFind') {
      govFindTab = 'top';
      govFindQuery = '';
      void loadGovFind(true);
    }
    if (arg === 'notices') {
      govNotices = null;
      void loadNotices();
    }
    if (arg === 'styles' || arg === 'decor' || arg === 'pets') enterShopArea(arg);
    // A hold-and-drag of the hero ends with a click: it must not open the wardrobe.
    if (arg === 'wardrobe' && performance.now() - lastHeroDragEnd < 600) return;
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
  player: (arg) => {
    const id = Number(arg);
    if (!chat.known.has(id)) return;
    chat.cardId = id;
    router.open('player');
  },
  challenge: (arg) => {
    const have = session.data?.shop?.coins;
    if (have !== undefined && have < duelStake()) {
      router.back();
      toast(ru.duel.needCoins(duelStake(), have), 4200);
      return;
    }
    askNotificationsOnce();
    router.back();
    duelClient.send({ t: 'challenge', to: Number(arg) });
  },
  // ---- chat: complaint, block, unblock ----
  msgMenu: (arg) => {
    const m = chat.msgs.find((x) => x.id === Number(arg));
    if (!m) return;
    chat.menuMsg = m;
    router.open('msgMenu');
  },
  reportAsk: () => router.open('reportReason'),
  reportSend: (reason) => {
    const m = chat.menuMsg;
    if (!m) return;
    duelClient.send({ t: 'report', msg_id: m.id, reason });
    router.back();
    router.back();
  },
  blockAsk: () => router.open('blockConfirm'),
  blockDo: () => {
    const m = chat.menuMsg;
    if (!m) return;
    const name = m.user.name || ru.leaders.player;
    void session.blockPlayer(m.user.id).then((list) => {
      if (!list) {
        toast(ru.chat.blockFail, 3200);
        return;
      }
      chat.blocked = list;
      toast(ru.chat.blockDone(name), 2800);
      renderChatList();
      renderChatWho();
      const link = document.getElementById('blockedLink');
      if (link) link.textContent = ru.chat.blockedLink(list.length);
    });
    router.back();
    router.back();
  },
  unblock: (arg) => {
    void session.unblockPlayer(Number(arg)).then((list) => {
      if (!list) {
        toast(ru.chat.blockFail, 3200);
        return;
      }
      chat.blocked = list;
      toast(ru.chat.unblocked, 2400);
      if (router.top === 'blocked') router.refresh();
    });
  },
  petPick: (id) => {
    const pet = session.data?.shop?.decor?.pet;
    applyDecor({ pet: id === 'pet_none' || pet === id ? null : id });
    if (router.top === 'pets') router.refresh();
  },
  decorTab: (tab) => {
    decorTab = tab as V.DecorTab;
    router.refresh();
  },
  decorTurn: () => turnSelected(),
  decorRemove: () => removeSelected(),
  decorPick: (id) => {
    const decor = session.data?.shop?.decor ?? {};
    if (id === 'frame_none') applyDecor({ frame: null });
    else if (id === 'fx_none') applyDecor({ fx: null });
    else if (id.startsWith('bg_')) applyDecor({ bg: id === 'bg_default' || decor.bg === id ? null : id });
    else if (id.startsWith('frame_')) applyDecor({ frame: decor.frame === id ? null : id });
    else if (id.startsWith('fx_')) applyDecor({ fx: decor.fx === id ? null : id });
    else if (id.startsWith('prop_')) placeProp(id);
  },
  askBuy: (id) => {
    buyTarget = id;
    router.open('buyConfirm');
  },
  // The button of the "new thing" card: wear it, choose it or put it on the stage.
  revealUse: () => {
    const id = revealId;
    router.back();
    if (!id) return;
    const kind = session.data?.shop?.catalog.find((c) => c.id === id)?.kind;
    if (kind === 'style') actions.wearStyle?.(id, document.body);
    else if (kind === 'pet') actions.petPick?.(id, document.body);
    else actions.decorPick?.(id, document.body);
  },
  confirmBuy: () => {
    const id = buyTarget;
    if (!id) return;
    void session.buy(id).then((res) => {
      router.back();
      if (res.ok) {
        audio.play('unlock');
        // The card of the new thing opens (it counts as seen: the player has just looked at it).
        markSeen([id]);
        revealId = id;
        router.open('reveal');
      } else toast(res.code === 'not_enough_coins' ? ru.decor.notEnough : ru.decor.failed, 2200);
      if (router.top === 'decor' || router.top === 'styles') router.refresh();
    });
  },
  stylesTab: (tab) => {
    stylesTab = tab === 'premium' ? 'premium' : tab === 'gov' ? 'gov' : 'mine';
    router.refresh();
  },
  openPremium: () => {
    if (isIOS()) {
      toast(ru.premium.notHere, 3200);
      return;
    }
    stylesTab = 'premium';
    router.open('styles');
  },
  buyPremium: (id) => void buyPremium(id),
  wearStyle: (id) => {
    const shop = session.data?.shop;
    const slot = STYLES[id]?.slot;
    if (!shop || !slot) return;
    applyLoadout({ [slot]: shop.loadout[slot] === id ? null : id });
  },
  takeOff: (slot) => applyLoadout({ [slot as Slot]: null }),
  wearSet: (setId) => {
    const change: Partial<Record<Slot, string | null>> = {};
    for (const p of setParts(setId)) change[p.slot] = p.id;
    applyLoadout(change);
  },
  takeOffSet: (setId) => {
    const change: Partial<Record<Slot, string | null>> = {};
    for (const p of setParts(setId)) if (session.data?.shop?.loadout[p.slot] === p.id) change[p.slot] = null;
    applyLoadout(change);
  },
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
  // Tap on a player in a rating: the game profile or the VK page.
  profile: (arg) => {
    const id = Number(arg);
    const row = lbKnown.get(id);
    if (!row) return;
    profileWho = { id, name: row.name, photo: row.photo, link: row.link !== false, canDuel: false, mine: id === myId() };
    router.open('profileChoice');
  },
  openVkProfile: (arg) => {
    if (/^\d+$/.test(arg)) window.open(`${PROFILE_URL}${arg}`, '_blank', 'noopener');
  },
  openGameProfile: (arg) => {
    const id = Number(arg);
    if (!Number.isFinite(id)) return;
    router.back();
    void showGameProfile(id);
  },
  profileRetry: () => {
    if (profileId) void showGameProfile(profileId);
  },
  toggleStats: () => {
    statsOpen = !statsOpen;
    const box = document.getElementById('statsBox');
    box?.classList.toggle('open', statsOpen);
    box?.querySelector('.stats-toggle')?.setAttribute('aria-expanded', String(statsOpen));
  },
  openFromMore: (arg) => {
    if (arg === 'styles' || arg === 'decor' || arg === 'pets') enterShopArea(arg);
    router.back();
    setTimeout(() => router.open(arg), 60);
  },
  support: () => {
    if (SUPPORT_URL) window.open(SUPPORT_URL, '_blank', 'noopener');
  },
  acceptConsent: () => void acceptConsent(),
  duelFind: () => {
    const have = session.data?.shop?.coins;
    if (have !== undefined && have < duelStake()) {
      toast(ru.duel.needCoins(duelStake(), have), 4200);
      router.refresh();
      return;
    }
    askNotificationsOnce();
    duelUi = 'waiting';
    duelWaitingFor = null;
    duelClient.send({ t: 'find' });
    router.refresh();
  },
  // The list is asked for when the screen opens and on "refresh" (not on every redraw).
  specOpen: () => {
    spec.list = null;
    router.open('specList');
    duelClient.send({ t: 'spec_list' });
  },
  specRefresh: () => duelClient.send({ t: 'spec_list' }),
  specJoin: (id) => duelClient.send({ t: 'spec_join', duel: id }),
  specLeave: () => {
    duelClient.send({ t: 'spec_leave' });
    spec.match = null;
    router.back();
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
// The privacy switch is saved on the server, not with the other settings.
document.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset?.privacy !== 'hideVk') return;
  const want = el.checked;
  void session.setHideLink(want).then((saved) => {
    if (saved === null) el.checked = !want;
  });
});

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
  crownQueue.push(...(session.data?.crown?.notices ?? []));
  crownCheckedAt = Date.now();
  if (!hasConsent()) router.reset('consent');
  else goMenu();
}

// ---------- Chat ----------

/** The stake of a duel in coins (the server decides and checks it; this is for the texts). */
function duelStake(): number {
  return session.data?.tunables?.duel_stake ?? 500;
}

/** What the "somebody complained about your message" window shows. */
const chatWarn = { removed: false, text: '' };

const chat = {
  blocked: [] as BlockedPlayer[],
  /** The message whose menu is open (complaint / block). */
  menuMsg: null as ChatMsg | null,
  msgs: [] as ChatMsg[],
  online: [] as ChatUser[],
  known: new Map<number, ChatUser>(),
  cardId: 0,
  cdUntil: 0,
  wanted: false,
  joined: false,
  lastText: '',
  statusTimer: 0,
};

function myId(): number | null {
  return session.data?.profile.id ?? null;
}

function remember(u: ChatUser): void {
  chat.known.set(u.id, u);
}

/** Joins the chat room while the chat screen is open (also over the player card), leaves otherwise. */
function syncChatRoom(): void {
  const want = router.has('chat');
  if (want && !chat.wanted) {
    chat.wanted = true;
    tryJoinChat();
  } else if (!want && chat.wanted) {
    chat.wanted = false;
    if (chat.joined) duelClient.send({ t: 'chat_leave' });
    chat.joined = false;
  }
}

function tryJoinChat(): void {
  if (chat.wanted && !chat.joined && duelClient.connected) {
    chat.joined = true;
    duelClient.send({ t: 'chat_join' });
  }
}

function chatStatus(text: string, ms = 4000): void {
  const el = document.getElementById('chatStatus');
  if (!el) return;
  el.textContent = text;
  clearTimeout(chat.statusTimer);
  if (text && ms > 0) chat.statusTimer = window.setTimeout(() => (el.textContent = ''), ms);
}

function renderChatWho(): void {
  const who = document.getElementById('chatWho');
  const count = document.getElementById('chatCount');
  const online = chat.online.filter((u) => !isBlocked(u.id));
  if (who) who.innerHTML = V.chatWhoHtml(online);
  if (count) count.textContent = ru.chat.online(online.length);
  who?.querySelectorAll<HTMLImageElement>('img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
}

function isBlocked(userId: number): boolean {
  return chat.blocked.some((b) => b.id === userId);
}

function chatRowHtml(m: ChatMsg): string {
  return V.chatMsgHtml(m, myId());
}

/** The messages the player wants to see (those of blocked players are left out). */
function visibleMsgs(): ChatMsg[] {
  return chat.msgs.filter((m) => m.sys || !isBlocked(m.user.id));
}

function renderChatList(): void {
  const list = document.getElementById('chatList');
  if (!list) return;
  const shown = visibleMsgs();
  list.innerHTML = shown.length ? shown.map(chatRowHtml).join('') : `<div class="empty"><p>${ru.chat.empty}</p></div>`;
  list.scrollTop = list.scrollHeight;
}

function appendChat(m: ChatMsg): void {
  chat.msgs.push(m);
  if (chat.msgs.length > 100) chat.msgs.shift();
  if (!m.sys && isBlocked(m.user.id)) return;
  const list = document.getElementById('chatList');
  if (!list) return;
  const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  if (list.querySelector('.empty')) list.innerHTML = '';
  list.insertAdjacentHTML('beforeend', chatRowHtml(m));
  while (list.children.length > 100) list.firstElementChild?.remove();
  if (stick || m.user.id === myId()) list.scrollTop = list.scrollHeight;
}

function updateChatSend(): void {
  const btn = document.getElementById('chatSend') as HTMLButtonElement | null;
  if (!btn) return;
  const left = Math.ceil((chat.cdUntil - Date.now()) / 1000);
  btn.disabled = left > 0 || !chat.joined;
  btn.textContent = left > 0 ? ru.chat.wait(left) : ru.chat.send;
}

function mountChat(): void {
  const form = document.getElementById('chatForm') as HTMLFormElement | null;
  const input = document.getElementById('chatInput') as HTMLInputElement | null;
  if (!form || !input) return;
  renderChatList();
  renderChatWho();
  // The list of blocked players: from the server, so it follows the account.
  if (session.mode === 'online') {
    void session.fetchBlocks().then((list) => {
      if (!list) return;
      chat.blocked = list;
      renderChatList();
      renderChatWho();
      const link = document.getElementById('blockedLink');
      if (link) link.textContent = ru.chat.blockedLink(list.length);
    });
  }
  if (session.mode !== 'online') chatStatus(ru.chat.offline, 0);
  else if (!duelClient.connected) chatStatus(ru.chat.connecting, 0);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (!chat.joined) return chatStatus(ru.chat.connecting, 4000);
    const left = Math.ceil((chat.cdUntil - Date.now()) / 1000);
    if (left > 0) return chatStatus(ru.chat.errWait(left));
    chat.lastText = text;
    duelClient.send({ t: 'chat', text });
    input.value = '';
  });
  const tick = window.setInterval(() => {
    if (!document.getElementById('chatSend')) return clearInterval(tick);
    updateChatSend();
  }, 400);
  updateChatSend();
}

function onChatMessage(m: DuelMsg): void {
  switch (m.t) {
    case 'chat_hist':
      chat.msgs = m.msgs;
      chat.online = m.users;
      for (const x of m.msgs) remember(x.user);
      for (const u of m.users) remember(u);
      chat.cdUntil = Date.now() + m.wait * 1000;
      chatStatus('');
      renderChatList();
      renderChatWho();
      updateChatSend();
      break;
    case 'chat':
      remember(m.msg.user);
      appendChat(m.msg);
      break;
    case 'chat_users':
      chat.online = m.users;
      for (const u of m.users) remember(u);
      renderChatWho();
      break;
    case 'chat_user':
      remember(m.user);
      if (m.user.id !== myId()) {
        appendChat({ id: -Date.now(), ts: Date.now(), user: m.user, text: ru.chat.joined(m.user.name || ru.leaders.player, m.user.rank), sys: true });
      }
      break;
    case 'chat_cd':
      chat.cdUntil = Date.now() + m.wait * 1000;
      updateChatSend();
      break;
    case 'chat_remove':
      chat.msgs = chat.msgs.filter((x) => x.id !== m.id);
      renderChatList();
      break;
    case 'report_ok':
      toast(ru.chat.reportSent, 2600);
      break;
    case 'chat_notice': {
      // The government in the chat: arrivals and departures of the mayor and his assistants, appointments.
      const name = m.user.name || ru.leaders.player;
      const f = ru.gov.chat as Record<string, (n: string) => string>;
      const text = f[m.kind]?.(name);
      if (text) {
        appendChat({ id: -Date.now(), ts: Date.now(), user: m.user, text, sys: true });
      }
      if (m.kind === 'mayor_in') celebrate();
      else if (m.kind === 'mayor_out') audio.play('crowd');
      break;
    }
    case 'chat_warned':
      // Somebody complained about this player's message. In a run only a toast, never a window.
      if (mode === 'run' || mode === 'tutorial') {
        toast(m.removed ? ru.chat.warnRemovedTitle : ru.chat.warnTitle, 3200);
        break;
      }
      chatWarn.removed = m.removed;
      chatWarn.text = m.text;
      router.open('chatWarn');
      break;
    case 'report_err':
      toast(m.code === 'gone' ? ru.chat.reportGone : m.code === 'too_many' ? ru.chat.reportMany : ru.chat.reportFail, 3200);
      break;
    case 'chat_err': {
      const input = document.getElementById('chatInput') as HTMLInputElement | null;
      if (input && !input.value) input.value = chat.lastText;
      if (m.code === 'cooldown') {
        chat.cdUntil = Date.now() + (m.wait ?? 30) * 1000;
        chatStatus(ru.chat.errWait(m.wait ?? 30));
      } else if (m.code === 'muted') {
        chatStatus(ru.chat.errMuted(Math.max(1, Math.ceil((m.wait ?? 3600) / 60))), 8000);
      } else chatStatus(m.code === 'words' ? ru.chat.errWords : m.code === 'link' ? ru.chat.errLink : ru.chat.errEmpty, 5000);
      updateChatSend();
      break;
    }
    case 'busy':
      chatStatus(m.who === 'me' ? ru.chat.busyMe : ru.chat.busyThem, 5000);
      break;
    case 'stake_short':
      // Not enough coins for the stake: ours (a duel cannot start) or the other player's.
      duelUi = 'idle';
      toast(m.who === 'me' ? ru.duel.needCoins(m.need, m.have) : ru.duel.themShort(m.name || ru.duel.player), 4200);
      if (router.top === 'duels') router.refresh();
      break;
  }
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
let invite: { from: DuelPlayer; timeout: number; stake: number } | null = null;
const oppCanvas = $<HTMLCanvasElement>('opp');
const oppName = $('oppName');
const duelMeEl = $('duelMe');
const duelOppEl = $('duelOpp');
const duelOppNameEl = $('duelOppName');
const duelBarEl = $('duelBar');

duelClient.onStatus = () => {
  if (!duelClient.connected) chat.joined = false;
  else tryJoinChat();
  if (router.top === 'duels') router.refresh();
  if (router.has('chat') && !duelClient.connected && session.mode === 'online') {
    const c = duelClient.lastClose;
    chatStatus(c ? ru.chat.noLink(c.opened ? String(c.code) : `нет соединения, ${c.code}`) : ru.chat.connecting, 0);
  }
};

duelClient.onMessage = (m: DuelMsg) => {
  onChatMessage(m);
  switch (m.t) {
    case 'none':
      duelUi = 'none';
      break;
    case 'waiting':
      duelUi = 'waiting';
      duelWaitingFor = m.to.name;
      if (router.has('chat')) chatStatus(ru.chat.challengeSent(m.to.name || ru.duel.player), 0);
      break;
    case 'declined':
      duelUi = 'declined';
      if (router.has('chat')) chatStatus(ru.chat.declined, 5000);
      break;
    case 'invite':
      // Only offered while not playing; the invite card opens over any menu screen.
      if (mode === 'run' || mode === 'tutorial') {
        duelClient.send({ t: 'decline' });
        return;
      }
      invite = { from: m.from, timeout: m.timeout, stake: m.stake ?? duelStake() };
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
      showDuelOutcome(m.outcome, m.coins);
      break;
    case 'spec_list':
      spec.list = m.duels;
      if (router.top === 'specList') router.refresh();
      break;
    case 'spec_err':
      toast(ru.spec.unavailable, 3000);
      if (router.top === 'specList') duelClient.send({ t: 'spec_list' });
      break;
    case 'spec_start': {
      // Both runs are played again from the seed; the inputs sent so far catch them up.
      const start = Date.now() - m.elapsed_ms;
      const [pa, pb] = m.players;
      const mk = (id: string, p: DuelPlayer): LiveReplica => {
        const r = new LiveReplica(document.createElement('canvas'), m.seed, start, p.look);
        r.push((m.logs[String(p.id)] ?? []) as never);
        const sc = m.scores[String(p.id)];
        if (typeof sc === 'number') r.finalScore = sc;
        void id;
        return r;
      };
      spec.match = {
        duel: m.duel,
        a: mk('a', pa),
        b: mk('b', pb),
        ids: [pa.id, pb.id],
        names: [pa.name || ru.duel.player, pb.name || ru.duel.player],
        sized: false,
        ended: false,
      };
      router.open('spectate');
      break;
    }
    case 'spec_inputs': {
      const s = spec.match;
      if (!s || s.duel !== m.duel) break;
      (m.uid === s.ids[0] ? s.a : s.b).push(m.log as never);
      break;
    }
    case 'spec_dead': {
      const s = spec.match;
      if (!s || s.duel !== m.duel) break;
      (m.uid === s.ids[0] ? s.a : s.b).finalScore = m.score;
      break;
    }
    case 'spec_end': {
      const s = spec.match;
      if (!s || s.duel !== m.duel) break;
      s.ended = true;
      const [ia, ib] = s.ids;
      const ra = m.outcome[String(ia)];
      const rb = m.outcome[String(ib)];
      const res = document.getElementById('specResult');
      if (res) res.textContent = `${ru.spec.ended}: ${ra === 'win' ? `${s.names[0]} ${ru.spec.won}` : rb === 'win' ? `${s.names[1]} ${ru.spec.won}` : ru.spec.draw}`;
      break;
    }
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
  // The opponent looks the way he does on his own main screen: his styles and his pet.
  oppRenderer.styles = (m.opponent.look?.loadout ?? {}) as StyleLoadout;
  oppRenderer.pet = PET_IDS[m.opponent.look?.pet ?? ''] ?? null;
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
  // The bar is visible now, so the canvas has a size to draw into.
  requestAnimationFrame(() => drawOppLook(m.opponent.look?.loadout ?? {}, m.opponent.look?.pet ?? null));
  newSim(m.seed, false, true);
  sizeOpp();
  // Both start at the same moment (server time + countdown).
  const wait = Math.max(1200, m.start_at - Date.now());
  await new Promise((r) => setTimeout(r, wait));
  mode = 'run';
  router.clear();
  session.event('run_start');
}

/** A small portrait of the opponent in the score bar: his styles and his pet. */
function drawOppLook(loadout: Record<string, string>, pet: string | null): void {
  const c = document.getElementById('duelOppLook') as HTMLCanvasElement | null;
  const g = c ? sizeCanvas(c) : null;
  if (!c || !g) return;
  const w = c.clientWidth;
  const h = c.clientHeight;
  g.clearRect(0, 0, w, h);
  // The upper body of the front hero fills the little frame.
  g.save();
  g.translate(w * 0.42, h + 19 * (h / 46));
  g.scale(h / 46, h / 46);
  drawHeroFront(g, outfitFromMask(0), 1, 'hips', 'normal', loadout as StyleLoadout);
  g.restore();
  const kind = PET_IDS[pet ?? ''];
  if (kind) {
    g.save();
    g.translate(w * 0.84, h - 1);
    g.scale(h / 34, h / 34);
    drawPet(g, kind, { t: 1.1, mode: kind === 'parrot' ? 'perch' : 'sit', phase: 0 });
    g.restore();
  }
}

function sizeOpp(): void {
  if (!duel) return;
  const wide = document.body.classList.contains('wide');
  const boardW = board.clientWidth;
  const w = wide ? Math.min(260, Math.max(160, (window.innerWidth - boardW) / 2 - 60)) : Math.round(boardW * 0.24);
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

function showDuelOutcome(outcome: 'win' | 'loss' | 'draw', coins = 0): void {
  duelOutcome = outcome;
  document.getElementById('duelScore')?.classList.add(outcome);
  const stakeText = coins > 0 ? ` ${ru.duel.coinsWon(coins)}` : coins < 0 ? ` ${ru.duel.coinsLost(-coins)}` : '';
  setDuelLine((outcome === 'win' ? ru.duel.win : outcome === 'loss' ? ru.duel.loss : ru.duel.draw) + stakeText);
  // The stake moved coins: show the new balance.
  void session.refreshShop();
  if (outcome === 'win') audio.play('fanfare');
  if (session.data && outcome === 'win') session.data.stats.duel_wins = (session.data.stats.duel_wins ?? 0) + 1;
  if (outcome === 'win') {
    // A win streak may have opened cosmetics: ask the server what is new.
    const before = new Set(session.data?.shop?.owned ?? []);
    void session.refreshShop().then((shop) => {
      const fresh = (shop?.owned ?? []).filter((id) => !before.has(id));
      if (fresh.length) toast(ru.styles.newStyles(fresh.map((id) => ru.styles.parts[id] ?? id).join(', ')), 3600);
    });
  }
}

// ---------- Main loop ----------

let deviceSent = false;

/** Speed readout in a corner: open the game with ?perf=1 to see it (for testing on a phone). */
let perfBox: HTMLElement | null = null;
let perfShownAt = 0;
function perfOverlay(now: number): void {
  if (!new URLSearchParams(location.search).has('perf')) return;
  if (!perfBox) {
    perfBox = document.createElement('div');
    perfBox.style.cssText = 'position:fixed;left:4px;top:4px;z-index:99;padding:4px 7px;border-radius:6px;background:rgba(0,0,0,.65);color:#9fff9f;font:11px/1.3 monospace;pointer-events:none;white-space:pre';
    document.body.appendChild(perfBox);
  }
  if (now - perfShownAt < 500) return;
  perfShownAt = now;
  const r = perf.report(false);
  perfBox.textContent = `${r.fps} fps  p95 ${r.p95} ms\nкачество ${perf.effective}  dpr ${Math.min(2, window.devicePixelRatio || 1)}\nпамять ${navigator.deviceMemory ?? '?'} ГБ  ядра ${navigator.hardwareConcurrency ?? '?'}`;
}

function frame(now: number): void {
  const realDt = Math.min((now - last) / 1000, gameConfig.sim.maxFrameSec);
  perf.record(now - last);
  perfOverlay(now);
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
  if (router.top === 'styles') {
    if (stylesTab === 'premium') drawPremiumPreviews(now / 1000);
    else drawStylesPreview(now / 1000);
  }
  if (router.top === 'decor') {
    const dc = document.getElementById('decorHero') as HTMLCanvasElement | null;
    if (dc) drawStageHero(dc, lastTier(), now / 1000);
  }
  if (router.top === 'spectate' && spec.match) {
    const m = spec.match;
    const ca = document.getElementById('specA') as HTMLCanvasElement | null;
    const cb = document.getElementById('specB') as HTMLCanvasElement | null;
    if (ca && cb) {
      // The live copies draw into the canvases of this screen (the placeholders are replaced once).
      if (!m.sized || (m.a as unknown as { canvasEl?: HTMLCanvasElement }).canvasEl !== ca) bindSpecCanvases(m, ca, cb);
      m.a.update();
      m.b.update();
      m.a.draw();
      m.b.draw();
      const sa = document.getElementById('specAScore');
      const sb = document.getElementById('specBScore');
      if (sa) sa.textContent = String(m.a.score);
      if (sb) sb.textContent = String(m.b.score);
      document.getElementById('specAOut')?.classList.toggle('hidden', !m.a.dead);
      document.getElementById('specBOut')?.classList.toggle('hidden', !m.b.dead);
    }
  }
  if (router.top === 'buyConfirm') drawBuyPreview(now / 1000);
  if (router.top === 'government') drawGovThrone(now / 1000);
  if (router.top === 'pets') {
    const pc = document.getElementById('petsHero') as HTMLCanvasElement | null;
    if (pc) drawStageHero(pc, lastTier(), now / 1000);
  }
  if (router.top === 'profile' && profileData) {
    const hc = document.getElementById('profileHero') as HTMLCanvasElement | null;
    if (hc) {
      stageOverride = { decor: profileData.decor, loadout: profileData.loadout as StyleLoadout, mask: profileData.items_mask, crown: profileData.crown, role: profileData.role ?? null };
      drawStageHero(hc, profileData.stats.last_tier, now / 1000);
      stageOverride = null;
    }
  }
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
  onRestore: () => {
    audio.resume();
    // Coming back from an ad or from another app: steering and the field size are renewed.
    input.reset();
    layout();
  },
});
layout();
requestAnimationFrame(frame);
void boot();
