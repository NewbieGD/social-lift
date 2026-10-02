import { gameConfig, type ColorId, type LightId } from '../core/gameConfig';
import type { Sim } from '../core/sim';
import type { Platform, SimEvent } from '../core/types';
import { palette, scenes } from './palette';

interface Floater {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  color: string;
}

const MAX_PARTICLES = 160;

/** Simple typed-array particle pool (bills and dust). */
class Particles {
  x = new Float32Array(MAX_PARTICLES);
  y = new Float32Array(MAX_PARTICLES);
  vx = new Float32Array(MAX_PARTICLES);
  vy = new Float32Array(MAX_PARTICLES);
  life = new Float32Array(MAX_PARTICLES);
  max = new Float32Array(MAX_PARTICLES);
  kind = new Uint8Array(MAX_PARTICLES); // 0 dust, 1 bill
  rot = new Float32Array(MAX_PARTICLES);
  next = 0;

  spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTICLES;
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
      const g = this.kind[i] === 1 ? 260 : 120;
      this.vy[i] -= g * dt;
      this.vx[i] *= 1 - 2 * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += dt * 6;
    }
  }
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  scale = 1;
  dpr = 1;
  private floaters: Floater[] = [];
  private particles = new Particles();
  private skylines = new Map<number, HTMLCanvasElement>();
  private shownTier = 0;
  private tierBlend = 1;
  private prevTier = 0;
  private flashlightColor: [number, number, number] = [235, 235, 225];
  private auraPulse = 0;
  reducedEffects = false;

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
    this.skylines.clear();
  }

  handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'capture') {
        const c = palette.light[e.color];
        this.floaters.push({ x: e.x, y: e.y + 26, vy: 70, life: 0.9, max: 0.9, text: `+${e.points}`, color: c });
        if (!this.reducedEffects) {
          const n = 8 + Math.floor(Math.random() * 6);
          for (let i = 0; i < n; i++) {
            const a = Math.PI * (0.15 + 0.7 * (i / n));
            const sp = 160 + Math.random() * 120;
            this.particles.spawn(1, e.x, e.y + 6, Math.cos(a) * sp, Math.sin(a) * sp + 80, 0.9);
          }
        }
      } else if (e.type === 'land' && !this.reducedEffects) {
        for (let i = 0; i < 5; i++) {
          this.particles.spawn(0, e.x + (Math.random() - 0.5) * 24, e.y + 2, (Math.random() - 0.5) * 90, 20 + Math.random() * 30, 0.35);
        }
      } else if (e.type === 'aura') {
        this.auraPulse = 1;
      } else if (e.type === 'tier') {
        this.prevTier = this.shownTier;
        this.shownTier = e.tier;
        this.tierBlend = 0;
      }
    }
  }

  draw(sim: Sim, alpha: number, frameDt: number): void {
    const ctx = this.ctx;
    const W = gameConfig.world.width;
    const H = sim.viewH;
    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);

    this.particles.update(frameDt);
    this.tierBlend = Math.min(1, this.tierBlend + frameDt / 0.8);
    this.auraPulse = Math.max(0, this.auraPulse - frameDt * 2.5);

    const cam = sim.prevCamY + (sim.camY - sim.prevCamY) * alpha;
    const toY = (y: number): number => H - (y - cam);

    this.drawBackground(W, H, cam);

    for (const p of sim.platforms) this.drawPlatform(p, toY(p.y), sim.time);

    this.drawWave(sim, toY, W, H);
    this.drawParticles(toY);

    const hero = sim.hero;
    const hx = hero.prevX + (hero.x - hero.prevX) * alpha;
    const hy = hero.prevY + (hero.y - hero.prevY) * alpha;
    this.drawHero(sim, hx, toY(hy), frameDt);

    this.drawFloaters(toY, frameDt);
  }

  private drawBackground(W: number, H: number, cam: number): void {
    const ctx = this.ctx;
    const fill = (tier: number, a: number): void => {
      const sc = scenes[Math.min(tier, scenes.length - 1)];
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, sc.skyTop);
      g.addColorStop(1, sc.skyBottom);
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const sky = this.skyline(tier, W, H);
      // Slow parallax: the skyline drifts down as the camera rises, wrapping.
      const off = (cam * 0.12) % H;
      ctx.drawImage(sky, 0, off - H, W, H);
      ctx.drawImage(sky, 0, off, W, H);
      ctx.globalAlpha = 1;
    };
    if (this.tierBlend < 1) fill(this.prevTier, 1);
    fill(this.shownTier, this.tierBlend < 1 ? this.tierBlend : 1);
  }

  /** Pre-rendered decorative silhouettes for each scene (cached offscreen). */
  private skyline(tier: number, W: number, H: number): HTMLCanvasElement {
    const cached = this.skylines.get(tier);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = Math.round(W * this.scale * this.dpr);
    c.height = Math.round(H * this.scale * this.dpr);
    const g = c.getContext('2d')!;
    const k = (this.scale * this.dpr);
    g.scale(k, k);
    const sc = scenes[Math.min(tier, scenes.length - 1)];
    let seed = 1234 + tier * 77;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // Two loose columns of windows/blocks at the edges keep the center readable.
    for (let i = 0; i < 9; i++) {
      const side = i % 2 === 0 ? 0 : 1;
      const w = 40 + rnd() * 50;
      const x = side === 0 ? -10 + rnd() * 30 : W - w + 10 - rnd() * 30;
      const y = rnd() * H;
      const h = 60 + rnd() * 140;
      g.fillStyle = sc.block;
      roundRect(g, x, y, w, h, 6);
      g.fill();
      g.fillStyle = sc.window;
      for (let wy = y + 10; wy < y + h - 12; wy += 18) {
        for (let wx = x + 8; wx < x + w - 10; wx += 14) {
          if (rnd() < 0.55) g.fillRect(wx, wy, 6, 8);
        }
      }
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = sc.dot;
      g.globalAlpha = 0.25 + rnd() * 0.4;
      g.beginPath();
      g.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    this.skylines.set(tier, c);
    return c;
  }

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
    // Edge (thickness) then top face.
    ctx.fillStyle = edge;
    roundRect(ctx, x, sy, pw, ph + 4, 7);
    ctx.fill();
    ctx.fillStyle = fill;
    roundRect(ctx, x, sy, pw, ph, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(ctx, x + 5, sy + 2, pw - 10, 3, 2);
    ctx.fill();

    if (p.kind === 'red') {
      // Hazard stripes distinguish base red platforms from red phases.
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

    // Capture flash: a light sweep over a freshly used platform.
    if (p.kind === 'white' && p.whiteAge < 0.35) {
      const k = p.whiteAge / 0.35;
      ctx.fillStyle = `rgba(255,255,240,${0.8 * (1 - k)})`;
      roundRect(ctx, x - 4 * k, sy - 3 * k, pw + 8 * k, ph + 6 * k, 9);
      ctx.fill();
    }

    if (warnK > 0) {
      ctx.strokeStyle = `rgba(255,50,60,${0.25 + 0.75 * warnK})`;
      ctx.lineWidth = 2 + warnK * 2.5;
      roundRect(ctx, x - 1, sy - 1, pw + 2, ph + 6, 8);
      ctx.stroke();
    }

    if (icon) drawIcon(ctx, icon, x + pw / 2, sy + ph / 2, 5, 'rgba(255,255,255,0.92)');
    ctx.globalAlpha = 1;
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
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(P.rot[i]);
        ctx.fillStyle = palette.bill;
        ctx.fillRect(-6, -3.5, 12, 7);
        ctx.fillStyle = palette.billMark;
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawHero(sim: Sim, x: number, footY: number, dt: number): void {
    const ctx = this.ctx;
    const hero = sim.hero;
    const target = lightRgb(sim.light);
    // Smooth flashlight color change (~0.12 s).
    const k = Math.min(1, dt / 0.12);
    for (let i = 0; i < 3; i++) this.flashlightColor[i] += (target[i] - this.flashlightColor[i]) * k;
    const [r, g, b] = this.flashlightColor.map(Math.round);
    const neutral = sim.light === null;

    // Squash on landing, stretch while rising fast.
    const land = Math.exp(-hero.sinceLand * 18);
    const stretch = Math.min(0.12, Math.max(0, hero.vy) / 6000);
    const sy = 1 - land * 0.2 + stretch;
    const sx = 1 + land * 0.16 - stretch * 0.6;

    ctx.save();
    ctx.translate(x, footY);
    if (sim.dead) ctx.rotate(hero.spin);
    ctx.scale(sx * hero.facing, sy);

    // Flashlight beam: points down-forward, toward the platforms below.
    ctx.globalAlpha = neutral ? 0.18 : 0.38;
    const beam = ctx.createLinearGradient(10, -26, 60, 30);
    beam.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
    beam.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(14, -24);
    ctx.lineTo(70, 18);
    ctx.lineTo(30, 34);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Legs
    ctx.fillStyle = palette.skinDark;
    roundRect(ctx, -10, -16, 7, 16, 3);
    ctx.fill();
    roundRect(ctx, 3, -16, 7, 16, 3);
    ctx.fill();
    // Shorts
    ctx.fillStyle = palette.shorts;
    roundRect(ctx, -12, -24, 24, 12, 4);
    ctx.fill();
    // Torso (tank top)
    ctx.fillStyle = palette.shirt;
    roundRect(ctx, -12, -42, 24, 20, 7);
    ctx.fill();
    // Back arm
    ctx.fillStyle = palette.skin;
    roundRect(ctx, -16, -40, 6, 15, 3);
    ctx.fill();
    // Front arm holding the flashlight
    ctx.save();
    ctx.translate(9, -38);
    ctx.rotate(0.9);
    roundRect(ctx, -3, 0, 6, 14, 3);
    ctx.fill();
    ctx.fillStyle = palette.torch;
    roundRect(ctx, -4, 12, 8, 9, 2);
    ctx.fill();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(-4, 19, 8, 3);
    ctx.restore();
    // Head
    ctx.fillStyle = palette.skin;
    ctx.beginPath();
    ctx.arc(0, -50, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.hair;
    ctx.beginPath();
    ctx.arc(-1, -53, 8.5, Math.PI * 1.05, Math.PI * 2.05);
    ctx.fill();
    ctx.fillStyle = '#1d1a24';
    ctx.fillRect(4, -51, 2, 3);
    ctx.restore();

    // Red aura bubble with a pulsing rim.
    if (sim.light === 'red' && !sim.dead) {
      const pulse = this.auraPulse;
      ctx.strokeStyle = `rgba(255,70,80,${0.55 + 0.45 * pulse})`;
      ctx.lineWidth = 2.5 + pulse * 3;
      ctx.fillStyle = 'rgba(255,60,70,0.12)';
      ctx.beginPath();
      ctx.ellipse(x, footY - 27, 27 + pulse * 6, 36 + pulse * 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawFloaters(toY: (y: number) => number, dt: number): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.font = '700 18px system-ui, sans-serif';
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += f.vy * dt;
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(f.text, f.x + 1, toY(f.y) + 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, toY(f.y));
    }
    ctx.globalAlpha = 1;
  }
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
    // Shield
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
