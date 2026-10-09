// The death effect, the same for every hero and every outfit. It is kept light on purpose (it runs
// on weak phones too): a short white flash, one shockwave ring, a handful of sparks and the hero
// breaking into a few large pieces of his own picture that drift apart and fade.
//
//   0.00 s   a short flash, a small jolt of the screen, the ring starts
//   0.0-1.0 s  about twenty pieces of the hero drift apart (no clipping, plain image pieces)
//
// What kills the hero adds a small accent: a few bills for the wave of debts, a few red bolts for a
// red platform, a short cold streak for a fall. On slower devices (`lite`) the effect gets simpler:
// level 1 has fewer pieces and sparks, level 2 only the flash, the ring and a handful of sparks.

import type { DeathReason } from '../core/types';

interface Piece {
  /** Where the piece is in the snapshot (pixels). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

const PALETTES: Record<DeathReason, { main: string; hot: string; rgb: string; dark: string }> = {
  wave: { main: '#7BE07B', hot: '#E6FFE0', rgb: '110,224,120', dark: 'rgba(10,40,12,0.4)' },
  red: { main: '#FF4A5A', hot: '#FFD6D0', rgb: '255,74,90', dark: 'rgba(70,0,8,0.4)' },
  fall: { main: '#7FD6FF', hot: '#EAFBFF', rgb: '127,214,255', dark: 'rgba(0,20,50,0.4)' },
};

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export class DeathFx {
  active = false;
  t = 0;
  private reason: DeathReason = 'fall';
  private snap: HTMLCanvasElement | null = null;
  private snapK = 1;
  private pieces: Piece[] = [];
  private sparks: Spark[] = [];
  private bills: { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; max: number }[] = [];
  private bolts: [number, number][][] = [];
  private cx = 0;
  private cy = 0;
  private hide = false;
  private lite = 0;

  /** True while the hero is replaced by his pieces (he must not be drawn). */
  get hidesHero(): boolean {
    return this.active && this.hide;
  }

  reset(): void {
    this.active = false;
    this.t = 0;
    this.snap = null;
    this.hide = false;
    this.pieces.length = 0;
    this.sparks.length = 0;
    this.bills.length = 0;
    this.bolts.length = 0;
  }

  /**
   * Starts the effect. `snap` is the hero drawn alone (transparent background) in an off-screen canvas
   * of `snapW` x `snapH` world units with his feet at snapH - 10; (cx, cy) is the centre of his body on
   * the screen. `lite` is the quality level of the device (0 full, 1 lighter, 2 simplest).
   */
  start(snap: HTMLCanvasElement | null, snapK: number, snapW: number, snapH: number, cx: number, cy: number, reason: DeathReason, lite = 0): void {
    this.reset();
    this.active = true;
    this.reason = reason;
    this.snapK = snapK;
    this.cx = cx;
    this.cy = cy;
    this.lite = lite;
    const pal = PALETTES[reason];

    // The hero breaks into a few big pieces (a grid of rectangles, no clipping: cheap to draw).
    if (snap && lite < 2) {
      this.snap = snap;
      this.hide = true;
      const cols = lite === 1 ? 3 : 4;
      const rows = lite === 1 ? 4 : 5;
      const cw = snap.width / cols;
      const ch = snap.height / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const mx = (c + 0.5) * cw;
          const my = (r + 0.5) * ch;
          const wx = cx + (mx / snapK - snapW / 2);
          const wy = cy + (my / snapK - (snapH - 10 - 30));
          const dx = wx - cx;
          const dy = wy - cy;
          const d0 = Math.hypot(dx, dy) || 1;
          const sp = rnd(50, 150);
          const max = rnd(0.7, 1.1);
          this.pieces.push({
            sx: c * cw,
            sy: r * ch,
            sw: cw,
            sh: ch,
            x: wx,
            y: wy,
            vx: (dx / d0) * sp + rnd(-20, 20),
            vy: (dy / d0) * sp - rnd(20, 90),
            rot: 0,
            vr: rnd(-4, 4),
            life: max,
            max,
          });
        }
      }
    } else if (lite >= 2) {
      // The simplest version: no pieces, the hero just disappears in the flash.
      this.hide = true;
    }

    // A handful of sparks.
    const n = lite >= 2 ? 8 : lite === 1 ? 14 : 22;
    const colors = [pal.main, pal.hot, '#FFD640', '#FFFFFF'];
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(60, 240);
      const max = rnd(0.4, 0.9);
      this.sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: max, max, size: rnd(1.4, 2.6), color: colors[i % colors.length] });
    }

    if (lite === 0) {
      if (reason === 'wave') {
        for (let i = 0; i < 8; i++) {
          const a = rnd(0, Math.PI * 2);
          const sp = rnd(60, 170);
          const max = rnd(0.8, 1.2);
          this.bills.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, rot: rnd(0, 6), vr: rnd(-6, 6), life: max, max });
        }
      } else if (reason === 'red') {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + rnd(-0.3, 0.3);
          const pts: [number, number][] = [[cx, cy]];
          let r = 0;
          let ang = a;
          while (r < 90) {
            r += rnd(16, 26);
            ang += rnd(-0.5, 0.5);
            pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
          }
          this.bolts.push(pts);
        }
      }
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    for (const p of this.pieces) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += 360 * dt;
      p.vx *= 1 - 0.9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += 300 * dt;
      p.vx *= 1 - 2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const b of this.bills) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy += 120 * dt;
      b.vx *= 1 - 1.2 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
    }
    if (this.t > 1.6) this.active = false;
  }

  /** A small screen jolt in CSS pixels (short and gentle). */
  shake(): { x: number; y: number } {
    if (!this.active || this.t > 0.4 || this.lite >= 2) return { x: 0, y: 0 };
    const k = Math.exp(-this.t * 9) * 7;
    return { x: Math.sin(this.t * 83) * k, y: Math.cos(this.t * 71) * k * 0.7 };
  }

  /** Draws everything in world units (the context is already scaled). */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (!this.active) return;
    const t = this.t;
    const pal = PALETTES[this.reason];
    const cx = this.cx;
    const cy = this.cy;

    // The edges of the picture darken a little for a moment (a plain tint: no gradient to build per frame).
    if (t < 1.1 && this.lite < 2) {
      ctx.fillStyle = pal.dark.replace('0.4', String(0.4 * Math.sin(Math.min(1, t / 1.1) * Math.PI)));
      ctx.fillRect(0, 0, W, H);
    }

    // One shockwave ring.
    const k = t / 0.55;
    if (k > 0 && k < 1) {
      const ease = 1 - Math.pow(1 - k, 3);
      const r = 18 + ease * Math.max(W, H) * 0.42;
      ctx.strokeStyle = `rgba(${pal.rgb},${0.85 * (1 - k)})`;
      ctx.lineWidth = 5 * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Red bolts and the short streak of a fall.
    if (this.bolts.length && t < 0.3) {
      ctx.strokeStyle = `rgba(255,180,180,${1 - t / 0.3})`;
      ctx.lineWidth = 2;
      for (const pts of this.bolts) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
      }
    }
    if (this.reason === 'fall' && this.lite === 0 && t < 0.5) {
      ctx.fillStyle = `rgba(127,214,255,${0.45 * (1 - t / 0.5)})`;
      ctx.fillRect(cx - 4, cy, 8, 150);
    }

    // Sparks: plain small dots (no trails, no gradients).
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Bills of the wave of debts.
    for (const b of this.bills) {
      if (b.life <= 0) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = Math.min(1, (b.life / b.max) * 2);
      ctx.fillStyle = '#7BC47B';
      ctx.fillRect(-6, -3, 12, 6);
      ctx.fillStyle = '#2F6E3A';
      ctx.fillRect(-1.4, -1.4, 2.8, 2.8);
      ctx.restore();
    }

    // The pieces of the hero: plain image rectangles drifting apart and fading.
    const snap = this.snap;
    if (snap) {
      const inv = 1 / this.snapK;
      for (const p of this.pieces) {
        if (p.life <= 0) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2);
        ctx.drawImage(snap, p.sx, p.sy, p.sw, p.sh, (-p.sw * inv) / 2, (-p.sh * inv) / 2, p.sw * inv, p.sh * inv);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // A short flash at the moment of the hit.
    if (t < 0.1) {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - t / 0.1)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
