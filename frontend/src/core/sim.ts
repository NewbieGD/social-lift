import {
  comboMultiplier,
  gameConfig,
  isColorUnlocked,
  tierForScore,
  type ColorId,
  type LightId,
} from './gameConfig';
import { Generator } from './generator';
import { Rng } from './prng';
import type { DeathReason, Hero, Platform, SimEvent, SimInput } from './types';

export const DT = 1 / gameConfig.sim.hz;

const START_Y = 120;
const TUTORIAL_WARN_SEC = 1.2;
const TUTORIAL_RED_SEC = 4;

/** Compact input record: [tick, axis * 8 rounded, press code]. */
export type InputRecord = [number, number, number];
const PRESS_CODES: (LightId | null)[] = [null, 'yellow', 'blue', 'green', 'red'];

export class Sim {
  readonly seed: number;
  tick = 0;
  time = 0;
  runStarted = false;
  runStartTime = 0;

  hero: Hero;
  light: LightId | null = null;
  platforms: Platform[] = [];

  score = 0;
  captures = 0;
  tier = 0;
  streak = 0;
  maxCombo = 0;
  lastCaptureTime = -999;

  waveY: number;
  waveActive = false;
  camY = 0;
  prevCamY = 0;
  viewH: number;

  dead = false;
  deathReason: DeathReason | null = null;

  events: SimEvent[] = [];
  inputLog: InputRecord[] = [];
  private lastAxisQ = 0;

  private gen: Generator;
  private phaseRng: Rng;
  private itemRng: Rng;

  /** Items worn in this run (bit = tier of the item). Every run starts from zero. */
  owned = 0;
  /** Items picked up in this run (same as owned; kept for the report). */
  picked = 0;
  private itemsEnabled: boolean;
  /** Items waiting for a platform ahead to be placed on. */
  private pendingItems: number[] = [];

  /** Guided tutorial: no wave, no random hazards, red phases only when forced. */
  readonly tutorial: boolean;

  constructor(
    seed: number,
    viewH: number,
    opts: { tutorial?: boolean; items?: boolean } = {},
  ) {
    this.seed = seed >>> 0;
    this.tutorial = !!opts.tutorial;
    this.itemsEnabled = !!opts.items && !this.tutorial;
    this.itemRng = new Rng(this.seed ^ 0x5bd1e995);
    this.viewH = viewH;
    const W = gameConfig.world.width;
    const genRng = new Rng(this.seed);
    this.phaseRng = new Rng(this.seed ^ 0x9e3779b9);
    this.gen = new Generator(genRng, W / 2, START_Y);
    this.gen.noHazards = this.tutorial;
    this.platforms.push(this.gen.makeStart(W / 2, START_Y));
    this.hero = {
      x: W / 2,
      y: START_Y,
      vx: 0,
      vy: gameConfig.hero.jumpImpulse,
      prevX: W / 2,
      prevY: START_Y,
      sinceLand: 0,
      facing: 1,
      spin: 0,
    };
    this.waveY = START_Y - gameConfig.wave.startBelow;
    this.camY = 0;
    this.prevCamY = 0;
    this.fillPlatforms();
  }

  get runTime(): number {
    return this.runStarted ? this.time - this.runStartTime : 0;
  }

  /** Collection bonus to the score multiplier, e.g. 1.2 with 4 items. */
  get itemBonus(): number {
    let n = 0;
    for (let i = 0; i < gameConfig.items.count; i++) if (this.owned & (1 << i)) n++;
    return 1 + n * gameConfig.items.bonusPerItem;
  }

  get multiplier(): number {
    return comboMultiplier(this.streak);
  }

  setViewHeight(h: number): void {
    this.viewH = h;
  }

  step(input: SimInput): void {
    this.events.length = 0;
    this.recordInput(input);
    const hero = this.hero;
    hero.prevX = hero.x;
    hero.prevY = hero.y;
    this.prevCamY = this.camY;

    if (this.dead) {
      // Only the falling corpse moves after death.
      hero.vy -= gameConfig.hero.gravity * DT;
      hero.y += hero.vy * DT;
      hero.x += hero.vx * DT;
      hero.spin += DT * 9 * hero.facing;
      this.time += DT;
      this.tick++;
      return;
    }

    this.applyPress(input.press);
    // Axis is quantized exactly as recorded, so the input log replays the run bit for bit.
    this.moveHero(Math.round(input.axis * 8) / 8);
    this.updatePlatforms();
    this.checkLanding();
    this.updateCombo();
    this.updateCamera();
    this.updateWave();
    this.checkDeath();
    this.fillPlatforms();
    this.placeItem();
    this.cullPlatforms();

    this.time += DT;
    this.tick++;
  }

  private recordInput(input: SimInput): void {
    const q = Math.round(input.axis * 8);
    const code = PRESS_CODES.indexOf(input.press);
    if (q !== this.lastAxisQ || code > 0) {
      if (this.inputLog.length < 20000) this.inputLog.push([this.tick, q, code]);
      this.lastAxisQ = q;
    }
  }

  private applyPress(press: LightId | null): void {
    if (!press || press === this.light) return;
    if (press !== 'red' && !isColorUnlocked(press as ColorId, this.tier)) return;
    this.light = press;
    if (press === 'red' && this.streak > 0) {
      this.streak = 0;
      this.events.push({ type: 'comboReset' });
    }
    this.events.push({ type: 'light', light: press });
  }

  private moveHero(axis: number): void {
    const h = this.hero;
    const cfg = gameConfig.hero;
    const target = Math.max(-1, Math.min(1, axis)) * cfg.maxSpeedX;
    const dv = target - h.vx;
    const maxDv = cfg.accelX * DT;
    h.vx += Math.max(-maxDv, Math.min(maxDv, dv));
    if (Math.abs(axis) > 0.1) h.facing = axis > 0 ? 1 : -1;

    h.x += h.vx * DT;
    // Soft walls: the hero bounces back off the side buildings.
    const half = cfg.width / 2;
    const W = gameConfig.world.width;
    const lo = gameConfig.world.margin + half * 0.6;
    const hi = W - gameConfig.world.margin - half * 0.6;
    if (h.x < lo || h.x > hi) {
      const side = h.x < lo ? -1 : 1;
      h.x = side < 0 ? lo : hi;
      if (Math.abs(h.vx) > 60) this.events.push({ type: 'wall', x: h.x, y: h.y, side });
      h.vx = -h.vx * gameConfig.wall.bounce;
    }
    h.vy -= cfg.gravity * DT;
    h.y += h.vy * DT;
    h.sinceLand += DT;
  }

  private updatePlatforms(): void {
    for (const p of this.platforms) {
      if (p.kind === 'white') {
        p.whiteT -= DT;
        p.whiteAge += DT;
      }
      if (!p.phases) continue;
      p.phaseT -= DT;
      if (p.phaseT > 0) continue;
      const t = gameConfig.tiers[this.tier];
      if (p.phase === 'normal') {
        // A red phase is always preceded by a full warning.
        p.phase = 'warn';
        p.phaseLen = p.phaseT = Math.max(0.4, t.telegraphSec);
        this.events.push({ type: 'warn', id: p.id });
      } else if (p.phase === 'warn') {
        p.phase = 'red';
        p.phaseLen = p.phaseT = this.tutorial ? TUTORIAL_RED_SEC : this.phaseRng.range(t.redSec[0], t.redSec[1]);
      } else {
        p.phase = 'normal';
        p.phaseLen = p.phaseT = this.phaseRng.range(t.phaseInterval[0], t.phaseInterval[1]);
        if (this.tutorial) p.phases = false;
      }
    }
  }

  private checkLanding(): void {
    const h = this.hero;
    if (h.vy > 0) return;
    const foot = gameConfig.hero.footHalf;
    const half = gameConfig.platform.width / 2;
    let best: Platform | null = null;
    for (const p of this.platforms) {
      if (h.prevY < p.y || h.y > p.y) continue;
      if (h.x + foot < p.x - half || h.x - foot > p.x + half) continue;
      if (!best || p.y > best.y) best = p;
    }
    if (!best) return;

    h.y = best.y;
    h.vy = gameConfig.hero.jumpImpulse;
    h.sinceLand = 0;
    this.events.push({ type: 'land', x: h.x, y: best.y, id: best.id });

    if (best.kind !== 'start' && !this.runStarted) {
      this.runStarted = true;
      this.runStartTime = this.time;
      this.events.push({ type: 'runStart' });
      this.rollItem(0);
    }
    if (best.item >= 0) {
      // Touching the platform collects the item lying on it.
      const item = best.item;
      best.item = -1;
      this.owned |= 1 << item;
      this.picked |= 1 << item;
      this.events.push({ type: 'pickup', item, x: best.x, y: best.y });
    }
    this.evaluateLanding(best);
  }

  /** Landing table from the design doc, section 3. */
  private evaluateLanding(p: Platform): void {
    const lethal = p.kind === 'red' || p.phase === 'red';
    if (lethal) {
      if (this.light === 'red') {
        this.events.push({ type: 'aura', x: this.hero.x, y: p.y });
      } else {
        this.die('red');
      }
      return;
    }
    if (p.kind === 'color' && p.color && this.light === p.color) {
      this.capture(p, p.color);
    }
    // Landed just before the platform turned red: a "close call".
    if (p.phase === 'warn' && p.phaseT < 0.25) this.events.push({ type: 'close', x: p.x, y: p.y });
  }

  private capture(p: Platform, color: ColorId): void {
    const withinWindow = this.time - this.lastCaptureTime <= gameConfig.combo.windowSec;
    this.streak = this.streak > 0 && withinWindow ? this.streak + 1 : 1;
    this.maxCombo = Math.max(this.maxCombo, this.streak);
    this.lastCaptureTime = this.time;
    const mult = comboMultiplier(this.streak);
    const points = Math.round(gameConfig.colors[color].points * mult * this.itemBonus);
    this.score += points;
    this.captures++;

    p.kind = 'white';
    p.whiteT = gameConfig.tiers[this.tier].whiteLifetime;
    p.whiteAge = 0;
    this.events.push({ type: 'capture', x: p.x, y: p.y, points, mult, color });

    const newTier = tierForScore(this.score);
    if (newTier > this.tier) {
      for (const c of ['yellow', 'blue', 'green'] as ColorId[]) {
        if (!isColorUnlocked(c, this.tier) && isColorUnlocked(c, newTier)) {
          this.events.push({ type: 'unlock', color: c });
        }
      }
      this.tier = newTier;
      this.events.push({ type: 'tier', tier: newTier });
      this.rollItem(newTier);
    }
  }

  /**
   * Entering a tier may put that tier's item somewhere ahead. A piece that was missed
   * earlier in this run (not rolled or not caught in time) may come back on a later tier.
   * Same rules for every player: the run starts with nothing worn.
   */
  private rollItem(tier: number): void {
    if (!this.itemsEnabled) return;
    const cfg = gameConfig.items;
    const free = (i: number): boolean =>
      !(this.owned & (1 << i)) && !this.pendingItems.includes(i) && !this.platforms.some((p) => p.item === i);
    if (tier < cfg.count && free(tier) && this.itemRng.next() < cfg.chance) {
      this.pendingItems.push(tier);
      this.events.push({ type: 'itemSpawn', item: tier });
    }
    for (let i = 0; i < Math.min(tier, cfg.count); i++) {
      if (!free(i)) continue;
      if (this.itemRng.next() < cfg.laterChance) {
        this.pendingItems.push(i);
        this.events.push({ type: 'itemSpawn', item: i });
      }
      break; // at most one second chance per tier
    }
  }

  /** Puts the next pending item on a calm colored platform just above the screen. */
  private placeItem(): void {
    if (!this.pendingItems.length || this.platforms.some((p) => p.item >= 0)) return;
    const lo = this.camY + this.viewH * 0.8;
    const hi = this.camY + this.viewH + 160;
    let best: Platform | null = null;
    for (const p of this.platforms) {
      if (p.kind !== 'color' || p.phases || p.y < lo || p.y > hi) continue;
      if (!best || p.y < best.y) best = p;
    }
    if (!best) return;
    best.item = this.pendingItems.shift()!;
  }

  private updateCombo(): void {
    if (this.streak > 0 && this.time - this.lastCaptureTime > gameConfig.combo.windowSec) {
      this.streak = 0;
      this.events.push({ type: 'comboReset' });
    }
  }

  private updateCamera(): void {
    const target = this.hero.y - this.viewH * gameConfig.camera.heroAnchor;
    if (target > this.camY) {
      const k = Math.min(1, gameConfig.camera.follow * DT);
      this.camY += (target - this.camY) * k;
    }
  }

  /**
   * Tutorial helper: starts a long, clearly telegraphed red phase on the nearest
   * colored platform above the hero. Returns false if there is none yet.
   */
  forceRedPhase(): boolean {
    let best: Platform | null = null;
    for (const p of this.platforms) {
      if (p.kind !== 'color' || p.y < this.hero.y + 40) continue;
      if (!best || p.y < best.y) best = p;
    }
    if (!best) return false;
    best.phases = true;
    best.phase = 'warn';
    best.phaseLen = best.phaseT = TUTORIAL_WARN_SEC;
    this.events.push({ type: 'warn', id: best.id });
    return true;
  }

  /** True while any platform is warning or red (tutorial uses it to re-trigger). */
  get hasRedPhase(): boolean {
    return this.platforms.some((p) => p.phase !== 'normal');
  }

  private updateWave(): void {
    if (this.tutorial) return;
    if (!this.waveActive && this.runStarted && this.runTime >= gameConfig.wave.delaySec) {
      this.waveActive = true;
    }
    if (!this.waveActive) return;
    this.waveY += gameConfig.tiers[this.tier].riseSpeed * DT;
    this.waveY = Math.max(this.waveY, this.camY - gameConfig.wave.maxLag);
  }

  private checkDeath(): void {
    if (this.dead) return;
    // Before the run starts a miss is forgiven: the hero returns to the start platform.
    if (!this.runStarted && this.hero.y < START_Y - 160) {
      const h = this.hero;
      h.x = h.prevX = gameConfig.world.width / 2;
      h.y = h.prevY = START_Y;
      h.vx = 0;
      h.vy = gameConfig.hero.jumpImpulse;
      return;
    }
    if (this.waveActive && this.hero.y < this.waveY) this.die('wave');
    else if (this.hero.y + gameConfig.hero.height < this.camY - 10) this.die('fall');
  }

  private die(reason: DeathReason): void {
    this.dead = true;
    this.deathReason = reason;
    this.hero.vy = 520;
    this.hero.vx = this.hero.facing * -60;
    this.events.push({ type: 'death', reason });
  }

  private fillPlatforms(): void {
    const target = this.camY + this.viewH + gameConfig.platform.spawnAhead;
    if (this.gen.anchorY >= target) return;
    const added = this.gen.generateUpTo(target, this.tier, this.viewH, this.platforms);
    for (const p of added) this.platforms.push(p);
  }

  private cullPlatforms(): void {
    const floor = Math.max(this.camY - 60, this.waveActive ? this.waveY - 20 : -Infinity);
    this.platforms = this.platforms.filter((p) => p.y > floor && !(p.kind === 'white' && p.whiteT <= 0));
  }
}
