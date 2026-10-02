import { gameConfig, type ColorId, type LightId } from '../core/gameConfig';
import type { Sim } from '../core/sim';
import type { Platform, SimEvent } from '../core/types';
import { ru } from '../i18n/ru';
import { drawHeroBody, drawItem, outfitChanges, PICKABLE, TORCH_TIP, type Face, type Gesture, type Item, type Outfit } from './hero';
import { palette } from './palette';
import { paintScene, paintSky } from './scenes';

const MAX_PARTICLES = 220;
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
}

interface Cine {
  t: number;
  dur: number;
  fromScene: number;
  toScene: number;
  anchors: [number, number][];
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
  private skies = new Map<number, HTMLCanvasElement>();
  private tiles = new Map<number, HTMLCanvasElement>();
  private ambient: Ambient[] = [];
  private ambientTimer = 0;
  private sceneTier = 0;
  private flashlightColor: [number, number, number] = [235, 235, 225];
  private auraPulse = 0;
  private frameTimes: number[] = [];
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
  private highlights: { anchor: [number, number]; t: number }[] = [];
  private sparkles: { x: number; y: number; t: number }[] = [];
  private prewornItems = new Set<Item>();
  private extra: Partial<Outfit> = {};
  private rings: { t: number; color: string }[] = [];
  private trail: { x: number; y: number }[] = [];
  private motes: Mote[] = [];
  private beamMotes: { u: number; v: number; s: number }[] = Array.from({ length: 12 }, () => ({
    u: Math.random(),
    v: Math.random() * 2 - 1,
    s: 0.3 + Math.random() * 0.7,
  }));
  /** Platform id -> clothing item lying on it (cosmetic early pickup). */
  pickups = new Map<number, Item>();
  /** Freeze-frame suit-up movie; when off, clothes change instantly with a glow. */
  cinematic = true;
  /** Menu background: draw the scene only, no platforms or hero. */
  sceneOnly = false;
  /** Called at the start of a suit-up with the new pieces (for the caption). */
  onCaption: (items: Item[]) => void = () => undefined;
  private outfitTier = 0;
  private pendingOutfit = -1;
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
    this.danger = 0;
    this.highlights.length = 0;
    this.sparkles.length = 0;
    this.prewornItems.clear();
    this.extra = {};
    this.pickups.clear();
    this.trail.length = 0;
    this.rings.length = 0;
    this.bills.length = 0;
    this.floaters.length = 0;
    this.ambient.length = 0;
    this.particles.clear();
    this.deathK = 0;
    this.items.length = 0;
    this.spots.length = 0;
    this.outfitTier = tier;
    this.pendingOutfit = -1;
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
        if (!this.reducedEffects) this.spots.push({ x: e.x, y: e.y, t: 0, color: c });
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
      } else if (e.type === 'aura') {
        this.auraPulse = 1;
      } else if (e.type === 'close') {
        this.floaters.push({ x: e.x, y: e.y + 46, life: 0.9, max: 0.9, text: ru.hud.close, color: '#FFE58A', big: true });
      } else if (e.type === 'light') {
        if (!this.reducedEffects) this.rings.push({ t: 0, color: palette.light[e.light] });
      } else if (e.type === 'tier') {
        this.moneyTier = e.tier;
        this.prewarm(Math.min(e.tier + 1, 12), H);
        this.startSuitUp(e.tier, sim);
      } else if (e.type === 'death' && !this.reducedEffects) {
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.spawn(1, sim.hero.x, sim.hero.y + 26, Math.cos(a) * 220, Math.sin(a) * 220 + 120, 1.2);
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
   * Iron-Man style: the camera moves in on the hero, the scene dims under a spotlight,
   * new pieces fly in one by one and snap on, old ones get knocked off. Then every new
   * piece keeps a soft glow for a few seconds so the player sees what changed.
   */
  private startSuitUp(tier: number, sim: Sim): void {
    const from = this.pendingOutfit >= 0 ? this.pendingOutfit : this.outfitTier;
    const changes = outfitChanges(from, tier).filter((c) => !this.prewornItems.has(c.item));
    this.pendingOutfit = tier;
    if (this.reducedEffects || !this.cinematic || !changes.length) {
      this.sceneTier = tier;
      this.finishOutfit();
      if (!this.reducedEffects) {
        for (const c of changes) this.highlights.push({ anchor: [c.anchor[0], c.anchor[1]], t: 0 });
        this.impulse = 1;
      }
      return;
    }
    const W = gameConfig.world.width;
    const lead = 0.9;
    const step = 0.85;
    changes.forEach((c, i) => {
      const left = i % 2 === 0;
      this.items.push({
        item: c.item,
        dir: 'in',
        x0: left ? -40 : W + 40,
        y0: sim.hero.y + 120 + (i % 3) * 40,
        vx: c.anchor[0],
        vy: c.anchor[1],
        ax: 0,
        ay: 0,
        t: -(lead + i * step),
        dur: 0.9,
        rot: (left ? -1 : 1) * (4 + Math.random() * 2),
        done: false,
      });
      if (c.replaces) {
        this.items.push({
          item: c.replaces,
          dir: 'out',
          x0: 0,
          y0: 0,
          vx: (left ? 1 : -1) * (70 + Math.random() * 50),
          vy: 280,
          ax: c.anchor[0],
          ay: c.anchor[1],
          t: -(lead + i * step + 0.9),
          dur: 1.4,
          rot: 0,
          done: false,
        });
      }
    });
    // Hold on the finished look before the camera returns.
    const dur = lead + (changes.length - 1) * step + 0.9 + 1.8;
    this.cine = { t: 0, dur, fromScene: this.sceneTier, toScene: tier, anchors: changes.map((c) => c.anchor) };
    this.onCaption(changes.map((c) => c.item));
  }

  private finishOutfit(): void {
    if (this.pendingOutfit >= 0) this.outfitTier = this.pendingOutfit;
    this.pendingOutfit = -1;
    this.prewornItems.clear();
    this.extra = {};
  }

  /** True if this piece is already on the hero (worn or picked up early). */
  isWorn(item: Item): boolean {
    if (this.prewornItems.has(item)) return true;
    return !outfitChanges(this.outfitTier, this.outfitTier + 1).some((c) => c.item === item);
  }

  /** Main calls this when the hero lands on a platform carrying a pickup. */
  collectPickup(item: Item, sim: Sim): void {
    const change = outfitChanges(this.outfitTier, this.outfitTier + 1).find((c) => c.item === item);
    if (!change) return;
    this.prewornItems.add(item);
    const W = gameConfig.world.width;
    this.items.push({
      item,
      dir: 'in',
      x0: sim.hero.x + (sim.hero.x < W / 2 ? 40 : -40),
      y0: sim.hero.y + 60,
      vx: change.anchor[0],
      vy: change.anchor[1],
      ax: 0,
      ay: 0,
      t: 0,
      dur: 0.45,
      rot: 3,
      done: false,
      pickup: true,
    });
    if (change.replaces) {
      this.items.push({
        item: change.replaces, dir: 'out', x0: 0, y0: 0, vx: 90, vy: 260,
        ax: change.anchor[0], ay: change.anchor[1], t: -0.45, dur: 1.3, rot: 0, done: false,
      });
    }
  }

  private drawItems(sim: Sim, heroX: number, heroY: number, toY: (y: number) => number, dt: number): void {
    if (!this.items.length) return;
    const ctx = this.ctx;
    const facing = sim.hero.facing;
    for (const it of this.items) {
      it.t += dt;
      if (it.t < 0) continue;
      const k = Math.min(1, it.t / it.dur);
      ctx.save();
      if (it.dir === 'in') {
        const tx = heroX + it.vx * facing;
        const ty = heroY - it.vy;
        const e = 1 - Math.pow(1 - k, 3);
        const cx = (it.x0 + tx) / 2;
        const cy = Math.max(it.y0, ty) + 90;
        const u = 1 - e;
        const x = u * u * it.x0 + 2 * u * e * cx + e * e * tx;
        const y = u * u * it.y0 + 2 * u * e * cy + e * e * ty;
        const attached = it.done && !it.pickup && this.pendingOutfit >= 0;
        if (attached) {
          // Snapped on: stays in place until the whole new outfit is complete.
          ctx.translate(tx, toY(ty));
          ctx.scale(facing, 1);
          drawItem(ctx, it.item);
        } else if (k < 1) {
          // A bright streak behind the flying piece.
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.5 * (1 - k);
          const g = ctx.createRadialGradient(x, toY(y), 0, x, toY(y), 22);
          g.addColorStop(0, 'rgba(255,230,150,0.9)');
          g.addColorStop(1, 'rgba(255,230,150,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - 22, toY(y) - 22, 44, 44);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.translate(x, toY(y));
          ctx.rotate(it.rot * (1 - e));
          const sc = 2.2 - 1.2 * e;
          ctx.scale(sc * facing, sc);
          drawItem(ctx, it.item);
        }
        if (k >= 1 && !it.done) {
          it.done = true;
          this.impulse = 1;
          this.onItemSnap(it.item);
          const o = PICKABLE[it.item];
          if (it.pickup && o) Object.assign(this.extra, o);
          this.highlights.push({ anchor: [it.vx, it.vy], t: 0 });
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.spawn(2, tx, ty, Math.cos(a) * 140, Math.sin(a) * 140, 0.5);
          }
        }
      } else {
        if (!it.done) {
          it.done = true;
          it.x0 = heroX + it.ax * facing;
          it.y0 = heroY - it.ay;
        }
        const tt = it.t;
        const x = it.x0 + it.vx * tt;
        const y = it.y0 + it.vy * tt - 900 * tt * tt;
        ctx.globalAlpha = 1 - k;
        ctx.translate(x, toY(y));
        ctx.rotate(tt * 8 * Math.sign(it.vx));
        ctx.scale(1.3 * facing, 1.3);
        drawItem(ctx, it.item);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    this.items = this.items.filter((it) =>
      it.dir === 'in' ? !it.done || (!it.pickup && this.pendingOutfit >= 0) : it.t < it.dur,
    );
  }

  /** Soft pulsing glow on freshly worn pieces for a few seconds. */
  private drawHighlights(x: number, footY: number, facing: number, dt: number): void {
    if (!this.highlights.length) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    this.highlights = this.highlights.filter((h) => (h.t += dt) < 6);
    for (const h of this.highlights) {
      const fade = h.t < 5 ? 1 : 6 - h.t;
      const pulse = 0.55 + 0.45 * Math.sin(h.t * 4);
      const hx = x + h.anchor[0] * facing;
      const hy = footY + h.anchor[1];
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
    this.auraPulse = Math.max(0, this.auraPulse - frameDt * 2.5);

    const cam = sim.prevCamY + (sim.camY - sim.prevCamY) * alpha + this.camShift;
    const toY = (y: number): number => H - (y - cam);
    const tier = this.heroTierOverride ?? this.outfitTier;
    this.impulse = Math.max(0, this.impulse - frameDt * 5);

    const hero = sim.hero;
    const hx = hero.prevX + (hero.x - hero.prevX) * alpha;
    const hy = hero.prevY + (hero.y - hero.prevY) * alpha;

    // Cinematic camera: zoom towards the hero during the suit-up.
    let zoom = 1;
    if (this.cine) {
      const c = this.cine;
      c.t += frameDt;
      const kin = Math.min(1, c.t / 0.7);
      const kout = Math.min(1, Math.max(0, (c.dur - c.t) / 0.7));
      zoom = 1 + 0.9 * easeInOut(Math.min(kin, kout));
      if (c.t >= 0.35 && this.sceneTier !== c.toScene) this.sceneTier = c.toScene;
      if (c.t >= c.dur) {
        this.cine = null;
        this.finishOutfit();
      }
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

    for (const p of sim.platforms) {
      this.drawPlatform(p, toY(p.y), sim.time);
      const pick = this.pickups.get(p.id);
      if (pick) this.drawPickup(pick, p.x, toY(p.y), sim.time);
    }
    this.drawSpots(toY, frameDt);

    this.drawWave(sim, toY, W, H);
    this.drawParticles(toY);
    this.drawTrail(sim, hx, hy, toY);

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

    this.drawHero(sim, hx, toY(hy), frameDt, tier);
    this.drawItems(sim, hx, hy, toY, frameDt);
    this.drawHighlights(hx, toY(hy), hero.facing, frameDt);
    this.drawSparkles(frameDt);
    if (!this.cine) this.drawDanger(sim, W, H);

    this.drawFloaters(toY, frameDt);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    this.drawBills(frameDt);

    if (this.deathK > 0) {
      ctx.fillStyle = `rgba(5,6,10,${0.45 * this.deathK})`;
      ctx.fillRect(0, 0, W, H);
    }
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
    // Parallax: the edge buildings scroll slower than the platforms.
    const off = (((cam * 0.35) % H) + H) % H;
    ctx.drawImage(tile, 0, off - H, W, H);
    ctx.drawImage(tile, 0, off, W, H);
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

    const land = Math.exp(-hero.sinceLand * 18);
    const overshoot = Math.sin(Math.min(1, hero.sinceLand * 6) * Math.PI) * 0.04 * Math.exp(-hero.sinceLand * 4);
    const stretch = Math.min(0.12, Math.max(0, hero.vy) / 6000);
    // A clothing piece snapping on gives the hero a little jolt.
    const sy = 1 - land * 0.2 + stretch + overshoot - this.impulse * 0.12;
    const sx = 1 + land * 0.16 - stretch * 0.6 + this.impulse * 0.1;

    const tipX = x + TORCH_TIP[0] * sx * hero.facing;
    const tipY = footY + TORCH_TIP[1] * sy;
    if (!sim.dead) this.drawBeam(sim, tipX, tipY, hero.facing, rgb, tier, dt);

    ctx.save();
    ctx.translate(x, footY);
    if (sim.dead) ctx.rotate(hero.spin);
    ctx.scale(sx * hero.facing, sy);
    drawHeroBody(ctx, {
      tier,
      light: rgb,
      neutral: sim.light === null,
      sinceLand: hero.sinceLand,
      vy: hero.vy,
      vx: hero.vx,
      time: sim.time + this.clock * (this.cine ? 1 : 0),
      face: this.faceFor(sim),
      gesture: this.menuGesture ?? undefined,
      extra: this.extra,
      noBeam: true,
    });
    ctx.restore();

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

    if (sim.light === 'red' && !sim.dead) this.drawAura(x, footY - 28, sim.time, dt);
  }

  /** Volumetric flashlight beam: a soft wide cone, a bright core and dust glittering in it. */
  private drawBeam(sim: Sim, x: number, y: number, facing: number, rgb: string, tier: number, dt: number): void {
    const ctx = this.ctx;
    const on = sim.light !== null;
    const len = (tier >= 7 ? 125 : 100) * (1 + (sim.multiplier - 1) * 0.15);
    const dir = Math.atan2(0.62, 0.78 * facing);
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

  /** The red shield: a living energy field around the hero instead of a plain circle. */
  private drawAura(cx: number, cy: number, t: number, dt: number): void {
    const ctx = this.ctx;
    const pulse = this.auraPulse;
    const reduced = this.reducedEffects;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Soft inner glow.
    const inner = ctx.createRadialGradient(cx, cy, 6, cx, cy, 44 + pulse * 10);
    inner.addColorStop(0, 'rgba(255,60,80,0)');
    inner.addColorStop(0.65, `rgba(255,60,80,${0.1 + pulse * 0.15})`);
    inner.addColorStop(1, 'rgba(255,60,80,0)');
    ctx.fillStyle = inner;
    ctx.fillRect(cx - 60, cy - 60, 120, 120);
    // Wobbling energy shells.
    const shells = reduced ? 1 : 3;
    for (let k = 0; k < shells; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const w =
          1 +
          (reduced ? 0 : 0.07 * Math.sin(3 * a + t * (3 + k) + k * 2) + 0.045 * Math.sin(5 * a - t * (5 - k)));
        const rx = (25 + k * 3 + pulse * 6) * w;
        const ry = (33 + k * 3 + pulse * 6) * w;
        const px = cx + Math.cos(a) * rx;
        const py = cy + Math.sin(a) * ry;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255,${80 + k * 40},${90 + k * 30},${0.55 - k * 0.14 + pulse * 0.3})`;
      ctx.lineWidth = 2.2 - k * 0.5;
      ctx.stroke();
    }
    if (!reduced) {
      // Flame tongues licking upward over the head.
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.32;
        const bx = cx + Math.cos(a) * 26;
        const by = cy + Math.sin(a) * 33;
        const h = 6 + 5 * Math.sin(t * 6 + i * 1.7);
        ctx.fillStyle = 'rgba(255,90,90,0.35)';
        ctx.beginPath();
        ctx.moveTo(bx - 4, by + 2);
        ctx.quadraticCurveTo(bx + Math.sin(t * 4 + i) * 3, by - h, bx + 4, by + 2);
        ctx.fill();
      }
      // Sparks orbiting with short trails.
      for (let i = 0; i < 6; i++) {
        const a = t * 2.4 + (i * Math.PI) / 3;
        const px = cx + Math.cos(a) * 30;
        const py = cy + Math.sin(a) * 38;
        const tx = cx + Math.cos(a - 0.25) * 30;
        const ty = cy + Math.sin(a - 0.25) * 38;
        ctx.strokeStyle = 'rgba(255,170,170,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,230,230,0.95)';
        ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
      }
    }
    // A blocked hit sends a ring outward.
    if (pulse > 0) {
      ctx.strokeStyle = `rgba(255,120,130,${pulse})`;
      ctx.lineWidth = 3 * pulse;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 30 + (1 - pulse) * 30, 38 + (1 - pulse) * 30, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    void dt;
  }

  /** A colored ribbon behind the hero on a ×3 combo. */
  private drawTrail(sim: Sim, x: number, worldY: number, toY: (y: number) => number): void {
    if (this.reducedEffects || sim.multiplier < 3 || sim.dead) {
      this.trail.length = 0;
      return;
    }
    this.trail.push({ x, y: worldY + 26 });
    if (this.trail.length > 14) this.trail.shift();
    const ctx = this.ctx;
    const rgb = this.flashlightColor.map(Math.round).join(',');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const k = i / this.trail.length;
      ctx.strokeStyle = `rgba(${rgb},${0.35 * k})`;
      ctx.lineWidth = 14 * k;
      ctx.beginPath();
      ctx.moveTo(a.x, toY(a.y));
      ctx.lineTo(b.x, toY(b.y));
      ctx.stroke();
    }
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

  /** Adaptive quality: if frames average over 20 ms for about 2 s, halve particles. */
  private trackQuality(dt: number): void {
    if (dt <= 0) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const low = avg > 0.02;
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

/** Money grows richer with the tier: coins, bills, stacks, gold bars. */
function drawMoney(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, tier: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (tier < 3) {
    ctx.fillStyle = '#E3B341';
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5, 4.5 * Math.abs(Math.cos(rot * 2)) + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-1.5, -1.5, 2, 2);
  } else if (tier < 6) {
    ctx.fillStyle = palette.bill;
    ctx.fillRect(-6, -3.5, 12, 7);
    ctx.fillStyle = palette.billMark;
    ctx.fillRect(-2, -2, 4, 4);
  } else if (tier < 9) {
    ctx.fillStyle = '#4E9A5A';
    ctx.fillRect(-7, -1, 14, 5);
    ctx.fillStyle = palette.bill;
    ctx.fillRect(-7, -4.5, 14, 4.5);
    ctx.fillStyle = '#E8C060';
    ctx.fillRect(-1.5, -4.5, 3, 9);
  } else {
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
  }
  ctx.restore();
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
