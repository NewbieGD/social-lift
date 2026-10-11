// The Play button in the mayor's colours: real effects drawn on a canvas around the button (like the
// aura of the hero), not just a colour.
//   fire     tongues of flame all around the edge, sparks flying up, a hot rim
//   ice      frost on the edge, ice crystals and icicles, twinkling stars, cold mist
//   emerald  energy comets that circle the button, prism light inside, sparks of gems and crystals at the corners
// The canvas is a few pixels larger than the button on each side (`pad`); the button lies at (pad, pad).

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
  rot: number;
}

interface PerimeterPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

function rnd(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class PlayFx {
  private sparks: Spark[] = [];
  private spawnT = 0;
  private key = '';
  private crystals: { s: number; len: number; w: number; tilt: number; star: boolean }[] = [];
  private frost: { x: number; y: number; r: number; a: number }[] = [];

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

  private length(bw: number, bh: number, R: number): number {
    return 2 * (bw - 2 * R) + 2 * (bh - 2 * R) + 2 * Math.PI * R;
  }

  /**
   * Draws the effect. (ox, oy) is the top-left corner of the button inside the canvas, (bw, bh) its size,
   * `t` the time in seconds, `dt` the time since the last frame, `level` 0 full, 1 lighter.
   */
  draw(ctx: Ctx, kind: PlayFxKind, ox: number, oy: number, bw: number, bh: number, t: number, dt: number, level = 0): void {
    const R = Math.min(bh * 0.3, 18);
    const L = this.length(bw, bh, R);
    const key = `${kind}|${Math.round(bw)}|${Math.round(bh)}`;
    if (key !== this.key) { this.key = key; this.sparks.length = 0; this.build(kind, bw, bh, R, L); }
    ctx.save();
    if (kind === 'fire') this.fire(ctx, ox, oy, bw, bh, R, L, t, dt, level);
    else if (kind === 'ice') this.ice(ctx, ox, oy, bw, bh, R, L, t, level);
    else this.emerald(ctx, ox, oy, bw, bh, R, L, t, dt, level);
    ctx.restore();
  }

  /** The things that do not change between frames (crystal positions, frost grains). */
  private build(kind: PlayFxKind, bw: number, bh: number, _R: number, L: number): void {
    this.crystals = [];
    this.frost = [];
    if (kind !== 'ice') return;
    const n = Math.max(24, Math.round(L / 11));
    for (let i = 0; i < n; i++) {
      const s = ((i + 0.5 + (rnd(i) - 0.5) * 0.6) / n) * L;
      this.crystals.push({ s, len: 6 + rnd(i * 3.1) * 12, w: 3 + rnd(i * 5.7) * 3.4, tilt: (rnd(i * 7.9) - 0.5) * 0.5, star: rnd(i * 2.3) > 0.82 });
    }
    for (let i = 0; i < 90; i++) {
      this.frost.push({ x: rnd(i * 1.7) * bw, y: rnd(i * 4.3) * bh, r: 0.5 + rnd(i * 9.1) * 1.4, a: 0.25 + rnd(i * 6.1) * 0.5 });
    }
  }

  // ------------------------------------------------------------------ fire
  private fire(ctx: Ctx, ox: number, oy: number, bw: number, bh: number, R: number, L: number, t: number, dt: number, level: number): void {
    ctx.globalCompositeOperation = 'lighter';
    // A hot rim all around the edge.
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(255,140,40,${0.5 + 0.2 * Math.sin(t * 9)})`;
    ctx.beginPath();
    ctx.roundRect(ox, oy, bw, bh, R);
    ctx.stroke();
    // Tongues of flame: each starts on the edge and leans outwards and upwards.
    const n = level === 0 ? Math.round(L / 9) : Math.round(L / 15);
    for (let i = 0; i < n; i++) {
      const s = ((i + 0.5) / n) * L;
      const p = this.point(s, bw, bh, R, ox, oy);
      const ph = i * 1.93;
      const flick = 0.55 + 0.45 * Math.sin(t * 8.5 + ph) * Math.sin(t * 4.7 + ph * 1.7);
      const base = 11 + 15 * (0.65 + 0.35 * Math.sin(i * 12.9));
      const h = base * (0.55 + 0.7 * Math.max(0, flick));
      let dx = p.nx;
      let dy = p.ny - 1.05;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const px = -dy;
      const py = dx;
      const sway = Math.sin(t * 6 + ph) * 3.2;
      const tipX = p.x + dx * h + px * sway;
      const tipY = p.y + dy * h + py * sway;
      for (const [f, col] of [[1, 'rgba(255,70,15,0.8)'], [0.7, 'rgba(255,150,40,0.85)'], [0.4, 'rgba(255,235,140,0.9)']] as [number, string][]) {
        const w = 6.6 * f;
        ctx.beginPath();
        ctx.moveTo(p.x - px * w, p.y - py * w);
        ctx.quadraticCurveTo(p.x - px * w * 0.9 + dx * h * 0.55 * f, p.y - py * w * 0.9 + dy * h * 0.55 * f, p.x + (tipX - p.x) * f + px * sway * 0.3, p.y + (tipY - p.y) * f);
        ctx.quadraticCurveTo(p.x + px * w * 0.9 + dx * h * 0.55 * f, p.y + py * w * 0.9 + dy * h * 0.55 * f, p.x + px * w, p.y + py * w);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
      }
    }
    // Sparks and embers fly up from the edge.
    this.spawnT -= dt;
    const rate = level === 0 ? 0.045 : 0.09;
    while (this.spawnT <= 0) {
      this.spawnT += rate;
      const p = this.point(Math.random() * L, bw, bh, R, ox, oy);
      this.sparks.push({ x: p.x, y: p.y, vx: p.nx * (6 + Math.random() * 12) + (Math.random() - 0.5) * 14, vy: -(26 + Math.random() * 46) + p.ny * 8, life: 0.7 + Math.random() * 0.8, max: 1.4, s: 1 + Math.random() * 1.8, rot: 0 });
    }
    for (const sp of this.sparks) {
      sp.life -= dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vx *= 0.985;
      const k = Math.max(0, sp.life / sp.max);
      ctx.fillStyle = k > 0.5 ? `rgba(255,236,150,${k})` : `rgba(255,120,40,${k * 1.6})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.s * (0.5 + k), 0, Math.PI * 2);
      ctx.fill();
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.sparks.length > 120) this.sparks.splice(0, this.sparks.length - 120);
  }

  // ------------------------------------------------------------------ ice
  private ice(ctx: Ctx, ox: number, oy: number, bw: number, bh: number, R: number, _L: number, t: number, level: number): void {
    // Frost on the surface of the button: white grain near the edge and a frosted rim.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ox, oy, bw, bh, R);
    ctx.clip();
    for (const [cx, cy] of [[0, 0], [bw, 0], [0, bh], [bw, bh]]) {
      const g = ctx.createRadialGradient(ox + cx, oy + cy, 0, ox + cx, oy + cy, Math.min(bw, bh) * 0.8);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy, bw, bh);
    }
    const edge = ctx.createLinearGradient(0, oy, 0, oy + bh);
    edge.addColorStop(0, 'rgba(255,255,255,0.4)');
    edge.addColorStop(0.18, 'rgba(255,255,255,0)');
    edge.addColorStop(0.82, 'rgba(255,255,255,0)');
    edge.addColorStop(1, 'rgba(255,255,255,0.45)');
    ctx.fillStyle = edge;
    ctx.fillRect(ox, oy, bw, bh);
    for (const f of this.frost) {
      const dEdge = Math.min(f.x, bw - f.x, f.y, bh - f.y);
      if (dEdge > 14) continue;
      ctx.fillStyle = `rgba(255,255,255,${f.a * (1 - dEdge / 14)})`;
      ctx.beginPath();
      ctx.arc(ox + f.x, oy + f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = 'rgba(240,252,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(ox, oy, bw, bh, R);
    ctx.stroke();
    // Cold glow.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 5;
    ctx.strokeStyle = `rgba(110,200,255,${0.22 + 0.1 * Math.sin(t * 2)})`;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // Crystals and icicles growing from the edge (icicles hang from the bottom).
    for (let i = 0; i < this.crystals.length; i++) {
      if (level > 0 && i % 2) continue;
      const c = this.crystals[i];
      const p = this.point(c.s, bw, bh, R, ox, oy);
      const down = p.ny > 0.5;
      const grow = 1 + 0.06 * Math.sin(t * 1.6 + i);
      const len = c.len * grow * (down ? 1.5 : 1);
      const a = Math.atan2(p.ny, p.nx) + c.tilt;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const px = -dy;
      const py = dx;
      const w = c.w * (down ? 0.75 : 1);
      const g = ctx.createLinearGradient(p.x, p.y, p.x + dx * len, p.y + dy * len);
      g.addColorStop(0, 'rgba(150,215,255,0.95)');
      g.addColorStop(0.6, 'rgba(225,246,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.beginPath();
      ctx.moveTo(p.x - px * w, p.y - py * w);
      ctx.lineTo(p.x + dx * len, p.y + dy * len);
      ctx.lineTo(p.x + px * w, p.y + py * w);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = 'rgba(70,150,220,0.8)';
      ctx.stroke();
      // A bright facet along one side of the crystal.
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(p.x - px * w * 0.35, p.y - py * w * 0.35);
      ctx.lineTo(p.x + dx * len * 0.85, p.y + dy * len * 0.85);
      ctx.stroke();
      if (c.star) {
        const tw = Math.max(0, Math.sin(t * 2.4 + i * 1.7));
        if (tw > 0.2) {
          const sx = p.x + dx * len;
          const sy = p.y + dy * len;
          ctx.strokeStyle = `rgba(255,255,255,${tw})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(sx - 4 * tw, sy);
          ctx.lineTo(sx + 4 * tw, sy);
          ctx.moveTo(sx, sy - 4 * tw);
          ctx.lineTo(sx, sy + 4 * tw);
          ctx.stroke();
        }
      }
    }
    // Cold mist drifting along the bottom.
    if (level === 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = ox + ((i * 0.23 + t * 0.03) % 1) * bw;
        const y = oy + bh + 4 + Math.sin(t * 0.8 + i) * 3;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
        g.addColorStop(0, 'rgba(200,235,255,0.2)');
        g.addColorStop(1, 'rgba(200,235,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 22, y - 22, 44, 44);
      }
    }
  }

  // ------------------------------------------------------------------ emerald
  private emerald(ctx: Ctx, ox: number, oy: number, bw: number, bh: number, R: number, L: number, t: number, dt: number, level: number): void {
    // A prism of light sliding across the gem.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ox, oy, bw, bh, R);
    ctx.clip();
    const x = ox + (((t * 0.42) % 1.5) - 0.25) * bw;
    const g = ctx.createLinearGradient(x - 40, oy, x + 40, oy + bh);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(235,255,242,0.34)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, bw, bh);
    // Facets: a few thin lines that catch the light in turn.
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = Math.max(0, Math.sin(t * 1.3 + i * 1.4));
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * a})`;
      ctx.beginPath();
      ctx.moveTo(ox + bw * (0.1 + i * 0.2), oy);
      ctx.lineTo(ox + bw * (0.3 + i * 0.2), oy + bh);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    // A glowing rim.
    ctx.lineWidth = 13;
    ctx.strokeStyle = `rgba(60,235,140,${0.1 + 0.05 * Math.sin(t * 2.2)})`;
    ctx.beginPath();
    ctx.roundRect(ox, oy, bw, bh, R);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(90,255,160,${0.5 + 0.15 * Math.sin(t * 2.2)})`;
    ctx.stroke();
    // Emerald studs run around the edge: a wave of light travels along them.
    const studs = Math.round(L / 22);
    for (let i = 0; i < studs; i++) {
      const p = this.point(((i + 0.5) / studs) * L, bw, bh, R, ox, oy);
      const wave = 0.5 + 0.5 * Math.sin(t * 4.2 - i * 0.75);
      const sz = 2.6 + 2.4 * wave;
      ctx.fillStyle = `rgba(190,255,220,${0.45 + 0.55 * wave})`;
      ctx.beginPath();
      ctx.moveTo(p.x + p.nx * 2, p.y + p.ny * 2 - sz * 1.3);
      ctx.lineTo(p.x + p.nx * 2 + sz, p.y + p.ny * 2);
      ctx.lineTo(p.x + p.nx * 2, p.y + p.ny * 2 + sz * 1.3);
      ctx.lineTo(p.x + p.nx * 2 - sz, p.y + p.ny * 2);
      ctx.closePath();
      ctx.fill();
      if (wave > 0.8) {
        const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 11);
        gg.addColorStop(0, 'rgba(160,255,200,0.55)');
        gg.addColorStop(1, 'rgba(160,255,200,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(p.x - 11, p.y - 11, 22, 22);
      }
    }
    // Two comets of green energy circle the button, each with a long trail.
    ctx.lineCap = 'round';
    for (let c = 0; c < 2; c++) {
      const head = (t * 0.32 + c * 0.5) * L;
      const steps = level === 0 ? 38 : 22;
      for (let k = 0; k < steps; k++) {
        const p = this.point(head - k * 4.2, bw, bh, R, ox, oy);
        const q = this.point(head - (k + 1) * 4.2, bw, bh, R, ox, oy);
        const f = 1 - k / steps;
        ctx.strokeStyle = k < 3 ? `rgba(235,255,245,${f})` : `rgba(80,240,150,${f * 0.85})`;
        ctx.lineWidth = 2 + 6.5 * f;
        ctx.beginPath();
        ctx.moveTo(p.x + p.nx * 2, p.y + p.ny * 2);
        ctx.lineTo(q.x + q.nx * 2, q.y + q.ny * 2);
        ctx.stroke();
      }
      const hp = this.point(head, bw, bh, R, ox, oy);
      const hg = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, 12);
      hg.addColorStop(0, 'rgba(255,255,255,0.95)');
      hg.addColorStop(0.4, 'rgba(120,255,180,0.6)');
      hg.addColorStop(1, 'rgba(60,220,130,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(hp.x - 12, hp.y - 12, 24, 24);
    }
    // Sparks of gems: small diamonds that pop out of the edge and turn as they fade.
    this.spawnT -= dt;
    const rate = level === 0 ? 0.11 : 0.2;
    while (this.spawnT <= 0) {
      this.spawnT += rate;
      const p = this.point(Math.random() * L, bw, bh, R, ox, oy);
      this.sparks.push({ x: p.x, y: p.y, vx: p.nx * (12 + Math.random() * 14), vy: p.ny * (12 + Math.random() * 14) - 6, life: 0.8, max: 0.8, s: 2.2 + Math.random() * 2.6, rot: Math.random() * 3 });
    }
    for (const sp of this.sparks) {
      sp.life -= dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.rot += dt * 3;
      const k = Math.max(0, sp.life / sp.max);
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.rot);
      ctx.fillStyle = `rgba(170,255,205,${k})`;
      ctx.beginPath();
      ctx.moveTo(0, -sp.s * 1.3);
      ctx.lineTo(sp.s, 0);
      ctx.lineTo(0, sp.s * 1.3);
      ctx.lineTo(-sp.s, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.sparks.length > 80) this.sparks.splice(0, this.sparks.length - 80);
    // Emerald crystals at the four corners.
    ctx.globalCompositeOperation = 'source-over';
    for (const [cx, cy, sx, sy] of [[ox, oy, -1, -1], [ox + bw, oy, 1, -1], [ox, oy + bh, -1, 1], [ox + bw, oy + bh, 1, 1]] as [number, number, number, number][]) {
      for (let k = 0; k < 3; k++) {
        const ang = Math.atan2(sy, sx) + (k - 1) * 0.5;
        const len = 9 + k * 3 + (k === 1 ? 5 : 0) + 1.2 * Math.sin(t * 1.5 + cx + k);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const px = -dy;
        const py = dx;
        const w = 3.2;
        ctx.beginPath();
        ctx.moveTo(cx - px * w, cy - py * w);
        ctx.lineTo(cx + dx * len - px * w * 0.4, cy + dy * len - py * w * 0.4);
        ctx.lineTo(cx + dx * (len + 3), cy + dy * (len + 3));
        ctx.lineTo(cx + dx * len + px * w * 0.4, cy + dy * len + py * w * 0.4);
        ctx.lineTo(cx + px * w, cy + py * w);
        ctx.closePath();
        const gg = ctx.createLinearGradient(cx, cy, cx + dx * len, cy + dy * len);
        gg.addColorStop(0, '#0E8A4A');
        gg.addColorStop(0.7, '#3FE08A');
        gg.addColorStop(1, '#D8FFE8');
        ctx.fillStyle = gg;
        ctx.fill();
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = 'rgba(8,80,44,0.9)';
        ctx.stroke();
      }
    }
  }
}
