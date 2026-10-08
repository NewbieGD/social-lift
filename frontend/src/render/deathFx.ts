// The death effect, the same for every hero and every outfit (styles, pets and bonus items included):
//
//   0.00 s  a white flash, the screen jolts and the hero bursts into glass-like shards that carry
//           the real picture of the hero in his own colors
//   0.00-0.6 s  two shockwave rings and radial speed lines, hundreds of sparks
//   0.0-1.6 s   shards tumble outward, fall and fade; the picture darkens at the edges
//
// What kills the hero adds its own accent: a green storm of bills for the wave of debts, red
// lightning for a red platform, a cold comet streak for a fall.

import type { DeathReason } from '../core/types';

interface Shard {
  /** Triangle of the snapshot (in snapshot pixels). */
  a: [number, number];
  b: [number, number];
  c: [number, number];
  /** Center on the screen (world units), speed, spin. */
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

interface Bill {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
}

interface Bolt {
  pts: [number, number][];
  born: number;
}

const PALETTES: Record<DeathReason, { main: string; hot: string; rgb: string }> = {
  wave: { main: '#7BE07B', hot: '#E6FFE0', rgb: '110,224,120' },
  red: { main: '#FF4A5A', hot: '#FFD6D0', rgb: '255,74,90' },
  fall: { main: '#7FD6FF', hot: '#EAFBFF', rgb: '127,214,255' },
};

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export class DeathFx {
  active = false;
  t = 0;
  private reason: DeathReason = 'fall';
  private snap: HTMLCanvasElement | null = null;
  /** Pixels per world unit of the snapshot. */
  private snapK = 1;
  private shards: Shard[] = [];
  private sparks: Spark[] = [];
  private bills: Bill[] = [];
  private bolts: Bolt[] = [];
  private cx = 0;
  private cy = 0;

  /** True while the hero is replaced by his shards (he must not be drawn). */
  get hidesHero(): boolean {
    return this.active && this.snap !== null;
  }

  reset(): void {
    this.active = false;
    this.t = 0;
    this.snap = null;
    this.shards.length = 0;
    this.sparks.length = 0;
    this.bills.length = 0;
    this.bolts.length = 0;
  }

  /**
   * Starts the effect. `snap` is the hero drawn alone (transparent background) in an off-screen
   * canvas of `snapW` x `snapH` world units, his feet at (snapW/2, snapH - pad). (cx, cy) is the
   * centre of his body on the screen in world units.
   */
  start(snap: HTMLCanvasElement | null, snapK: number, snapW: number, snapH: number, cx: number, cy: number, reason: DeathReason): void {
    this.reset();
    this.active = true;
    this.reason = reason;
    this.snap = snap;
    this.snapK = snapK;
    this.cx = cx;
    this.cy = cy;
    const pal = PALETTES[reason];

    if (snap) {
      // Cut the picture into a grid of triangles: they become the shards.
      const cols = 5;
      const rows = 6;
      const cw = snap.width / cols;
      const ch = snap.height / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x0 = c * cw;
          const y0 = r * ch;
          // Jitter the inner corners a little so the cuts are not a perfect grid.
          const p00: [number, number] = [x0, y0];
          const p10: [number, number] = [x0 + cw, y0];
          const p01: [number, number] = [x0, y0 + ch];
          const p11: [number, number] = [x0 + cw, y0 + ch];
          const tris: [[number, number], [number, number], [number, number]][] =
            (r + c) % 2 === 0 ? [[p00, p10, p11], [p00, p11, p01]] : [[p00, p10, p01], [p10, p11, p01]];
          for (const [a, b, d] of tris) {
            const mx = (a[0] + b[0] + d[0]) / 3;
            const my = (a[1] + b[1] + d[1]) / 3;
            // Where this piece sits on the screen, in world units.
            const wx = cx + (mx / snapK - snapW / 2);
            const wy = cy + (my / snapK - (snapH - 10 - 30)); // feet at snapH - 10, body centre 30 units above them
            // Fly away from the middle of the body, a little upward.
            const dx = wx - cx;
            const dy = wy - cy;
            const d0 = Math.hypot(dx, dy) || 1;
            const sp = rnd(120, 360);
            const max = rnd(1.1, 1.8);
            this.shards.push({
              a: a,
              b: b,
              c: d,
              x: wx,
              y: wy,
              vx: (dx / d0) * sp + rnd(-60, 60),
              vy: (dy / d0) * sp - rnd(60, 220),
              rot: 0,
              vr: rnd(-9, 9),
              life: max,
              max,
            });
          }
        }
      }
    }

    // Sparks: the colors of the reason and gold.
    const colors = [pal.main, pal.hot, '#FFD640', '#FFFFFF', '#FF9A3C'];
    for (let i = 0; i < 90; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(80, 520);
      const max = rnd(0.5, 1.5);
      this.sparks.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: max,
        max,
        size: rnd(1.2, 3.4),
        color: colors[i % colors.length],
      });
    }

    if (reason === 'wave') {
      for (let i = 0; i < 18; i++) {
        const a = rnd(0, Math.PI * 2);
        const sp = rnd(90, 300);
        const max = rnd(1, 1.9);
        this.bills.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, rot: rnd(0, 6), vr: rnd(-10, 10), life: max, max });
      }
    } else if (reason === 'red') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rnd(-0.3, 0.3);
        const pts: [number, number][] = [[cx, cy]];
        let r = 0;
        let ang = a;
        while (r < 150) {
          r += rnd(14, 26);
          ang += rnd(-0.5, 0.5);
          pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
        }
        this.bolts.push({ pts, born: rnd(0, 0.12) });
      }
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    for (const s of this.shards) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vy += 520 * dt;
      s.vx *= 1 - 0.7 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
    }
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += 360 * dt;
      p.vx *= 1 - 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const b of this.bills) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy += 120 * dt;
      b.vx *= 1 - 1.1 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
    }
    if (this.t > 3) this.active = false;
  }

  /** Screen jolt in CSS pixels. */
  shake(): { x: number; y: number } {
    if (!this.active || this.t > 0.9) return { x: 0, y: 0 };
    const k = Math.exp(-this.t * 5.2) * 14;
    return { x: Math.sin(this.t * 83) * k, y: Math.cos(this.t * 71) * k * 0.7 };
  }

  /** Draws everything in world units (the context is already scaled). */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (!this.active) return;
    const t = this.t;
    const pal = PALETTES[this.reason];
    const cx = this.cx;
    const cy = this.cy;

    // The picture darkens at the edges and pulses in the color of the death.
    const vk = Math.min(1, t / 0.4) * (t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 1.2));
    const vg = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(${pal.rgb === '110,224,120' ? '10,40,12' : pal.rgb === '255,74,90' ? '70,0,8' : '0,20,50'},${0.6 * vk})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Radial speed lines, brightest at the very start.
    if (t < 0.4) {
      const a0 = 1 - t / 0.4;
      for (let i = 0; i < 22; i++) {
        const ang = (i / 22) * Math.PI * 2 + 0.13 * i;
        const r0 = 26 + t * 260 + (i % 3) * 8;
        const r1 = r0 + 60 + (i % 4) * 26;
        const lg = ctx.createLinearGradient(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0, cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        lg.addColorStop(0, `rgba(${pal.rgb},0)`);
        lg.addColorStop(0.4, `rgba(255,255,255,${0.7 * a0})`);
        lg.addColorStop(1, `rgba(${pal.rgb},0)`);
        ctx.strokeStyle = lg;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
    }

    // Two shockwave rings.
    for (const [delay, width, a] of [[0, 7, 0.95], [0.1, 3.4, 0.7]] as [number, number, number][]) {
      const k = (t - delay) / 0.7;
      if (k <= 0 || k >= 1) continue;
      const ease = 1 - Math.pow(1 - k, 3);
      const r = 20 + ease * Math.max(W, H) * 0.62;
      ctx.strokeStyle = `rgba(${pal.rgb},${a * (1 - k)})`;
      ctx.lineWidth = width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * a * (1 - k)})`;
      ctx.lineWidth = width * 0.35 * (1 - k);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The hot core that flares at the moment of the hit.
    if (t < 0.45) {
      const k = 1 - t / 0.45;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80 + (1 - k) * 60);
      cg.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
      cg.addColorStop(0.35, `rgba(${pal.rgb},${0.55 * k})`);
      cg.addColorStop(1, `rgba(${pal.rgb},0)`);
      ctx.fillStyle = cg;
      ctx.fillRect(cx - 140, cy - 140, 280, 280);
    }

    // Red lightning.
    for (const b of this.bolts) {
      const k = (t - b.born) / 0.4;
      if (k <= 0 || k >= 1) continue;
      ctx.strokeStyle = `rgba(255,170,170,${(1 - k) * 0.95})`;
      ctx.lineWidth = 2.4 * (1 - k * 0.5);
      ctx.beginPath();
      b.pts.forEach(([x, y], i) => {
        const jx = x + Math.sin(t * 90 + i) * 2;
        if (i === 0) ctx.moveTo(jx, y);
        else ctx.lineTo(jx, y);
      });
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.8})`;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    // A cold comet streak for a fall.
    if (this.reason === 'fall' && t < 0.7) {
      const k = 1 - t / 0.7;
      const lg = ctx.createLinearGradient(0, cy, 0, cy + 200);
      lg.addColorStop(0, `rgba(127,214,255,${0.6 * k})`);
      lg.addColorStop(1, 'rgba(127,214,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(cx - 5, cy, 10, 200);
    }

    // Sparks with a short glowing trail.
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      const a = Math.min(1, (p.life / p.max) * 1.6);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = a;
      ctx.lineWidth = p.size * 0.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Bills of the wave of debts.
    for (const b of this.bills) {
      if (b.life <= 0) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = Math.min(1, (b.life / b.max) * 2);
      ctx.fillStyle = '#7BC47B';
      ctx.fillRect(-7, -3.4, 14, 6.8);
      ctx.strokeStyle = '#2F6E3A';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(-7, -3.4, 14, 6.8);
      ctx.fillStyle = '#2F6E3A';
      ctx.beginPath();
      ctx.arc(0, 0, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // The shards: real pieces of the hero's picture, tumbling and fading.
    const snap = this.snap;
    if (snap) {
      for (const s of this.shards) {
        if (s.life <= 0) continue;
        const a = Math.min(1, (s.life / s.max) * 2.2);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.globalAlpha = a;
        // The piece is drawn around its own centre; the picture is shifted so that centre sits at 0,0.
        const mx = (s.a[0] + s.b[0] + s.c[0]) / 3;
        const my = (s.a[1] + s.b[1] + s.c[1]) / 3;
        const k = 1 / this.snapK;
        ctx.beginPath();
        ctx.moveTo((s.a[0] - mx) * k, (s.a[1] - my) * k);
        ctx.lineTo((s.b[0] - mx) * k, (s.b[1] - my) * k);
        ctx.lineTo((s.c[0] - mx) * k, (s.c[1] - my) * k);
        ctx.closePath();
        ctx.save();
        ctx.clip();
        ctx.drawImage(snap, -mx * k, -my * k, snap.width * k, snap.height * k);
        ctx.restore();
        // A bright edge, like glass.
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // The white flash of the impact.
    if (t < 0.16) {
      ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - t / 0.16)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
