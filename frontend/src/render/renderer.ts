import { gameConfig, type ColorId, type LightId } from '../core/gameConfig';
import type { Sim } from '../core/sim';
import type { Platform, SimEvent } from '../core/types';
import { ru } from '../i18n/ru';
import { isBuffOnly, type Slot } from './slots';
import { tone } from './shade3d';
import { DeathFx } from './deathFx';
import { comboLevel, FireTrail } from './fireTrail';
import { perf } from '../core/perf';
import type { DeathReason } from '../core/types';
import { drawPet, type PetKind } from './pets';
import { PetFollower } from './petMotion';
import { STYLES, torchReach, type StyleLoadout } from './styles';
import { drawHeroBody, drawItem, heroRig, ITEM_ANCHOR, ITEM_BY_TIER, outfitFromMask, type AttachPoint, type Face, type Gesture, type HeroPose, type Item, type Rig } from './hero';
import { palette } from './palette';
import { CROWN_LIFT_SIDE, crownBob, drawCrown } from './crown';
import { drawGovAura, type GovRole } from './govArt';
import { paintParallax, paintScene, paintSky } from './scenes';
import { drawStoryDecor, STORY_TIERS } from './storyScenes';

const MAX_PARTICLES = 220;

/** Which body part each collectible attaches to (the target of its flight). */
const ITEM_POINT: Partial<Record<Item, AttachPoint>> = {
  cap: 'headTop',
  helmet: 'head',
  glasses: 'face',
  tank: 'torso',
  shirt: 'torso',
  jacket: 'torso',
  tie: 'neck',
  shorts: 'waist',
  sweats: 'waist',
  trousers: 'waist',
  slippers: 'frontFoot',
  shoes: 'frontFoot',
  watch: 'wrist',
  torch: 'frontHand',
  newTorch: 'frontHand',
  phone: 'backHand',
};
const MAX_BILLS = 60;
/** Wallet position in the HUD, in world units from the top-left (bills fly there). */
const WALLET = { x: 30, y: 26 };

/** Typed-array particle pool: 0 dust, 1 bill, 2 spark. */
class Particles {
  x = new Float32Array(MAX_PARTICLES);
  y = new Float32Array(MAX_PARTICLES);
  vx = new Float32Array(MAX_PARTICLES);
  vy = new Float32Array(MAX_PARTICLES);
  life = new Float32Array(MAX_PARTICLES);
  max = new Float32Array(MAX_PARTICLES);
  kind = new Uint8Array(MAX_PARTICLES);
  rot = new Float32Array(MAX_PARTICLES);
  next = 0;
  cap = MAX_PARTICLES;

  spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.rot[i] = Math.random() * Math.PI;
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const g = this.kind[i] === 0 ? 120 : this.kind[i] === 1 ? 260 : 60;
      this.vy[i] -= g * dt;
      this.vx[i] *= 1 - 2 * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += dt * 6;
    }
  }

  clear(): void {
    this.life.fill(0);
  }
}

/** A bill flying from a captured platform to the wallet along a Bezier curve (screen space). */
interface FlyBill {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  t: number;
  dur: number;
  rot: number;
}

interface Floater {
  x: number;
  y: number;
  life: number;
  max: number;
  text: string;
  color: string;
  big: boolean;
}

/** A clothing item flying onto the hero (in) or knocked off (out), in world coordinates. */
interface FlyItem {
  item: Item;
  dir: 'in' | 'out';
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  t: number;
  dur: number;
  rot: number;
  done: boolean;
  pickup?: boolean;
  tier?: number;
}

interface Cine {
  t: number;
  dur: number;
  fromScene: number;
  toScene: number;
  kind: 'stage' | 'item';
}

/** Light motes floating over the scene, in screen space. */
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  kind: number;
  seed: number;
}

interface Spot {
  x: number;
  y: number;
  t: number;
  color: string;
}

interface Ambient {
  kind: 'flash' | 'heli' | 'launch';
  x: number;
  y: number;
  t: number;
  dur: number;
  dir: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  scale = 1;
  dpr = 1;
  private floaters: Floater[] = [];
  private bills: FlyBill[] = [];
  private particles = new Particles();
  private deathFx = new DeathFx();
  private fireTrail = new FireTrail();
  private deathFxDone = false;
  private lastDeathReason: DeathReason = 'fall';
  private skies = new Map<number, HTMLCanvasElement>();
  private tiles = new Map<number, HTMLCanvasElement>();
  private ambient: Ambient[] = [];
  private ambientTimer = 0;
  private sceneTier = 0;
  private flashlightColor: [number, number, number] = [235, 235, 225];
  private auraPulse = 0;
  private lowQuality = false;

  reducedEffects = false;
  colorblind = false;
  /** Menu override: dress the hero and the scene by the player's best tier. */
  heroTierOverride: number | null = null;
  /** 0..1 darkening after death. */
  deathK = 0;
  /** Menu shifts the view so the hero stands above the menu card. */
  camShift = 0;
  /** Called when bills of a capture reach the wallet. */
  onBillArrive: () => void = () => undefined;
  /** Called when a piece of clothing snaps onto the hero. */
  onItemSnap: (item: Item) => void = () => undefined;
  /** Menu pose of the hero. */
  menuGesture: Gesture | null = null;

  private items: FlyItem[] = [];
  private cine: Cine | null = null;
  private highlights: { item: Item; t: number }[] = [];
  /** Where the hero was drawn this frame: lets effects follow the animated body. */
  private heroXf: { x: number; y: number; sx: number; sy: number; facing: number; rig: Rig } | null = null;

  /** Screen position of a body attachment point on the animated hero. */
  heroPoint(name: AttachPoint): { x: number; y: number } | null {
    const xf = this.heroXf;
    if (!xf) return null;
    const p = xf.rig.points[name];
    return { x: xf.x + p.x * xf.sx * xf.facing, y: xf.y + p.y * xf.sy };
  }
  private sparkles: { x: number; y: number; t: number }[] = [];
  private rings: { t: number; color: string }[] = [];
  private trail: { x: number; y: number; age: number }[] = [];
  /** Light waves that run out from a captured platform. */
  private waves: { x: number; y: number; t: number; rgb: string; big: boolean; dust: { dx: number; vx: number; vy: number; r: number; life: number }[] }[] = [];
  /** Colored flash over the whole field on a new combo step. */
  private pulse: { t: number; rgb: string } | null = null;
  private lastMult = 1;
  /** The player holds the weekly crown: it floats above the hero's head. */
  crown = false
  /** The player is the mayor or an assistant: the glow around him (and the mayor's diamond crown). */
  role: GovRole = null
  private motes: Mote[] = [];
  private beamMotes: { u: number; v: number; s: number }[] = Array.from({ length: 12 }, () => ({
    u: Math.random(),
    v: Math.random() * 2 - 1,
    s: 0.3 + Math.random() * 0.7,
  }));
  /** Collected items shown on the hero (bitmask, bit = tier). */
  ownedMask = 0;
  /** Slots taken by worn styles: bonus items for them become buff icons instead of being worn. */
  occupied: ReadonlySet<Slot> = new Set();
  /** The pet that runs (or flies) beside the hero, or null. */
  pet: PetKind | null = null;
  private petFollower = new PetFollower();
  /** Cosmetic styles worn by the hero (drawn on it). */
  styles: StyleLoadout = {};
  /** Color of the cosmetic offered in this run (the box on the platform glows in it). */
  dropColor = '#FFD640';
  /** The offered cosmetic was picked up. */
  onDrop: () => void = () => undefined;
  /** A bonus item was collected into a slot held by a style (it counts, but is not drawn). */
  onBuff: (tier: number) => void = () => undefined;
  /** Freeze-frame suit-up movie; when off, clothes change instantly with a glow. */
  cinematic = true;
  /** Menu background: draw the scene only, no platforms or hero. */
  sceneOnly = false;
  /** Called at the start of a suit-up with the new pieces (for the caption). */
  onCaption: (kind: 'stage' | 'item' | 'ring', value: number) => void = () => undefined;
  private impulse = 0;
  private spots: Spot[] = [];
  private moneyTier = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  resize(cssW: number, cssH: number, scale: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = scale;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.skies.clear();
    this.tiles.clear();
  }

  /** Instantly shows a scene (new run, menu) and clears effects. */
  setScene(tier: number): void {
    this.sceneTier = tier;
    this.cine = null;
    this.petFollower.reset();
    this.fireTrail.reset();
    this.danger = 0;
    this.highlights.length = 0;
    this.sparkles.length = 0;
    this.trail.length = 0;
    this.rings.length = 0;
    this.waves.length = 0;
    this.trail.length = 0;
    this.pulse = null;
    this.lastMult = 1;
    this.bills.length = 0;
    this.floaters.length = 0;
    this.ambient.length = 0;
    this.particles.clear();
    this.deathK = 0;
    this.items.length = 0;
    this.spots.length = 0;
    this.moneyTier = tier;
  }

  /** Builds a scene's sprites ahead of time, when the browser is idle. */
  prewarm(tier: number, viewH: number): void {
    const run = (): void => {
      this.sky(tier, gameConfig.world.width, viewH);
      this.tile(tier, gameConfig.world.width, viewH);
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
    if (ric) ric(run);
    else setTimeout(run, 200);
  }

  handleEvents(events: SimEvent[], sim: Sim): void {
    const H = sim.viewH;
    const toScreenY = (y: number): number => H - (y - sim.camY);
    for (const e of events) {
      if (e.type === 'capture') {
        const c = palette.light[e.color];
        if (!this.reducedEffects) {
          this.spots.push({ x: e.x, y: e.y, t: 0, color: c });
          const rgbc = hexRgb(c);
          const count = this.lowQuality ? 7 : e.mult > 1 ? 18 : 13;
          const dust = Array.from({ length: count }, () => ({
            dx: (Math.random() - 0.5) * 64,
            vx: (Math.random() - 0.5) * 46,
            vy: 8 + Math.random() * 26,
            r: 1.4 + Math.random() * 2.6,
            life: 0.5 + Math.random() * 0.5,
          }));
          this.waves.push({ x: e.x, y: e.y, t: 0, rgb: rgbc, big: e.mult > 1, dust });
          if (e.mult > this.lastMult && e.mult >= 2) this.pulse = { t: 0, rgb: rgbc };
        }
        this.lastMult = e.mult;
        this.floaters.push({ x: e.x, y: e.y + 28, life: 0.9, max: 0.9, text: `+${e.points}`, color: c, big: e.mult > 1 });
        const n = this.reducedEffects ? 3 : this.lowQuality ? 6 : 8 + Math.floor(Math.random() * 7);
        const sy = toScreenY(e.y);
        for (let i = 0; i < n && this.bills.length < MAX_BILLS; i++) {
          const spread = (i / Math.max(1, n - 1) - 0.5) * 120;
          this.bills.push({
            x0: e.x,
            y0: sy,
            cx: e.x + spread,
            cy: sy - 90 - Math.random() * 60,
            t: -i * 0.025,
            dur: 0.55 + Math.random() * 0.2,
            rot: Math.random() * 6,
          });
        }
      } else if (e.type === 'land' && !this.reducedEffects) {
        for (let i = 0; i < 5; i++) {
          this.particles.spawn(0, e.x + (Math.random() - 0.5) * 24, e.y + 2, (Math.random() - 0.5) * 90, 20 + Math.random() * 30, 0.35);
        }
      } else if (e.type === 'comboReset') {
        this.lastMult = 1;
      } else if (e.type === 'aura') {
        this.auraPulse = 1;
      } else if (e.type === 'wall') {
        this.wallFlash = { x: e.x + e.side * 10, y: e.y + 26, t: 0, side: e.side };
        if (!this.reducedEffects) {
          for (let i = 0; i < 6; i++) {
            this.particles.spawn(0, e.x + e.side * 10, e.y + 10 + Math.random() * 30, -e.side * (40 + Math.random() * 60), (Math.random() - 0.3) * 60, 0.4);
          }
        }
      } else if (e.type === 'close') {
        this.floaters.push({ x: e.x, y: e.y + 46, life: 0.9, max: 0.9, text: ru.hud.close, color: '#FFE58A', big: true });
      } else if (e.type === 'light') {
        if (e.light && !this.reducedEffects) this.rings.push({ t: 0, color: palette.light[e.light] });
      } else if (e.type === 'tier') {
        this.moneyTier = e.tier;
        this.prewarm(Math.min(e.tier + 1, 12), H);
        this.startStage(e.tier);
      } else if (e.type === 'ringPickup') {
        this.onCaption('ring', 0);
        if (!this.reducedEffects) {
          for (let i = 0; i < 22; i++) this.sparkles.push({ x: e.x + (Math.random() - 0.5) * 70, y: toScreenY(e.y) + (Math.random() - 0.5) * 36, t: Math.random() * 0.3 });
        }
      } else if (e.type === 'dropPickup') {
        this.onDrop();
        if (!this.reducedEffects) {
          for (let i = 0; i < 16; i++) this.sparkles.push({ x: e.x + (Math.random() - 0.5) * 60, y: toScreenY(e.y) + (Math.random() - 0.5) * 30, t: Math.random() * 0.25 });
        }
      } else if (e.type === 'pickup') {
        if (isBuffOnly(e.item, this.occupied)) {
          // The slot is held by a style: the +5% still counts, only the picture changes.
          this.onBuff(e.item);
          if (!this.reducedEffects) {
            for (let i = 0; i < 8; i++) this.sparkles.push({ x: e.x + (Math.random() - 0.5) * 40, y: toScreenY(e.y) + (Math.random() - 0.5) * 16, t: Math.random() * 0.2 });
          }
        } else {
          this.startItemFlight(e.item, e.x, e.y, sim);
        }
      } else if (e.type === 'death') {
        // The effect itself starts in draw(), once the hero's picture of this moment is known.
        this.lastDeathReason = e.reason;
        if (this.reducedEffects) {
          for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.spawn(1, sim.hero.x, sim.hero.y + 26, Math.cos(a) * 220, Math.sin(a) * 220 + 120, 1.2);
          }
        }
      }
    }
  }

  // ---------- Suit-up cinematic ----------

  /** True while the tier-change cinematic plays: the game is frozen meanwhile. */
  get cineActive(): boolean {
    return this.cine !== null;
  }

  /**
   * New tier: a short movie (when enabled) - the camera moves in, the scene fades
   * to the new place under a spotlight and the hero poses. Clothes no longer change here.
   */
  private startStage(tier: number): void {
    if (this.reducedEffects || !this.cinematic) {
      this.sceneTier = tier;
      this.onCaption('stage', tier);
      return;
    }
    this.cine = { t: 0, dur: 2.6, fromScene: this.sceneTier, toScene: tier, kind: 'stage' };
    this.onCaption('stage', tier);
  }

  /**
   * Iron-Man style pickup: the piece tears off the platform, sweeps across the whole
   * screen in a big arc, turns and snaps onto the hero with sparks and a flash.
   */
  private startItemFlight(tier: number, x: number, y: number, sim: Sim): void {
    const item = ITEM_BY_TIER[tier] as Item;
    const anchor = ITEM_ANCHOR[item] ?? [0, -30];
    const W = gameConfig.world.width;
    const pause = this.cinematic && !this.reducedEffects;
    this.items.push({
      item,
      dir: 'in',
      x0: x,
      y0: y + 16,
      vx: anchor[0],
      vy: anchor[1],
      ax: x < W / 2 ? W + 30 : -30,
      ay: sim.hero.y + 260,
      t: 0,
      dur: pause ? 1.15 : 0.75,
      rot: 9,
      done: false,
      pickup: true,
      tier,
    });
    if (pause) this.cine = { t: 0, dur: 1.45, fromScene: this.sceneTier, toScene: this.sceneTier, kind: 'item' };
    this.onFlightStart(item);
    this.onCaption('item', tier);
  }

  /** Called when an item starts flying (sound). */
  onFlightStart: (item: Item) => void = () => undefined;

  private drawItems(sim: Sim, heroX: number, heroY: number, toY: (y: number) => number, dt: number): void {
    if (!this.items.length) return;
    const ctx = this.ctx;
    const facing = sim.hero.facing;
    for (const it of this.items) {
      it.t += dt;
      if (it.t < 0) continue;
      const k = Math.min(1, it.t / it.dur);
      if (it.dir === 'in' && !it.done) {
        // The target follows the animated body part the item belongs to.
        const target = this.heroPoint(ITEM_POINT[it.item] ?? 'torso');
        const tx = target ? target.x : heroX + it.vx * facing;
        const ty = target ? target.y : toY(heroY - it.vy);
        // Cubic arc: platform -> far screen edge high up -> back over the top -> onto the hero.
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const u = 1 - e;
        const p1x = it.ax;
        const p1y = it.ay;
        // Screen space: start on the platform, sweep to the far edge, come back over the top.
        const sy0 = toY(it.y0);
        const sy1 = toY(p1y);
        const p2x = tx + (tx < gameConfig.world.width / 2 ? -60 : 60);
        const p2y = ty - 140;
        const x = u * u * u * it.x0 + 3 * u * u * e * p1x + 3 * u * e * e * p2x + e * e * e * tx;
        const y = u * u * u * sy0 + 3 * u * u * e * sy1 + 3 * u * e * e * p2y + e * e * e * ty;
        // A glowing streak behind the flying piece.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
        g.addColorStop(0, `rgba(255,230,150,${0.7 * (1 - k * 0.5)})`);
        g.addColorStop(1, 'rgba(255,230,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 26, y - 26, 52, 52);
        ctx.restore();
        if (Math.random() < 0.6) this.sparkles.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, t: 0 });
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(it.rot * (1 - e));
        const sc = 2.6 - 1.6 * e;
        ctx.scale(sc * facing, sc);
        drawItem(ctx, it.item);
        ctx.restore();
        if (k >= 1) {
          it.done = true;
          this.impulse = 1;
          this.flash = 1;
          if (it.tier !== undefined) this.ownedMask |= 1 << it.tier;
          this.onItemSnap(it.item);
          this.highlights.push({ item: it.item, t: 0 });
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            this.sparkles.push({ x: tx + Math.cos(a) * (4 + Math.random() * 14), y: ty + Math.sin(a) * (4 + Math.random() * 14), t: Math.random() * 0.2 });
          }
        }
      }
    }
    this.items = this.items.filter((it) => !it.done);
  }

  private wallFlash: { x: number; y: number; t: number; side: number } | null = null;

  /**
   * Soft walls: the area behind the side buildings is shaded, and a thin light edge marks
   * where the hero bounces back. A short glow shows the bounce.
   */
  private drawWalls(W: number, H: number): void {
    const ctx = this.ctx;
    const m = gameConfig.world.margin;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : W - m;
      const g = ctx.createLinearGradient(side < 0 ? m : W - m, 0, side < 0 ? 0 : W, 0);
      g.addColorStop(0, 'rgba(6,8,14,0.22)');
      g.addColorStop(1, 'rgba(6,8,14,0.4)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, m, H);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(side < 0 ? m - 1 : W - m, 0, 1, H);
    }
  }

  /** A brief bright outline of the hero when a piece snaps on. */
  private flash = 0;

  /** Soft pulsing glow on freshly worn pieces for a few seconds. */
  private drawHighlights(dt: number): void {
    if (!this.highlights.length) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    this.highlights = this.highlights.filter((h) => (h.t += dt) < 6);
    for (const h of this.highlights) {
      const fade = h.t < 5 ? 1 : 6 - h.t;
      const pulse = 0.55 + 0.45 * Math.sin(h.t * 4);
      const pt = this.heroPoint(ITEM_POINT[h.item] ?? 'torso');
      if (!pt) continue;
      const hx = pt.x;
      const hy = pt.y;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 16);
      g.addColorStop(0, `rgba(255,236,160,${0.55 * pulse * fade})`);
      g.addColorStop(1, 'rgba(255,236,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(hx - 16, hy - 16, 32, 32);
      if (Math.random() < dt * 6) this.sparkles.push({ x: hx + (Math.random() - 0.5) * 18, y: hy + (Math.random() - 0.5) * 18, t: 0 });
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  draw(sim: Sim, alpha: number, frameDt: number): void {
    this.trackQuality(frameDt);
    const ctx = this.ctx;
    const W = gameConfig.world.width;
    const H = sim.viewH;
    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);

    this.particles.update(frameDt);
    this.deathFx.update(frameDt);
    this.fireTrail.update(frameDt);
    if (!sim.dead && this.deathFxDone) {
      // A new run: the effect and the screen jolt are over.
      this.deathFx.reset();
      this.deathFxDone = false;
    }
    {
      const sh = this.deathFx.shake();
      this.canvas.style.transform = sh.x || sh.y ? `translate(${sh.x.toFixed(1)}px, ${sh.y.toFixed(1)}px)` : '';
    }
    this.auraPulse = Math.max(0, this.auraPulse - frameDt * 2.5);

    const cam = sim.prevCamY + (sim.camY - sim.prevCamY) * alpha + this.camShift;
    const toY = (y: number): number => H - (y - cam);
    const tier = this.heroTierOverride ?? sim.tier;
    this.flash = Math.max(0, this.flash - frameDt * 3);
    this.impulse = Math.max(0, this.impulse - frameDt * 5);

    const hero = sim.hero;
    const hx = hero.prevX + (hero.x - hero.prevX) * alpha;
    const hy = hero.prevY + (hero.y - hero.prevY) * alpha;

    // Cinematic camera: zoom towards the hero during the suit-up.
    let zoom = 1;
    if (this.cine) {
      const c = this.cine;
      c.t += frameDt;
      const ramp = c.kind === 'stage' ? 0.7 : 0.3;
      const kin = Math.min(1, c.t / ramp);
      const kout = Math.min(1, Math.max(0, (c.dur - c.t) / ramp));
      zoom = 1 + (c.kind === 'stage' ? 0.9 : 0.35) * easeInOut(Math.min(kin, kout));
      if (c.t >= 0.35 && this.sceneTier !== c.toScene) this.sceneTier = c.toScene;
      if (c.t >= c.dur) this.cine = null;
    }
    if (zoom !== 1) {
      const fx = hx;
      const fy = toY(hy) - 26;
      ctx.translate(fx, fy);
      ctx.scale(zoom, zoom);
      ctx.translate(-fx, -fy + (zoom - 1) * 30);
    }

    this.drawBackground(W, H, cam, frameDt);
    this.drawMotes(tier, W, H, frameDt);
    if (this.sceneOnly) {
      this.drawSparkles(frameDt);
      return;
    }
    this.drawAmbient(tier, W, H, frameDt);
    this.drawWalls(W, H);

    for (const p of sim.platforms) {
      this.drawPlatform(p, toY(p.y), sim.time);
      if (p.item >= 0) this.drawPickup(ITEM_BY_TIER[p.item] as Item, p.x, toY(p.y), sim.time);
      if (p.drop) this.drawDropBox(p.x, toY(p.y), sim.time);
      if (p.ring) this.drawRingBox(p.x, toY(p.y), sim.time);
    }
    this.drawSpots(toY, frameDt);

    this.drawWave(sim, toY, W, H);
    this.drawParticles(toY);
    this.drawWaves(toY, frameDt);
    this.drawTrail(sim, hx, hy, toY, frameDt);

    if (this.cine) {
      // Dim the scene and light the hero with a spotlight.
      const c = this.cine;
      const k = Math.min(1, c.t / 0.4, Math.max(0, (c.dur - c.t) / 0.4));
      const sx = hx;
      const sy = toY(hy) - 28;
      const g = ctx.createRadialGradient(sx, sy, 30, sx, sy, 170);
      g.addColorStop(0, 'rgba(5,6,12,0)');
      g.addColorStop(1, `rgba(5,6,12,${0.7 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(sx - W * 2, sy - H * 2, W * 4, H * 4);
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(sx, sy - 220, sx, sy + 40);
      beam.addColorStop(0, `rgba(255,240,200,0)`);
      beam.addColorStop(1, `rgba(255,240,200,${0.16 * k})`);
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(sx - 18, sy - 260);
      ctx.lineTo(sx + 18, sy - 260);
      ctx.lineTo(sx + 50, sy + 40);
      ctx.lineTo(sx - 50, sy + 40);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // The pet: a cat or a dog runs behind the hero, a parrot flies in front of him.
    if (this.pet) {
      if (!sim.dead) this.petFollower.update(sim.time, frameDt, this.pet, hx, hy, hero.facing > 0 ? 1 : -1);
      if (this.pet !== 'parrot' && this.pet !== 'spark' && this.pet !== 'trophy') this.paintPet(toY);
    }
    this.drawHero(sim, hx, toY(hy), frameDt, tier);
    if (this.pet === 'parrot' || this.pet === 'spark' || this.pet === 'trophy') this.paintPet(toY);
    this.drawItems(sim, hx, hy, toY, frameDt);
    this.drawHighlights(frameDt);
    this.drawSparkles(frameDt);
    if (this.wallFlash) {
      const f = this.wallFlash;
      f.t += frameDt;
      if (f.t > 0.35) this.wallFlash = null;
      else {
        const k = 1 - f.t / 0.35;
        const sy = toY(f.y);
        const wx = f.side < 0 ? gameConfig.world.margin : W - gameConfig.world.margin;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(wx, sy, 0, wx, sy, 40);
        g.addColorStop(0, `rgba(200,220,255,${0.45 * k})`);
        g.addColorStop(1, 'rgba(200,220,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(wx - 40, sy - 40, 80, 80);
        ctx.restore();
      }
    }
    if (!this.cine) this.drawDanger(sim, W, H);
    this.drawPulse(W, H, frameDt);

    this.drawFloaters(toY, frameDt);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    this.drawBills(frameDt);

    if (this.deathK > 0) {
      ctx.fillStyle = `rgba(5,6,10,${0.45 * this.deathK})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.deathFx.draw(ctx, W, H);
  }

  /**
   * Wide desktop screens: the current scene fills the whole window behind the field,
   * dimmed, with the same parallax. Purely decorative: the game world stays the same.
   */
  drawBackdrop(c: HTMLCanvasElement, sim: Sim): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    const g = c.getContext('2d');
    if (!g) return;
    const W = gameConfig.world.width;
    const H = sim.viewH;
    const shown = this.heroTierOverride ?? this.sceneTier;
    const k = h / (H * this.scale); // scene tile drawn to the window height
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(this.sky(shown, W, H), 0, 0, w, h);
    const tile = this.tile(shown, W, H);
    const tw = W * this.scale * k;
    const th = h;
    const off = ((((sim.camY + this.camShift) * 0.35) % H) + H) % H;
    const oy = off * this.scale * k;
    for (let x = w / 2 - tw / 2 - Math.ceil(w / tw / 2 + 1) * tw; x < w; x += tw) {
      g.drawImage(tile, x, oy - th, tw, th);
      g.drawImage(tile, x, oy, tw, th);
    }
    // Dim the surroundings so the field stays the focus.
    g.fillStyle = 'rgba(6,9,16,0.5)';
    g.fillRect(0, 0, w, h);
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }

  // ---------- Background ----------

  private sky(tier: number, W: number, H: number): HTMLCanvasElement {
    let c = this.skies.get(tier);
    if (!c) {
      c = this.offscreen(W, H);
      paintSky(this.ctxOf(c), tier, W, H);
      this.skies.set(tier, c);
    }
    return c;
  }

  private tile(tier: number, W: number, H: number): HTMLCanvasElement {
    let c = this.tiles.get(tier);
    if (!c) {
      c = this.offscreen(W, H);
      paintScene(this.ctxOf(c), tier, W, H);
      this.tiles.set(tier, c);
    }
    return c;
  }

  private par = new Map<number, HTMLCanvasElement>();

  private parLayer(tier: number, layer: 0 | 1 | 2, W: number, H: number): HTMLCanvasElement {
    const key = tier * 3 + layer;
    let c = this.par.get(key);
    if (!c) {
      c = this.offscreen(W, H);
      paintParallax(this.ctxOf(c), tier, W, H, layer);
      this.par.set(key, c);
    }
    return c;
  }

  /** One looping parallax layer; speed is the share of the camera movement. */
  private drawParLayer(tier: number, layer: 0 | 1 | 2, speed: number, cam: number, W: number, H: number): void {
    const c = this.parLayer(tier, layer, W, H);
    const off = (((cam * speed) % H) + H) % H;
    this.ctx.drawImage(c, 0, off - H, W, H);
    this.ctx.drawImage(c, 0, off, W, H);
  }

  private offscreen(W: number, H: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * this.scale * this.dpr));
    c.height = Math.max(1, Math.round(H * this.scale * this.dpr));
    return c;
  }

  private ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
    const g = c.getContext('2d')!;
    const k = this.scale * this.dpr;
    g.scale(k, k);
    return g;
  }

  private drawBackground(W: number, H: number, cam: number, dt: number): void {
    const ctx = this.ctx;
    const shown = this.heroTierOverride ?? this.sceneTier;
    ctx.drawImage(this.sky(shown, W, H), 0, 0, W, H);
    const tile = this.tile(shown, W, H);
    // Parallax: far towers and clouds behind, the edge buildings in the middle, specks in front.
    const deep = !this.reducedEffects;
    if (deep) {
      this.drawParLayer(shown, 0, 0.07, cam, W, H);
    }
    const off = (((cam * 0.35) % H) + H) % H;
    ctx.drawImage(tile, 0, off - H, W, H);
    ctx.drawImage(tile, 0, off, W, H);
    if (deep) this.drawParLayer(shown, 2, 1.4, cam, W, H);
    this.clock += dt;
    if (!this.reducedEffects) this.drawDecor(shown, W, H, off);

    // During the suit-up the new scene fades in over the old one.
    if (this.cine && this.cine.t < 0.9 && this.cine.fromScene !== shown) {
      const k = Math.min(1, this.cine.t / 0.9);
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(this.sky(this.cine.fromScene, W, H), 0, 0, W, H);
      const old = this.tile(this.cine.fromScene, W, H);
      ctx.drawImage(old, 0, off - H, W, H);
      ctx.drawImage(old, 0, off, W, H);
      ctx.globalAlpha = 1;
    }
  }

  private clock = 0;

  /**
   * Small living details on top of the cached scene, positioned in tile space so they
   * scroll with it: a cat, windows lighting up, falling petals, sea glints, tower beacons.
   * Everything changes slowly (periods of a second or more): no flicker.
   */
  private drawDecor(tier: number, W: number, H: number, off: number): void {
    const ctx = this.ctx;
    const t = this.clock;
    const at = (y: number): number[] => [y + off - H, y + off];
    // The first stages tell the story of the career with their own living details (storyScenes.ts).
    if (tier < STORY_TIERS) {
      drawStoryDecor(ctx, tier, W, H, off, t, this.lowQuality);
      return;
    }
    if (tier === 0) {
      for (let y = 120; y < H; y += 220) {
        for (const sy of at(y - 22)) {
          // A cat on the bins, tail swishing.
          ctx.fillStyle = 'rgba(15,15,20,0.9)';
          ctx.beginPath();
          ctx.ellipse(14, sy - 5, 7, 5, 0, 0, Math.PI * 2);
          ctx.arc(20, sy - 11, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(18, sy - 14);
          ctx.lineTo(19, sy - 18);
          ctx.lineTo(21, sy - 14);
          ctx.moveTo(21, sy - 14);
          ctx.lineTo(23, sy - 18);
          ctx.lineTo(24, sy - 13);
          ctx.fill();
          ctx.strokeStyle = 'rgba(15,15,20,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(8, sy - 4);
          ctx.quadraticCurveTo(2, sy - 10 + Math.sin(t * 2.2) * 4, 4 + Math.sin(t * 2.2) * 3, sy - 16);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,220,120,0.9)';
          ctx.fillRect(21, sy - 12, 1.5, 1.5);
        }
      }
      for (let y = 60; y < H; y += 260) {
        for (const sy of at(y)) {
          ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 1.3 + y);
          ctx.fillStyle = '#FFDC8C';
          ctx.beginPath();
          ctx.arc(66, sy, 18, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    } else if ((tier >= 1 && tier <= 3) || tier === 6 || tier === 7) {
      // Windows switch on and off every few seconds.
      for (let i = 0; i < 10; i++) {
        const phase = Math.sin(t * (0.35 + (i % 4) * 0.08) + i * 1.7);
        if (phase < 0.2) continue;
        const left = i % 2 === 0;
        const x = left ? 10 + ((i * 17) % 44) : W - 54 + ((i * 13) % 40);
        const y = (i * 97) % H;
        for (const sy of at(y)) {
          ctx.globalAlpha = Math.min(1, (phase - 0.2) * 3) * 0.85;
          ctx.fillStyle = tier >= 6 ? '#FFE9B0' : '#FFD27A';
          ctx.fillRect(x, sy, 9, 11);
        }
      }
      ctx.globalAlpha = 1;
    } else if (tier === 4 || tier === 5) {
      // Leaves and petals drifting down at the edges (screen space).
      for (let i = 0; i < 9; i++) {
        const left = i % 2 === 0;
        const x = (left ? 18 : W - 18) + Math.sin(t * 1.2 + i) * 12;
        const y = ((t * (22 + i * 3) + i * 83) % (H + 20)) - 10;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t * 2 + i) * 0.8);
        ctx.fillStyle = tier === 5 ? ['#FF8FA3', '#FFD640', '#C9A0FF'][i % 3] : '#5BAE6E';
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.5, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (tier >= 8 && tier <= 9) {
      // Slow twinkles on the gold columns.
      for (let i = 0; i < 8; i++) {
        const left = i % 2 === 0;
        const x = left ? 71 : W - 71;
        const y = (i * 131) % H;
        const a = Math.max(0, Math.sin(t * 0.9 + i * 2.1));
        for (const sy of at(y)) {
          ctx.globalAlpha = a * 0.9;
          ctx.fillStyle = '#FFF6C8';
          ctx.fillRect(x - 0.75, sy - 5, 1.5, 10);
          ctx.fillRect(x - 5, sy - 0.75, 10, 1.5);
        }
      }
      ctx.globalAlpha = 1;
    } else if (tier === 10 || tier === 11) {
      // Glints on the sea (static layer, no scrolling).
      for (let i = 0; i < 12; i++) {
        const a = Math.max(0, Math.sin(t * 0.8 + i * 1.3));
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect((i * 71) % W, H * 0.72 + ((i * 29) % (H * 0.26)), 10, 1.5);
      }
      ctx.globalAlpha = 1;
    } else if (tier >= 12) {
      // Red beacons on the launch towers, about one blink per second.
      const on = Math.sin(t * 3) > 0.4;
      if (on) {
        ctx.fillStyle = '#FF4C5A';
        for (let y = 24; y < H; y += 96) {
          for (const sy of at(y)) {
            for (const x of [11, 38, W - 39, W - 12]) {
              ctx.beginPath();
              ctx.arc(x, sy, 2.2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    }
  }

  /** Photographers' flashes, a helicopter and rocket launches at the edges (never over the HUD). */
  private drawAmbient(tier: number, W: number, H: number, dt: number): void {
    if (this.reducedEffects) return;
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 0.9 + Math.random() * 1.4;
      const left = Math.random() < 0.5;
      if (tier >= 5 && tier <= 10 && this.ambient.filter((a) => a.kind === 'flash').length < 2) {
        // Small flashes at the screen edge, never more often than 3 times a second.
        this.ambient.push({ kind: 'flash', x: left ? 14 : W - 14, y: H * (0.35 + Math.random() * 0.4), t: 0, dur: 0.4, dir: 0 });
      }
      if (tier === 9 && Math.random() < 0.15 && !this.ambient.some((a) => a.kind === 'heli')) {
        this.ambient.push({ kind: 'heli', x: left ? -40 : W + 40, y: 100 + Math.random() * 60, t: 0, dur: 7, dir: left ? 1 : -1 });
      }
      if (tier === 12 && Math.random() < 0.12 && !this.ambient.some((a) => a.kind === 'launch')) {
        this.ambient.push({ kind: 'launch', x: left ? 40 : W - 40, y: H, t: 0, dur: 4, dir: 0 });
      }
    }
    const ctx = this.ctx;
    this.ambient = this.ambient.filter((a) => (a.t += dt) < a.dur);
    for (const a of this.ambient) {
      const k = a.t / a.dur;
      if (a.kind === 'flash') {
        ctx.fillStyle = 'rgba(20,20,28,0.85)';
        ctx.beginPath();
        ctx.arc(a.x, a.y - 12, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(a.x - 5, a.y - 7, 10, 14);
        ctx.fillRect(a.x - 4, a.y - 12, 8, 5);
        if (k < 0.3) {
          const fk = 1 - k / 0.3;
          ctx.fillStyle = `rgba(255,255,240,${0.75 * fk})`;
          ctx.beginPath();
          ctx.arc(a.x, a.y - 10, 6 + 10 * (1 - fk), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (a.kind === 'heli') {
        const x = a.x + a.dir * (W + 80) * k;
        ctx.fillStyle = 'rgba(25,25,35,0.75)';
        ctx.beginPath();
        ctx.ellipse(x, a.y, 16, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - a.dir * 30 - 9, a.y - 2, 18, 3);
        ctx.fillRect(x - 20, a.y - 10, 40, 2);
      } else {
        const y = a.y - k * (H + 120);
        ctx.fillStyle = 'rgba(255,170,60,0.55)';
        ctx.beginPath();
        ctx.moveTo(a.x - 4, y + 18);
        ctx.lineTo(a.x + 4, y + 18);
        ctx.lineTo(a.x, y + 50);
        ctx.fill();
        ctx.fillStyle = '#E8EDF3';
        ctx.fillRect(a.x - 4, y - 14, 8, 30);
      }
    }
  }

  /** A short circle of light on a captured platform, as if the flashlight caught it. */
  private drawSpots(toY: (y: number) => number, dt: number): void {
    if (!this.spots.length) return;
    const ctx = this.ctx;
    this.spots = this.spots.filter((s) => (s.t += dt) < 0.35);
    for (const s of this.spots) {
      const k = s.t / 0.35;
      const y = toY(s.y) + 7;
      ctx.globalAlpha = 0.5 * (1 - k);
      const g = ctx.createRadialGradient(s.x, y, 4, s.x, y, 46 + 20 * k);
      g.addColorStop(0, s.color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(s.x, y, 50 + 20 * k, 24 + 8 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Red vignette at the edges when the debt wave is close (smooth, never flashing). */
  private drawDanger(sim: Sim, W: number, H: number): void {
    if (!sim.waveActive || sim.dead) {
      this.danger = 0;
      return;
    }
    const gap = sim.hero.y - sim.waveY;
    const k = Math.max(0, Math.min(1, 1 - (gap - 60) / 220));
    this.danger = k;
    if (k <= 0) return;
    const ctx = this.ctx;
    const a = 0.32 * k;
    const side = ctx.createLinearGradient(0, 0, 40, 0);
    side.addColorStop(0, `rgba(200,20,40,${a})`);
    side.addColorStop(1, 'rgba(200,20,40,0)');
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, 40, H);
    const side2 = ctx.createLinearGradient(W, 0, W - 40, 0);
    side2.addColorStop(0, `rgba(200,20,40,${a})`);
    side2.addColorStop(1, 'rgba(200,20,40,0)');
    ctx.fillStyle = side2;
    ctx.fillRect(W - 40, 0, 40, H);
  }

  /** 0..1, how close the wave is (read by the music). */
  danger = 0;

  // ---------- Platforms ----------

  private drawPlatform(p: Platform, sy: number, time: number): void {
    const ctx = this.ctx;
    const pw = gameConfig.platform.width;
    const ph = gameConfig.platform.height;
    let x = p.x - pw / 2;
    let alpha = 1;
    if (p.kind === 'white' && p.whiteT < 1) alpha = Math.max(0, p.whiteT);

    let fill: string;
    let edge: string;
    let icon: ColorId | 'red' | null = null;

    const warnK = p.phase === 'warn' ? 1 - p.phaseT / p.phaseLen : 0;
    if (p.phase === 'warn' && !this.reducedEffects) {
      x += Math.sin(time * 55 + p.id) * (1 + warnK * 1.6);
    }

    if (p.kind === 'red' || p.phase === 'red') {
      fill = palette.red;
      edge = palette.redEdge;
      icon = 'red';
    } else if (p.kind === 'color' && p.color) {
      fill = palette.platform[p.color];
      edge = palette.platformEdge[p.color];
      icon = p.color;
    } else if (p.kind === 'white') {
      fill = palette.white;
      edge = palette.whiteEdge;
    } else {
      fill = palette.start;
      edge = palette.startEdge;
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = edge;
    roundRect(ctx, x, sy, pw, ph + 4, 7);
    ctx.fill();
    ctx.fillStyle = fill;
    roundRect(ctx, x, sy, pw, ph, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(ctx, x + 5, sy + 2, pw - 10, 3, 2);
    ctx.fill();

    if (p.kind === 'red') {
      ctx.save();
      roundRect(ctx, x, sy, pw, ph, 7);
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let i = -2; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 12, sy + ph);
        ctx.lineTo(x + i * 12 + 6, sy + ph);
        ctx.lineTo(x + i * 12 + 12, sy);
        ctx.lineTo(x + i * 12 + 6, sy);
        ctx.fill();
      }
      ctx.restore();
    }

    // Capture: a wave of light runs across the platform as it turns white.
    if (p.kind === 'white' && p.whiteAge < 0.4) {
      const k = p.whiteAge / 0.4;
      ctx.save();
      roundRect(ctx, x, sy, pw, ph, 7);
      ctx.clip();
      const wx = x - 20 + (pw + 40) * k;
      const grad = ctx.createLinearGradient(wx - 18, 0, wx + 18, 0);
      grad.addColorStop(0, 'rgba(255,255,240,0)');
      grad.addColorStop(0.5, 'rgba(255,255,240,0.95)');
      grad.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(wx - 18, sy, 36, ph);
      ctx.restore();
      ctx.fillStyle = `rgba(255,255,240,${0.5 * (1 - k)})`;
      roundRect(ctx, x - 4 * k, sy - 3 * k, pw + 8 * k, ph + 6 * k, 9);
      ctx.fill();
    }

    if (warnK > 0) {
      // The red outline glows up during the warning (layered strokes instead of blur).
      ctx.strokeStyle = `rgba(255,50,60,${0.15 + 0.35 * warnK})`;
      ctx.lineWidth = 6 + warnK * 3;
      roundRect(ctx, x - 1, sy - 1, pw + 2, ph + 6, 8);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,60,70,${0.3 + 0.7 * warnK})`;
      ctx.lineWidth = 2 + warnK * 1.5;
      ctx.stroke();
    }

    if (this.colorblind && icon && icon !== 'red') this.drawPattern(icon, x, sy, pw, ph);
    if (icon) drawIcon(ctx, icon, x + pw / 2, sy + ph / 2, this.colorblind ? 6.5 : 5, 'rgba(255,255,255,0.95)');
    ctx.globalAlpha = 1;
  }

  private drawPattern(color: ColorId, x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.save();
    roundRect(ctx, x, y, w, h, 7);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    if (color === 'yellow') {
      for (let i = 6; i < w; i += 9) {
        ctx.beginPath();
        ctx.arc(x + i, y + h / 2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (color === 'blue') {
      for (let i = -h; i < w; i += 8) {
        ctx.beginPath();
        ctx.moveTo(x + i, y + h);
        ctx.lineTo(x + i + 3, y + h);
        ctx.lineTo(x + i + 3 + h, y);
        ctx.lineTo(x + i + h, y);
        ctx.fill();
      }
    } else {
      for (let i = 4; i < w; i += 8) ctx.fillRect(x + i, y, 2.5, h);
    }
    ctx.restore();
  }

  private drawWave(sim: Sim, toY: (y: number) => number, W: number, H: number): void {
    const top = toY(sim.waveY);
    if (top > H + 30) return;
    const ctx = this.ctx;
    const t = sim.time;
    const g = ctx.createLinearGradient(0, top - 30, 0, top + 80);
    g.addColorStop(0, 'rgba(120,10,30,0)');
    g.addColorStop(0.3, 'rgba(120,10,30,0.55)');
    g.addColorStop(1, 'rgba(60,4,18,0.96)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) {
      ctx.lineTo(x, top + Math.sin(x * 0.05 + t * 3) * 5 + Math.sin(x * 0.11 - t * 2) * 3);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    if (this.reducedEffects) return;
    // Bills and receipts drifting inside the wave.
    for (let i = 0; i < 7; i++) {
      const x = ((i * 53 + t * (12 + i * 3)) % (W + 40)) - 20;
      const y = top + 26 + ((i * 37) % 60) + Math.sin(t * 1.5 + i) * 6;
      if (y > H + 10) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(t + i * 2) * 0.5);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#f3e3e3';
      ctx.fillRect(-7, -9, 14, 18);
      ctx.fillStyle = '#7a1a2a';
      ctx.fillRect(-5, -6, 10, 1.4);
      ctx.fillRect(-5, -2, 8, 1.4);
      ctx.fillRect(-5, 2, 9, 1.4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawParticles(toY: (y: number) => number): void {
    const ctx = this.ctx;
    const P = this.particles;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (P.life[i] <= 0) continue;
      const a = P.life[i] / P.max[i];
      const sx = P.x[i];
      const sy = toY(P.y[i]);
      ctx.globalAlpha = a;
      if (P.kind[i] === 1) {
        drawMoney(ctx, sx, sy, P.rot[i], this.moneyTier);
      } else if (P.kind[i] === 2) {
        ctx.fillStyle = '#FFE58A';
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBills(dt: number): void {
    if (!this.bills.length) return;
    const ctx = this.ctx;
    let arrived = false;
    this.bills = this.bills.filter((b) => {
      b.t += dt;
      if (b.t < 0) return true;
      const k = Math.min(1, b.t / b.dur);
      const e = k * k * (3 - 2 * k);
      const u = 1 - e;
      const x = u * u * b.x0 + 2 * u * e * b.cx + e * e * WALLET.x;
      const y = u * u * b.y0 + 2 * u * e * b.cy + e * e * WALLET.y;
      ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
      drawMoney(ctx, x, y, b.rot + k * 4, this.moneyTier);
      if (k >= 1) arrived = true;
      return k < 1;
    });
    ctx.globalAlpha = 1;
    if (arrived) this.onBillArrive();
  }

  private drawHero(sim: Sim, x: number, footY: number, dt: number, tier: number): void {
    const ctx = this.ctx;
    const hero = sim.hero;
    const target = lightRgb(sim.light);
    const k = Math.min(1, dt / 0.12); // flashlight color changes in about 0.12 s
    for (let i = 0; i < 3; i++) this.flashlightColor[i] += (target[i] - this.flashlightColor[i]) * k;
    const [r, g, b] = this.flashlightColor.map(Math.round);
    const rgb = `${r},${g},${b}`;

    // The rig does the knees, squash and stretch; a light global squash keeps the impact.
    const land = Math.exp(-hero.sinceLand * 18);
    const stretch = Math.min(0.06, Math.max(0, hero.vy) / 12000);
    const sy = 1 - land * 0.06 + stretch - this.impulse * 0.1;
    const sx = 1 + land * 0.05 - stretch * 0.5 + this.impulse * 0.08;
    const outfit = outfitFromMask(this.ownedMask);
    const pose: HeroPose = {
      tier,
      light: rgb,
      neutral: sim.light === null,
      sinceLand: hero.sinceLand,
      vy: hero.vy,
      vx: hero.vx,
      dead: sim.dead,
      // During a freeze the body keeps breathing and blinking on the real clock.
      time: sim.time + this.clock * (this.cine ? 1 : 0),
      face: this.faceFor(sim),
      gesture: this.menuGesture ?? undefined,
      outfit,
      styles: this.styles,
      noBeam: true,
    };
    const rig = heroRig(pose);
    this.heroXf = sim.dead ? null : { x, y: footY, sx, sy, facing: hero.facing, rig };

    // The beam starts at the flashlight lens and follows its angle.
    // A longer held light (a blade, a torch, a fireball) starts the beam at its own tip.
    const reach = torchReach(this.styles.torch ? STYLES[this.styles.torch] : undefined);
    const tipX = x + (rig.torchTip.x + Math.cos(rig.torchAngle) * reach) * sx * hero.facing;
    const tipY = footY + (rig.torchTip.y + Math.sin(rig.torchAngle) * reach) * sy;
    const beamAngle = hero.facing > 0 ? rig.torchAngle : Math.PI - rig.torchAngle;
    if (!sim.dead) this.drawBeam(sim, tipX, tipY, beamAngle, rgb, outfit.newTorch, dt);

    // The fiery trail of a combo (see fireTrail.ts): behind the hero, stronger with the multiplier.
    const combo = sim.dead || this.reducedEffects || sim.tutorial || perf.effective >= 2 ? 0 : comboLevel(sim.multiplier);
    this.fireTrail.emit(dt * (perf.effective >= 1 ? 0.5 : 1), x, footY - 16 * sy, hero.vx, hero.vy, combo);
    this.fireTrail.draw(ctx, combo, x, footY - 28 * sy);
    if (this.role && !sim.dead && !this.reducedEffects) {
      ctx.save();
      ctx.translate(x, footY - 30 * sy);
      ctx.scale(sy, sy);
      drawGovAura(ctx, this.role, this.clock, 0, perf.effective >= 1);
      ctx.restore();
    }
    // The moment of death: the hero is replaced by his own shards (see deathFx.ts).
    if (sim.dead && !this.reducedEffects && !this.deathFxDone) {
      this.deathFxDone = true;
      const k = this.scale * this.dpr;
      const SW = 92;
      const SH = 112;
      const snap = document.createElement('canvas');
      snap.width = Math.max(1, Math.ceil(SW * k));
      snap.height = Math.max(1, Math.ceil(SH * k));
      const sg = snap.getContext('2d');
      if (sg) {
        sg.setTransform(k, 0, 0, k, 0, 0);
        sg.translate(SW / 2, SH - 10);
        sg.scale(sx * hero.facing, sy);
        drawHeroBody(sg, pose, rig);
        this.deathFx.start(snap, k, SW, SH, x, footY - 30, this.lastDeathReason, perf.effective);
      } else this.deathFx.start(null, k, SW, SH, x, footY - 30, this.lastDeathReason, perf.effective);
    }
    const shielded = sim.light === 'red' && !sim.dead;
    if (shielded) this.drawShieldGlow(pose, rig, x, footY, sx * hero.facing, sy, sim.time, dt, 'halo');
    if (!this.deathFx.hidesHero) {
      ctx.save();
      ctx.translate(x, footY);
      if (sim.dead) ctx.rotate(hero.spin);
      ctx.scale(sx * hero.facing, sy);
      drawHeroBody(ctx, pose, rig);
      ctx.restore();
    }
    if (shielded) this.drawShieldGlow(pose, rig, x, footY, sx * hero.facing, sy, sim.time, dt, 'rim');

    // The weekly leader's crown floats above the head, above any cap or helmet.
    if ((this.crown || this.role === 'mayor') && !sim.dead) {
      const up = outfit.suit ? 8 : outfit.cap ? 3 : 0;
      const cx = x + rig.points.headTop.x * sx * hero.facing;
      const cy = footY + rig.points.headTop.y * sy - CROWN_LIFT_SIDE - 4 - up + crownBob(this.clock * 1 + sim.time);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(hero.vx * 0.0004);
      ctx.scale(1.3, 1.3);
      drawCrown(ctx, this.clock, this.reducedEffects, this.role === 'mayor' ? 'mayor' : 'leader');
      ctx.restore();
    }

    // Lens flare and a color-change ring at the flashlight.
    if (!sim.dead) {
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 12);
      glow.addColorStop(0, `rgba(${rgb},${sim.light ? 0.9 : 0.35})`);
      glow.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(tipX - 12, tipY - 12, 24, 24);
      if (sim.light && !this.reducedEffects) {
        const rot = this.clock * 0.8;
        ctx.strokeStyle = `rgba(${rgb},0.6)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 2; i++) {
          const a = rot + (i * Math.PI) / 2;
          ctx.moveTo(tipX - Math.cos(a) * 11, tipY - Math.sin(a) * 11);
          ctx.lineTo(tipX + Math.cos(a) * 11, tipY + Math.sin(a) * 11);
        }
        ctx.stroke();
      }
      this.rings = this.rings.filter((ring) => (ring.t += dt) < 0.4);
      for (const ring of this.rings) {
        const rk = ring.t / 0.4;
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = 1 - rk;
        ctx.lineWidth = 3 * (1 - rk) + 0.5;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 4 + 26 * rk, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (this.flash > 0) {
      // Snap flash: a bright burst around the whole figure.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(x, footY - 28, 4, x, footY - 28, 50);
      fg.addColorStop(0, `rgba(255,250,220,${0.75 * this.flash})`);
      fg.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(x - 50, footY - 78, 100, 100);
      ctx.restore();
    }
  }

  /** Volumetric flashlight beam: a soft wide cone, a bright core and dust glittering in it. */
  private drawBeam(sim: Sim, x: number, y: number, dir: number, rgb: string, newTorch: boolean, dt: number): void {
    const ctx = this.ctx;
    const on = sim.light !== null;
    const len = (newTorch ? 125 : 100) * (1 + (sim.multiplier - 1) * 0.15);
    const intensity = on ? 1 : 0.35;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dir);
    ctx.globalCompositeOperation = 'lighter';
    const cone = (spread: number, alpha: number): void => {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, len);
      g.addColorStop(0, `rgba(${rgb},${alpha * intensity})`);
      g.addColorStop(0.6, `rgba(${rgb},${alpha * 0.35 * intensity})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(len, -len * spread);
      ctx.quadraticCurveTo(len * 1.08, 0, len, len * spread);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fill();
    };
    cone(0.42, 0.22);
    cone(0.2, 0.32);
    cone(0.07, 0.5);
    if (on && !this.reducedEffects) {
      // Dust motes drifting through the light.
      for (const m of this.beamMotes) {
        m.u += dt * 0.12 * m.s;
        if (m.u > 1) {
          m.u = 0.05;
          m.v = Math.random() * 2 - 1;
        }
        const px = m.u * len * 0.9;
        const py = m.v * px * 0.38 + Math.sin(this.clock * 2 + m.s * 9) * 2;
        ctx.globalAlpha = (1 - m.u) * 0.9;
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.fillRect(px, py, 1.4 * m.s + 0.6, 1.4 * m.s + 0.6);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private glowCanvas: HTMLCanvasElement | null = null;
  private embers: { x: number; y: number; vx: number; vy: number; t: number; max: number }[] = [];

  /**
   * The red shield: a dense but airy glow that hugs the hero's silhouette.
   * The hero is drawn once into a small offscreen canvas and tinted red; copies of that
   * silhouette around the figure form a soft thick halo (no blur filters). A thin bright
   * rim on top, slow breathing and a few rising embers make it feel alive.
   */
  private drawShieldGlow(
    pose: HeroPose,
    rig: Rig,
    x: number,
    footY: number,
    sx: number,
    sy: number,
    t: number,
    dt: number,
    layer: 'halo' | 'rim',
  ): void {
    const ctx = this.ctx;
    const k = this.scale * this.dpr;
    const BW = 120;
    const BH = 130;
    if (layer === 'halo') {
      if (!this.glowCanvas) this.glowCanvas = document.createElement('canvas');
      const c = this.glowCanvas;
      const w = Math.ceil(BW * k);
      const h = Math.ceil(BH * k);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const g = c.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, w, h);
      g.setTransform(k, 0, 0, k, 0, 0);
      g.translate(BW / 2, BH - 18);
      g.scale(sx, sy);
      drawHeroBody(g, pose, rig);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#ff3b4f';
      g.fillRect(0, 0, w, h);
    }
    const c = this.glowCanvas;
    if (!c) return;
    const ox = x - BW / 2;
    const oy = footY - (BH - 18);
    const breathe = 0.85 + 0.15 * Math.sin(t * 4.5) + this.auraPulse * 0.6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (layer === 'halo') {
      // Soft body of light behind the figure.
      const core = ctx.createRadialGradient(x, footY - 30, 4, x, footY - 30, 48 + this.auraPulse * 12);
      core.addColorStop(0, `rgba(255,60,80,${0.16 * breathe})`);
      core.addColorStop(1, 'rgba(255,60,80,0)');
      ctx.fillStyle = core;
      ctx.fillRect(x - 64, footY - 94, 128, 128);
      // Thick soft outline: silhouette copies on two rings.
      const rings: [number, number][] = this.reducedEffects ? [[3, 0.22]] : [[2.4, 0.26], [4.8, 0.13], [7.5, 0.06]];
      for (const [r, a] of rings) {
        ctx.globalAlpha = Math.min(1, a * breathe);
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 + t * 0.6;
          ctx.drawImage(c, ox + Math.cos(ang) * r, oy + Math.sin(ang) * r - (r > 4 ? 1.5 : 0), BW, BH);
        }
      }
      ctx.globalAlpha = 1;
    } else {
      // Bright thin rim on top of the hero.
      ctx.globalAlpha = 0.18 * breathe;
      ctx.drawImage(c, ox, oy, BW, BH);
      ctx.globalAlpha = 1;
      if (!this.reducedEffects) {
        if (Math.random() < dt * 14) {
          this.embers.push({ x: x + (Math.random() - 0.5) * 30, y: footY - 10 - Math.random() * 46, vx: (Math.random() - 0.5) * 10, vy: -(18 + Math.random() * 22), t: 0, max: 0.8 + Math.random() * 0.6 });
        }
        this.embers = this.embers.filter((e) => (e.t += dt) < e.max);
        for (const e of this.embers) {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          const a = 1 - e.t / e.max;
          const r = 3.2 * a + 0.8;
          const gg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
          gg.addColorStop(0, `rgba(255,190,190,${0.9 * a})`);
          gg.addColorStop(1, 'rgba(255,60,80,0)');
          ctx.fillStyle = gg;
          ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
        }
      }
      // A blocked hit: a quick flare outward.
      if (this.auraPulse > 0) {
        ctx.strokeStyle = `rgba(255,140,150,${this.auraPulse * 0.8})`;
        ctx.lineWidth = 2.5 * this.auraPulse;
        ctx.beginPath();
        ctx.ellipse(x, footY - 30, 26 + (1 - this.auraPulse) * 30, 34 + (1 - this.auraPulse) * 30, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * A glowing ribbon behind the hero in the color of the flashlight. Points age by time,
   * so the tail has the same length on 60 and 144 Hz screens. It gets longer and brighter
   * with the combo multiplier.
   */
  private drawTrail(sim: Sim, x: number, worldY: number, toY: (y: number) => number, dt: number): void {
    if (this.reducedEffects || sim.dead || this.cine) {
      this.trail.length = 0;
      return;
    }
    const life = 0.26 + Math.min(3, sim.multiplier - 1) * 0.07;
    for (const p of this.trail) p.age += dt;
    while (this.trail.length && this.trail[0].age > life) this.trail.shift();
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.abs(last.x - x) + Math.abs(last.y - (worldY + 26)) > 1.5) {
      this.trail.push({ x, y: worldY + 26, age: 0 });
    }
    if (this.trail.length < 2) return;
    const ctx = this.ctx;
    const rgb = this.flashlightColor.map(Math.round).join(',');
    const on = sim.light !== null;
    const strength = (on ? 0.5 : 0.14) + Math.min(3, sim.multiplier - 1) * 0.1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // Two passes: a wide soft glow and a thin bright core.
    for (const [wid, al] of [[16, 0.4], [6, 1]] as const) {
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        const k = 1 - b.age / life;
        ctx.strokeStyle = `rgba(${rgb},${strength * al * k * k})`;
        ctx.lineWidth = wid * (0.25 + 0.75 * k);
        ctx.beginPath();
        ctx.moveTo(a.x, toY(a.y));
        ctx.lineTo(b.x, toY(b.y));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** A puff of glowing dust that rises from a captured platform and drifts apart. */
  private drawWaves(toY: (y: number) => number, dt: number): void {
    if (!this.waves.length) return;
    const ctx = this.ctx;
    this.waves = this.waves.filter((w) => (w.t += dt) < 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const w of this.waves) {
      const sy = toY(w.y);
      for (const d of w.dust) {
        const k = w.t / d.life;
        if (k >= 1) continue;
        const ease = 1 - (1 - k) * (1 - k);
        const px = w.x + d.dx + d.vx * ease;
        const py = sy - 2 - d.vy * ease * 1.6;
        const rad = d.r * (1 + k * 1.6);
        const al = 0.55 * (1 - k);
        const g = ctx.createRadialGradient(px, py, 0, px, py, rad * 2);
        g.addColorStop(0, `rgba(${w.rgb},${al})`);
        g.addColorStop(1, `rgba(${w.rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(px - rad * 2, py - rad * 2, rad * 4, rad * 4);
      }
    }
    ctx.restore();
  }

  /** The whole field flashes softly in the platform color on every new combo step. */
  private drawPulse(W: number, H: number, dt: number): void {
    const p = this.pulse;
    if (!p) return;
    p.t += dt;
    if (p.t > 0.5) {
      this.pulse = null;
      return;
    }
    const k = 1 - p.t / 0.5;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, `rgba(${p.rgb},0)`);
    g.addColorStop(1, `rgba(${p.rgb},${0.3 * k * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  private drawSparkles(dt: number): void {
    if (!this.sparkles.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.sparkles = this.sparkles.filter((p) => (p.t += dt) < 0.6);
    for (const p of this.sparkles) {
      const k = p.t / 0.6;
      const r = 3.5 * (1 - Math.abs(k - 0.5) * 2);
      ctx.strokeStyle = `rgba(255,245,200,${1 - k})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y);
      ctx.lineTo(p.x + r, p.y);
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x, p.y + r);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A clothing item hovering over a platform: touch the platform to put it on early. */
  private paintPet(toY: (y: number) => number): void {
    if (!this.pet) return;
    const v = this.petFollower.view();
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(v.x, toY(v.lift));
    ctx.scale(v.facing * 1.2, 1.2);
    drawPet(ctx, this.pet, { t: this.clock, mode: v.mode, phase: v.phase });
    ctx.restore();
  }

  /** A gift box in the color of the offered set: touch the platform to take the cosmetic. */
  /** The candidate's ring: a golden ring with a blue diamond turning above the platform, in a warm glow. */
  private drawRingBox(x: number, sy: number, t: number): void {
    const ctx = this.ctx;
    const y = sy - 22 + Math.sin(t * 3) * 2.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
    g.addColorStop(0, 'rgba(255,225,120,0.9)');
    g.addColorStop(0.5, 'rgba(255,170,60,0.3)');
    g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.globalAlpha = 0.6 + 0.25 * Math.sin(t * 4);
    ctx.fillStyle = g;
    ctx.fillRect(x - 30, y - 30, 60, 60);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    // The band turns around its vertical axis: its width breathes between a circle and a thin line.
    const turn = Math.cos(t * 2.4);
    ctx.scale(0.45 + 0.55 * Math.abs(turn), 1);
    ctx.beginPath();
    ctx.arc(0, 2, 7.2, 0, Math.PI * 2);
    ctx.lineWidth = 3.4;
    const band = ctx.createLinearGradient(-7, -5, 7, 9);
    band.addColorStop(0, '#FFF3B0');
    band.addColorStop(0.5, '#E8B53A');
    band.addColorStop(1, '#9A6A12');
    ctx.strokeStyle = band;
    ctx.stroke();
    ctx.restore();
    // The diamond on top.
    ctx.save();
    ctx.translate(x, y - 7);
    ctx.beginPath();
    ctx.moveTo(0, -5.4);
    ctx.lineTo(4.4, -1);
    ctx.lineTo(0, 4.2);
    ctx.lineTo(-4.4, -1);
    ctx.closePath();
    const gem = ctx.createLinearGradient(-4, -5, 4, 4);
    gem.addColorStop(0, '#FFFFFF');
    gem.addColorStop(0.5, '#8FD3FF');
    gem.addColorStop(1, '#3FA0E8');
    ctx.fillStyle = gem;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#2A5A8A';
    ctx.stroke();
    ctx.restore();
    // A flash that crosses the diamond now and then.
    const k = (t * 0.8) % 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * Math.sin(k * Math.PI)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 6 * Math.sin(k * Math.PI), y - 8);
    ctx.lineTo(x + 6 * Math.sin(k * Math.PI), y - 8);
    ctx.moveTo(x, y - 14 * Math.sin(k * Math.PI) / 1.5 - 2);
    ctx.lineTo(x, y + 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawDropBox(x: number, sy: number, t: number): void {
    const ctx = this.ctx;
    const y = sy - 20 + Math.sin(t * 3.2) * 2.6;
    const c = this.dropColor;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 4);
    ctx.fillStyle = g;
    ctx.fillRect(x - 26, y - 26, 52, 52);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2.1) * 0.08);
    ctx.beginPath();
    ctx.roundRect(-8.5, -7, 17, 14, 3);
    const bg = ctx.createLinearGradient(0, -7, 0, 7);
    bg.addColorStop(0, tone(c, 0.3));
    bg.addColorStop(1, tone(c, -0.35));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = tone(c, -0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-1.3, -7, 2.6, 14);
    ctx.fillRect(-8.5, -1.3, 17, 2.6);
    ctx.fillStyle = '#fff';
    ctx.font = '700 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', 0, -2.6);
    ctx.restore();
    if (Math.random() < 0.08 && !this.reducedEffects) this.sparkles.push({ x: x + (Math.random() - 0.5) * 26, y: y + (Math.random() - 0.5) * 18, t: 0 });
  }

  private drawPickup(item: Item, x: number, sy: number, t: number): void {
    const ctx = this.ctx;
    const bob = Math.sin(t * 3) * 2.5;
    const y = sy - 16 + bob;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, 20);
    g.addColorStop(0, 'rgba(255,230,140,0.55)');
    g.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 20, y - 20, 40, 40);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2) * 0.15);
    ctx.scale(1.25, 1.25);
    drawItem(ctx, item);
    ctx.restore();
    if (Math.random() < 0.05 && !this.reducedEffects) this.sparkles.push({ x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 16, t: 0 });
  }

  /**
   * Light floating particles that give each scene its mood: dust in the yard, fluff in the
   * housing estates, fireflies in the garden, gold sparks in the palace, sea spray, star dust.
   */
  private drawMotes(tier: number, W: number, H: number, dt: number): void {
    if (this.reducedEffects) return;
    const kind = tier === 0 ? 0 : tier <= 3 ? 1 : tier <= 5 ? 2 : tier <= 10 ? 3 : tier === 11 ? 4 : 5;
    const cap = this.lowQuality ? 10 : 22;
    if (this.motes.length < cap && Math.random() < dt * 6) {
      const side = Math.random();
      this.motes.push({
        x: side < 0.4 ? Math.random() * 70 : side < 0.8 ? W - Math.random() * 70 : Math.random() * W,
        y: kind === 1 || kind === 4 ? -6 : kind === 3 || kind === 5 ? H + 6 : Math.random() * H,
        vx: (Math.random() - 0.5) * (kind === 1 ? 30 : 10),
        vy: kind === 1 ? 14 + Math.random() * 10 : kind === 4 ? 20 : kind === 3 || kind === 5 ? -(10 + Math.random() * 14) : (Math.random() - 0.5) * 8,
        life: 0,
        max: 5 + Math.random() * 5,
        size: 0.8 + Math.random() * 1.6,
        kind,
        seed: Math.random() * 10,
      });
    }
    const ctx = this.ctx;
    ctx.save();
    this.motes = this.motes.filter((m) => (m.life += dt) < m.max && m.y > -20 && m.y < H + 20);
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(this.clock * 0.8 + m.seed) * 6) * dt;
      m.y += m.vy * dt;
      const fade = Math.min(1, m.life / 0.8, (m.max - m.life) / 0.8);
      if (m.kind === 2 || m.kind === 3 || m.kind === 5) {
        // Glowing: fireflies pulse slowly, sparks twinkle gently.
        ctx.globalCompositeOperation = 'lighter';
        const tw = 0.55 + 0.45 * Math.sin(this.clock * (m.kind === 2 ? 1.6 : 2.4) + m.seed);
        const color = m.kind === 2 ? '255,236,120' : m.kind === 3 ? '255,215,120' : '200,220,255';
        const r = m.size * (m.kind === 2 ? 4 : 3);
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
        g.addColorStop(0, `rgba(${color},${0.8 * tw * fade})`);
        g.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.globalAlpha = fade * (m.kind === 0 ? 0.35 : 0.6);
        ctx.fillStyle = m.kind === 0 ? '#c9c2b2' : m.kind === 4 ? '#e9fbff' : '#ffffff';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  private faceFor(sim: Sim): Face {
    if (sim.dead) return 'scared';
    if (sim.light === 'red') return 'squint';
    const h = sim.hero;
    const danger = sim.platforms.some((p) => p.phase === 'warn' && Math.abs(p.y - h.y) < 150 && Math.abs(p.x - h.x) < 120);
    if (danger) return 'scared';
    if (sim.multiplier >= 3) return 'grin';
    return 'normal';
  }

  private drawFloaters(toY: (y: number) => number, dt: number): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += 70 * dt;
      const k = 1 - f.life / f.max;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.4);
      ctx.font = `800 ${Math.round((f.big ? 22 : 18) * pop)}px 'Rubik Variable', Rubik, system-ui, sans-serif`;
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(f.text, f.x + 1, toY(f.y) + 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, toY(f.y));
    }
    ctx.globalAlpha = 1;
  }

  /** Adaptive quality: on a slow device particles are halved (the level is chosen by core/perf.ts). */
  private trackQuality(_dt: number): void {
    // The level comes from the shared monitor (core/perf.ts), which watches the real frame times.
    const low = perf.effective >= 1;
    if (low !== this.lowQuality) {
      this.lowQuality = low;
      this.particles.cap = low ? MAX_PARTICLES / 2 : MAX_PARTICLES;
      this.particles.next %= this.particles.cap;
    }
  }
}

function easeInOut(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

/**
 * Money changes on every tier: copper, silver, small notes, big notes, a bundle, a fat bundle,
 * an envelope, gold coins, a gold bar, a briefcase, a diamond, a gold card, a space crystal.
 */
function drawMoney(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, tier: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const coin = (fill: string, rim: string, r: number): void => {
    const squeeze = Math.abs(Math.cos(rot * 2)) * 0.8 + 0.2;
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * squeeze, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.72, r * 0.72 * squeeze, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const note = (w: number, h: number, fill: string, mark: string): void => {
    ctx.fillStyle = fill;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = mark;
    ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, 1);
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.28, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (Math.min(12, Math.max(0, tier))) {
    case 0:
      coin('#C77B3A', '#8E5320', 3.8);
      break;
    case 1:
      coin('#D9DDE3', '#9AA3AF', 4.2);
      break;
    case 2:
      note(10, 6, '#A6D9A0', '#5E9A5A');
      break;
    case 3:
      note(13, 7, '#7FCF8A', '#3E8C4C');
      break;
    case 4:
      note(13, 7, '#7FCF8A', '#3E8C4C');
      ctx.fillStyle = '#E8C060';
      ctx.fillRect(-1.5, -3.5, 3, 7);
      break;
    case 5:
      ctx.fillStyle = '#4E9A5A';
      ctx.fillRect(-7, -1, 14, 5);
      note(14, 5, '#7FCF8A', '#3E8C4C');
      ctx.fillStyle = '#E8C060';
      ctx.fillRect(-1.5, -2.5, 3, 7.5);
      break;
    case 6:
      ctx.fillStyle = '#F4EAD2';
      ctx.fillRect(-7, -4.5, 14, 9);
      ctx.strokeStyle = '#C9B98F';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-7, -4.5);
      ctx.lineTo(0, 0.5);
      ctx.lineTo(7, -4.5);
      ctx.stroke();
      ctx.fillStyle = '#C8263C';
      ctx.beginPath();
      ctx.arc(0, 0.6, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 7:
      coin('#FFD640', '#C99A2E', 4.6);
      break;
    case 8:
      ctx.fillStyle = '#C99A2E';
      ctx.beginPath();
      ctx.moveTo(-7, 3);
      ctx.lineTo(7, 3);
      ctx.lineTo(5, -3);
      ctx.lineTo(-5, -3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#FFE58A';
      ctx.fillRect(-4, -2.5, 8, 2);
      break;
    case 9:
      ctx.fillStyle = '#2A2D36';
      ctx.fillRect(-7.5, -4.5, 15, 9);
      ctx.fillStyle = '#C7CCD6';
      ctx.fillRect(-2.5, -6.5, 5, 2);
      ctx.fillStyle = '#E8C060';
      ctx.fillRect(-1, -1, 2, 2);
      break;
    case 10:
      ctx.fillStyle = '#BFF3FF';
      ctx.beginPath();
      ctx.moveTo(-5, -2);
      ctx.lineTo(-2.5, -4.5);
      ctx.lineTo(2.5, -4.5);
      ctx.lineTo(5, -2);
      ctx.lineTo(0, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(-1.5, -4, 1.4, 3);
      break;
    case 11:
      ctx.fillStyle = '#D9A520';
      ctx.fillRect(-7, -4.5, 14, 9);
      ctx.fillStyle = '#FFE58A';
      ctx.fillRect(-5.5, -2.5, 3.5, 2.5);
      ctx.fillStyle = '#8A5A00';
      ctx.fillRect(-7, 1.5, 14, 1.2);
      break;
    default:
      ctx.fillStyle = '#B9A6FF';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(3.5, 0);
      ctx.lineTo(0, 6);
      ctx.lineTo(-3.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(-0.6, -4, 1.2, 4);
  }
  ctx.restore();
}

/** '#RRGGBB' -> 'r,g,b' for rgba() strings. */
function hexRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function lightRgb(light: LightId | null): [number, number, number] {
  switch (light) {
    case 'yellow':
      return [255, 214, 64];
    case 'blue':
      return [80, 160, 255];
    case 'green':
      return [80, 220, 120];
    case 'red':
      return [255, 70, 80];
    default:
      return [235, 235, 225];
  }
}

export function drawIcon(
  ctx: CanvasRenderingContext2D,
  icon: ColorId | 'red',
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (icon === 'yellow') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  } else if (icon === 'blue') {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.8, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.8, cy);
  } else if (icon === 'green') {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r * 0.8);
    ctx.lineTo(cx - r, cy + r * 0.8);
  } else {
    ctx.moveTo(cx - r * 0.85, cy - r * 0.8);
    ctx.lineTo(cx + r * 0.85, cy - r * 0.8);
    ctx.lineTo(cx + r * 0.85, cy);
    ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 0.8, cx, cy + r * 1.05);
    ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.8, cx - r * 0.85, cy);
  }
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
