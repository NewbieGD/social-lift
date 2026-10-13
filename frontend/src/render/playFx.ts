// The Play button in the mayor's colours: a soft glow around the button and light that runs around its
// frame (two comets with trails and a wave of small lights), each in its own colour. Nothing sticks out.
//   fire     warm orange glow, comets of fire, small embers
//   ice      cold blue glow, comets of frost, small crystals
//   emerald  green glow, comets of green energy, small gems
// The canvas is a few pixels larger than the button on each side (`pad`); the button lies at (pad, pad).
//
// Made light for weak phones: the glow around the button is drawn once into a cached picture; the comets
// are chains of small ready-made soft dots (no gradients are built in a frame); everything is cut down at
// the lighter quality level (fewer lights, shorter trails, no sheen).

export type PlayFxKind = 'fire' | 'ice' | 'emerald';
type Ctx = CanvasRenderingContext2D;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s: number;
}

interface PerimeterPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

interface Theme {
  /** The colour of the soft glow around the button (r,g,b). */
  glow: string;
  /** The rim line close to the button's edge. */
  rim: string;
  /** The comet: the colour of its head, its neck and its tail. */
  head: string;
  neck: string;
  tail: string;
  /** The little lights that run along the frame and the sparks the comets leave. */
  stud: string;
  spark: string;
}

const THEMES: Record<PlayFxKind, Theme> = {
  fire: { glow: '255,120,40', rim: '255,170,70', head: '255,250,200', neck: '255,200,80', tail: '255,80,20', stud: '255,215,120', spark: '255,170,60' },
  ice: { glow: '120,205,255', rim: '200,240,255', head: '255,255,255', neck: '210,244,255', tail: '90,180,255', stud: '220,248,255', spark: '235,250,255' },
  emerald: { glow: '60,235,140', rim: '110,255,175', head: '240,255,246', neck: '130,255,190', tail: '30,200,110', stud: '190,255,220', spark: '170,255,205' },
};

/** A small soft dot made once: bright in the middle, fading to nothing at the edge. */
function makeDot(rgb: string, size: number, core: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(core, `rgba(${rgb},0.55)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

interface Dots {
  head: HTMLCanvasElement;
  neck: HTMLCanvasElement;
  tail: HTMLCanvasElement;
  glow: HTMLCanvasElement;
}
const dotCache: Partial<Record<PlayFxKind, Dots>> = {};
function dots(kind: PlayFxKind): Dots {
  let d = dotCache[kind];
  if (!d) {
    const th = THEMES[kind];
    d = { head: makeDot(th.head, 32, 0.35), neck: makeDot(th.neck, 32, 0.3), tail: makeDot(th.tail, 32, 0.25), glow: makeDot(th.glow, 32, 0.2) };
    dotCache[kind] = d;
  }
  return d;
}

export class PlayFx {
  private sparks: Spark[] = [];
  private spawnT = 0;
  /** The soft glow around the button, drawn once for this size (and the pixel density of the screen). */
  private ring: HTMLCanvasElement | null = null;
  private ringKey = '';

  /** A point on the outline of the rounded button at distance s along it, with the outward normal. */
  private point(s: number, bw: number, bh: number, R: number, ox: number, oy: number): PerimeterPoint {
    const top = bw - 2 * R;
    const side = bh - 2 * R;
    const arc = (Math.PI * R) / 2;
    const L = 2 * top + 2 * side + 4 * arc;
    s = ((s % L) + L) % L;
    if (s < top) return { x: ox + R + s, y: oy, nx: 0, ny: -1 };
    s -= top;
    if (s < arc) { const a = -Math.PI / 2 + s / R; return { x: ox + bw - R + Math.cos(a) * R, y: oy + R + Math.sin(a) * R, nx: Math.cos(a), ny: Math.sin(a) }; }
    s -= arc;
    if (s < side) return { x: ox + bw, y: oy + R + s, nx: 1, ny: 0 };
    s -= side;
    if (s < arc) { const a = s / R; return { x: ox + bw - R + Math.cos(a) * R, y: oy + bh - R + Math.sin(a) * R, nx: Math.cos(a), ny: Math.sin(a) }; }
    s -= arc;
    if (s < top) return { x: ox + bw - R - s, y: oy + bh, nx: 0, ny: 1 };
    s -= top;
    if (s < arc) { const a = Math.PI / 2 + s / R; return { x: ox + R + Math.cos(a) * R, y: oy + bh - R + Math.sin(a) * R, nx: Math.cos(a), ny: Math.sin(a) }; }
    s -= arc;
    if (s < side) return { x: ox, y: oy + bh - R - s, nx: -1, ny: 0 };
    s -= side;
    const a = Math.PI + s / R;
    return { x: ox + R + Math.cos(a) * R, y: oy + R + Math.sin(a) * R, nx: Math.cos(a), ny: Math.sin(a) };
  }

  /** The glow ring and the rim, drawn into a picture of its own (done once per size, not every frame). */
  private buildRing(kind: PlayFxKind, ox: number, oy: number, bw: number, bh: number, R: number, cw: number, ch: number, px: number): void {
    const th = THEMES[kind];
    const c = document.createElement('canvas');
    c.width = Math.ceil(cw * px);
    c.height = Math.ceil(ch * px);
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(px, px);
    g.globalCompositeOperation = 'lighter';
    g.lineJoin = 'round';
    for (const [w, a] of [[20, 0.045], [14, 0.07], [9, 0.1], [5, 0.15]] as [number, number][]) {
      g.lineWidth = w;
      g.strokeStyle = `rgba(${th.glow},${a})`;
      g.beginPath();
      g.roundRect(ox, oy, bw, bh, R);
      g.stroke();
    }
    g.lineWidth = 1.6;
    g.strokeStyle = `rgba(${th.rim},0.62)`;
    g.beginPath();
    g.roundRect(ox, oy, bw, bh, R);
    g.stroke();
    this.ring = c;
  }

  /**
   * Draws the effect. (ox, oy) is the top-left corner of the button inside the canvas, (bw, bh) its size,
   * `t` the time in seconds, `dt` the time since the last frame, `level` 0 full, 1 lighter.
   */
  draw(ctx: Ctx, kind: PlayFxKind, ox: number, oy: number, bw: number, bh: number, t: number, dt: number, level = 0): void {
    const th = THEMES[kind];
    const dt0 = dots(kind);
    const R = Math.min(bh * 0.3, 18);
    const L = 2 * (bw - 2 * R) + 2 * (bh - 2 * R) + 2 * Math.PI * R;
    const px = ctx.getTransform().a || 1;
    const cw = Math.ceil(bw + 2 * ox);
    const ch = Math.ceil(bh + 2 * oy);
    const key = `${kind}|${Math.round(bw)}|${Math.round(bh)}|${px}`;
    if (key !== this.ringKey || !this.ring) {
      this.ringKey = key;
      this.sparks.length = 0;
      this.buildRing(kind, ox, oy, bw, bh, R, cw, ch, px);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // ---- the soft glow and the rim: one ready picture, breathing a little
    if (this.ring) {
      ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 2.1);
      ctx.drawImage(this.ring, 0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }

    // ---- a soft sheen sliding across the inside of the button (only at the full quality level)
    if (level === 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ox, oy, bw, bh, R);
      ctx.clip();
      const sx = ox + (((t * 0.4) % 1.5) - 0.25) * bw;
      const sg = ctx.createLinearGradient(sx - 42, oy, sx + 42, oy + bh);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, `rgba(${th.head},0.26)`);
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(ox, oy, bw, bh);
      ctx.restore();
    }

    // ---- little lights running along the frame: a wave of light travels along them
    const studs = Math.round(L / (level === 0 ? 22 : 34));
    for (let i = 0; i < studs; i++) {
      const p = this.point(((i + 0.5) / studs) * L, bw, bh, R, ox, oy);
      const wave = 0.5 + 0.5 * Math.sin(t * 4.2 - i * (level === 0 ? 0.75 : 1.2));
      const sz = 1.8 + 2.2 * wave;
      const x = p.x + p.nx * 2.2;
      const y = p.y + p.ny * 2.2;
      ctx.fillStyle = `rgba(${th.stud},${0.35 + 0.65 * wave})`;
      this.stud(ctx, kind, x, y, sz, i);
      if (wave > 0.82) ctx.drawImage(dt0.glow, x - 11, y - 11, 22, 22);
    }

    // ---- two comets circle the button; the trail is a chain of ready-made soft dots
    const heads: number[] = [];
    const steps = level === 0 ? 24 : 14;
    const gap = level === 0 ? 6.6 : 11.4;
    for (let c = 0; c < 2; c++) {
      const head = (t * 0.32 + c * 0.5) * L;
      heads.push(head);
      for (let k = steps - 1; k >= 0; k--) {
        const p = this.point(head - k * gap, bw, bh, R, ox, oy);
        const f = 1 - k / steps;
        const sprite = k < 1 ? dt0.head : k < 8 ? dt0.neck : dt0.tail;
        const size = 5 + 9 * f;
        ctx.globalAlpha = Math.min(1, f * 1.05);
        ctx.drawImage(sprite, p.x + p.nx * 2 - size / 2, p.y + p.ny * 2 - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      const hp = this.point(head, bw, bh, R, ox, oy);
      ctx.drawImage(dt0.head, hp.x - 8, hp.y - 8, 16, 16);
    }

    // ---- tiny sparks fall away from the comets
    this.spawnT -= dt;
    const rate = level === 0 ? 0.08 : 0.22;
    while (this.spawnT <= 0) {
      this.spawnT += rate;
      const p = this.point(heads[Math.floor(Math.random() * heads.length)] - Math.random() * 14, bw, bh, R, ox, oy);
      this.sparks.push({ x: p.x, y: p.y, vx: p.nx * (8 + Math.random() * 12) + (Math.random() - 0.5) * 10, vy: p.ny * (8 + Math.random() * 12) - (kind === 'fire' ? 22 : 4) + Math.random() * 6, life: 0.7, max: 0.7, s: 1 + Math.random() * 1.6 });
    }
    for (const sp of this.sparks) {
      sp.life -= dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vx *= 0.98;
      const k = Math.max(0, sp.life / sp.max);
      ctx.fillStyle = `rgba(${th.spark},${k})`;
      const s = sp.s * (0.6 + k);
      ctx.fillRect(sp.x - s / 2, sp.y - s / 2, s, s);
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.sparks.length > 24) this.sparks.splice(0, this.sparks.length - 24);
    ctx.restore();
  }

  /** One small light on the frame: a glowing dot for fire, a four-point star for frost, a diamond for the gem. */
  private stud(ctx: Ctx, kind: PlayFxKind, x: number, y: number, s: number, i: number): void {
    ctx.beginPath();
    if (kind === 'fire') {
      ctx.arc(x, y, s * 0.85, 0, Math.PI * 2);
    } else if (kind === 'ice') {
      ctx.moveTo(x, y - s * 1.5);
      ctx.lineTo(x + s * 0.4, y - s * 0.4);
      ctx.lineTo(x + s * 1.5, y);
      ctx.lineTo(x + s * 0.4, y + s * 0.4);
      ctx.lineTo(x, y + s * 1.5);
      ctx.lineTo(x - s * 0.4, y + s * 0.4);
      ctx.lineTo(x - s * 1.5, y);
      ctx.lineTo(x - s * 0.4, y - s * 0.4);
      ctx.closePath();
    } else {
      void i;
      ctx.moveTo(x, y - s * 1.3);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s * 1.3);
      ctx.lineTo(x - s, y);
      ctx.closePath();
    }
    ctx.fill();
  }
}
