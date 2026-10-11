// The story of the career told by the backgrounds of a run, one scene for each of the 13 stages:
//   0 the yard          1 the office basement   2 the open office        3 the private office
//   4 the car showroom  5 buying a house        6 the empty house        7 the furnished house
//   8 the business      9 fame                  10 the mansion           11 the yacht      12 the spaceport
// Every scene is drawn in the manner of the brick yard of the main screen: a full-width wall with
// real texture, a few BIG props with outlines, bevels and shade, pools of light under lamps, darker
// sides and a lighter middle (so that the platforms stay readable). Static things are drawn once
// into a cached tile (the tile repeats up the screen, so everything wraps), the small living details
// are drawn on top every frame by drawStoryDecor, each with a slow period (no flicker), and weak
// phones get only the cheapest of them. No brands or logos (rule 2.1.4): signs are generic words.
import { car, rect, rng, rr, type G } from './scenes';

export const STORY_TIERS = 13;
/** Props are about a third larger than the first version: the background must be read at a glance. */
const S = 1.35;

type Decor = (ctx: CanvasRenderingContext2D, W: number, H: number, at: (y: number) => number[], t: number, low: boolean) => void;
interface Scene {
  sky?: (g: G, W: number, H: number) => void;
  tile?: (g: G, W: number, H: number) => void;
  decor?: Decor;
}

// ------------------------------------------------------------------ shared brushes
function shadeSides(g: G, W: number, H: number, a = 0.5): void {
  const s = g.createLinearGradient(0, 0, W, 0);
  s.addColorStop(0, `rgba(8,6,10,${a})`);
  s.addColorStop(0.24, 'rgba(8,6,10,0)');
  s.addColorStop(0.76, 'rgba(8,6,10,0)');
  s.addColorStop(1, `rgba(8,6,10,${a + 0.05})`);
  g.fillStyle = s;
  g.fillRect(0, 0, W, H);
}

function pool(g: G, x: number, y: number, rad: number, rgb: string, a: number): void {
  g.save();
  g.globalCompositeOperation = 'lighter';
  const p = g.createRadialGradient(x, y, 0, x, y, rad);
  p.addColorStop(0, `rgba(${rgb},${a})`);
  p.addColorStop(0.5, `rgba(${rgb},${a * 0.32})`);
  p.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = p;
  g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  g.restore();
}

function shadow(g: G, x: number, y: number, w: number, h: number): void {
  const sh = g.createLinearGradient(0, y, 0, y + h);
  sh.addColorStop(0, 'rgba(0,0,0,0.38)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(x, y, w, h);
}

/** A band of molding at the top of the tile (where one storey ends and the next begins). */
function molding(g: G, W: number, h: number, base: string, light: string): void {
  g.fillStyle = base;
  g.fillRect(0, 0, W, h);
  g.fillStyle = light;
  g.fillRect(0, 0, W, Math.max(1.5, h * 0.3));
  shadow(g, 0, h, W, h * 3.4);
}

/** Bricks of several shades with a bevel on each (the wall of the main screen). */
function brickWall(g: G, W: number, H: number, palette: string[], mortar: string, bw: number, brickH: number, seed = 77): void {
  const r = rng(seed);
  const rows = Math.max(2, 2 * Math.round(H / (2 * brickH)));
  const bh = H / rows;
  g.fillStyle = mortar;
  g.fillRect(0, 0, W, H);
  for (let row = 0; row < rows; row++) {
    const y = row * bh;
    const off = row % 2 ? -bw / 2 : 0;
    for (let x = off; x < W; x += bw) {
      g.fillStyle = palette[Math.floor(r() * palette.length)];
      g.fillRect(x + 0.8, y + 0.8, bw - 1.6, bh - 1.6);
      g.fillStyle = 'rgba(255,220,190,0.11)';
      g.fillRect(x + 0.8, y + 0.8, bw - 1.6, Math.max(1, bh * 0.14));
      g.fillStyle = 'rgba(0,0,0,0.17)';
      g.fillRect(x + 0.8, y + bh - 0.8 - Math.max(1, bh * 0.16), bw - 1.6, Math.max(1, bh * 0.16));
      if (r() < 0.08) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(x + 0.8, y + 0.8, bw - 1.6, bh - 1.6);
      }
    }
  }
}

/** Blocks (concrete, stone) in staggered rows. */
function blockWall(g: G, W: number, H: number, colors: string[], bw: number, brickH: number, seed: number): void {
  brickWall(g, W, H, colors, 'rgba(10,8,8,1)', bw, brickH, seed);
}

/** Plain painted plaster with a light grain and faint stains. */
function plaster(g: G, W: number, H: number, c1: string, c2: string, seed: number): void {
  const r = rng(seed);
  const s = g.createLinearGradient(0, 0, 0, H);
  s.addColorStop(0, c1);
  s.addColorStop(0.5, c2);
  s.addColorStop(1, c1);
  g.fillStyle = s;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 360; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
    g.fillRect(r() * W, r() * H, 1 + r() * 2.4, 1 + r() * 1.6);
  }
  for (let i = 0; i < 5; i++) {
    const sg = g.createRadialGradient(r() * W, r() * H, 2, r() * W, r() * H, 70);
    sg.addColorStop(0, 'rgba(0,0,0,0.08)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);
  }
}

/** Vertical wood planks (paneling, deck). */
function planks(g: G, x: number, y: number, w: number, h: number, c1: string, c2: string, pw: number, seed: number): void {
  const r = rng(seed);
  for (let px = x; px < x + w; px += pw) {
    g.fillStyle = r() < 0.5 ? c1 : c2;
    g.fillRect(px, y, pw, h);
    g.fillStyle = 'rgba(255,230,190,0.08)';
    g.fillRect(px, y, 1.4, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(px + pw - 1.5, y, 1.5, h);
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (let k = 0; k < 4; k++) g.fillRect(px + 2 + r() * (pw - 5), y + r() * h, 0.9, 10 + r() * 30);
  }
}

/** A window with a dark frame, a sill with a shadow, glass in a gradient and a reflection. */
function win(g: G, x: number, y: number, w: number, h: number, top: string, bottom: string, frame = '#1B1614', bars = false, arch = false): void {
  g.fillStyle = frame;
  if (arch) {
    g.beginPath();
    g.moveTo(x - 5, y + h + 5);
    g.lineTo(x - 5, y + w / 2);
    g.arc(x + w / 2, y + w / 2, w / 2 + 5, Math.PI, 0);
    g.lineTo(x + w + 5, y + h + 5);
    g.closePath();
    g.fill();
  } else g.fillRect(x - 5, y - 5, w + 10, h + 10);
  const gl = g.createLinearGradient(x, y, x, y + h);
  gl.addColorStop(0, top);
  gl.addColorStop(1, bottom);
  g.fillStyle = gl;
  if (arch) {
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + w / 2);
    g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fill();
  } else g.fillRect(x, y, w, h);
  g.fillStyle = frame;
  g.fillRect(x + w / 2 - 1.5, y, 3, h);
  g.fillRect(x, y + h * 0.44, w, 3);
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.beginPath();
  g.moveTo(x + 4, y + 4);
  g.lineTo(x + w * 0.42, y + 4);
  g.lineTo(x + 4, y + h * 0.42);
  g.closePath();
  g.fill();
  if (bars) {
    g.fillStyle = '#6A7078';
    for (let bx = x + 8; bx < x + w - 2; bx += 11) g.fillRect(bx, y - 3, 2.6, h + 6);
  }
  g.fillStyle = '#A8A39A';
  g.fillRect(x - 10, y + h + 5, w + 20, 6);
  g.fillStyle = '#D0CBC0';
  g.fillRect(x - 10, y + h + 5, w + 20, 2);
  shadow(g, x - 8, y + h + 11, w + 16, 26);
}

function lampWall(g: G, x: number, y: number, rgb: string, a = 0.5, rad = 96): void {
  pool(g, x, y + 8, rad, rgb, a);
  g.fillStyle = '#15110F';
  g.fillRect(x - 1.6, y - 16, 3.2, 16);
  g.fillRect(x - 12, y - 18, 24, 4);
  g.beginPath();
  g.moveTo(x - 11, y);
  g.quadraticCurveTo(x, y - 16, x + 11, y);
  g.closePath();
  g.fill();
  g.fillStyle = '#FFE9A8';
  g.beginPath();
  g.ellipse(x, y + 2, 5.6, 2.8, 0, 0, Math.PI * 2);
  g.fill();
}

function plant(g: G, x: number, y: number, s: number, leaf = '#3F8A46'): void {
  g.fillStyle = '#B5562E';
  g.beginPath();
  g.moveTo(x - 9 * s, y - 14 * s);
  g.lineTo(x + 9 * s, y - 14 * s);
  g.lineTo(x + 6 * s, y);
  g.lineTo(x - 6 * s, y);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x - 6.5 * s, y - 6 * s, 13 * s, 2.4 * s);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42;
    g.fillStyle = i % 2 ? leaf : '#2F7038';
    g.beginPath();
    g.ellipse(x + Math.cos(a) * 11 * s, y - 14 * s + Math.sin(a) * 18 * s, 4.6 * s, 11 * s, a + Math.PI / 2, 0, Math.PI * 2);
    g.fill();
  }
}

function frameBox(g: G, x: number, y: number, w: number, h: number, pic: string, gold = '#C9A24A'): void {
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle = gold;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(x, y, w, 2);
  g.fillStyle = pic;
  g.fillRect(x + 4, y + 4, w - 8, h - 8);
}

function pipeV(g: G, x: number, w: number, H: number, c: string): void {
  const pg = g.createLinearGradient(x, 0, x + w, 0);
  pg.addColorStop(0, 'rgba(0,0,0,0.45)');
  pg.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  pg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = c;
  g.fillRect(x, 0, w, H);
  g.fillStyle = pg;
  g.fillRect(x, 0, w, H);
  for (let y = 30; y < H; y += 84) {
    g.fillStyle = 'rgba(10,10,12,0.8)';
    g.fillRect(x - 2.5, y, w + 5, 4);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x - 2.5, y, w + 5, 1.2);
  }
}

function pipeH(g: G, y: number, W: number, w: number, c: string): void {
  const pg = g.createLinearGradient(0, y, 0, y + w);
  pg.addColorStop(0, 'rgba(0,0,0,0.4)');
  pg.addColorStop(0.4, 'rgba(255,255,255,0.3)');
  pg.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = c;
  g.fillRect(0, y, W, w);
  g.fillStyle = pg;
  g.fillRect(0, y, W, w);
  for (let x = 40; x < W; x += 110) {
    g.fillStyle = 'rgba(10,10,12,0.8)';
    g.fillRect(x, y - 3, 5, w + 6);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x, y - 3, 1.4, w + 6);
  }
  shadow(g, 0, y + w, W, 16);
}

// ================================================================== 0. THE YARD
const YARD = {
  winA: { x: 34, y: 0.1, w: 72, h: 96 },
  winB: { x: 268, y: 0.56, w: 66, h: 88 },
  lamp: { x: 246, y: 0.3 },
  box: { x: 100, y: 0.74 },
  poster: { x: 196, y: 0.12 },
  pipeX: 12,
};

const yard: Scene = {
  sky(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#18212C');
    s.addColorStop(1, '#3A4A50');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    const r = rng(78);
    // Big, calm bricks of nearly one colour: the hero must not dissolve into the wall.
    brickWall(g, W, H, ['#6B3A30', '#643630', '#703F33', '#5F322B', '#6A382E', '#673530'], '#2A1E1C', 36, 16);
    g.fillStyle = 'rgba(14,9,10,0.26)';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      const sg = g.createLinearGradient(0, 0, 0, 100);
      sg.addColorStop(0, 'rgba(10,8,8,0.28)');
      sg.addColorStop(1, 'rgba(10,8,8,0)');
      g.save();
      g.translate(24 + r() * (W - 48), r() * H);
      g.fillStyle = sg;
      g.fillRect(0, 0, 8 + r() * 12, 100);
      g.restore();
    }
    g.fillStyle = 'rgba(70,110,60,0.22)';
    for (const [mx, my] of [[0.5, 0.92], [0.18, 0.5], [0.8, 0.28]] as [number, number][]) {
      g.beginPath();
      g.ellipse(W * mx, H * my, 24, 9, 0, 0, Math.PI * 2);
      g.fill();
    }
    molding(g, W, 9, '#8C877C', '#B6B1A4');
    shadeSides(g, W, H, 0.52);
    const a = YARD.winA;
    win(g, a.x, H * a.y, a.w, a.h, '#F2B866', '#C97F32', '#1B1614', true);
    plant(g, a.x + 20, H * a.y + a.h + 6, 0.8);
    const b = YARD.winB;
    win(g, b.x, H * b.y, b.w, b.h, '#26323F', '#141B24');
    g.fillStyle = '#3F5F58';
    g.fillRect(b.x - 18, H * b.y - 3, 14, b.h + 6);
    g.fillRect(b.x + b.w + 5, H * b.y - 3, 14, b.h + 6);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let sy = H * b.y + 2; sy < H * b.y + b.h; sy += 7) {
      g.fillRect(b.x - 18, sy, 14, 1.6);
      g.fillRect(b.x + b.w + 5, sy, 14, 1.6);
    }
    pipeV(g, YARD.pipeX, 9, H, '#59606A');
    pipeV(g, W - 20, 9, H, '#59606A');
    lampWall(g, YARD.lamp.x, H * YARD.lamp.y, '255,196,110', 0.55, 110);
    // The electrical box.
    const bx = YARD.box.x;
    const by = H * YARD.box.y;
    g.fillStyle = '#15110F';
    g.fillRect(bx - 3, by - 3, 48, 68);
    const eg = g.createLinearGradient(bx, by, bx + 42, by);
    eg.addColorStop(0, '#6A727C');
    eg.addColorStop(1, '#4A515A');
    g.fillStyle = eg;
    g.fillRect(bx, by, 42, 62);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(bx + 20, by, 2, 62);
    g.fillStyle = '#E8C030';
    g.beginPath();
    g.moveTo(bx + 21, by + 10);
    g.lineTo(bx + 34, by + 34);
    g.lineTo(bx + 8, by + 34);
    g.closePath();
    g.fill();
    g.fillStyle = '#15110F';
    g.fillRect(bx + 20, by + 17, 2.4, 8);
    g.fillRect(bx + 20, by + 27, 2.4, 3);
    g.fillStyle = '#3A3F46';
    g.fillRect(bx + 5, 0, 4, by);
    // A poster with tape.
    g.save();
    g.translate(YARD.poster.x, H * YARD.poster.y);
    g.rotate(-0.05);
    g.fillStyle = '#E8E0C8';
    g.fillRect(0, 0, 50, 66);
    g.fillStyle = '#C0397A';
    g.fillRect(5, 5, 40, 16);
    g.fillStyle = 'rgba(40,40,60,0.55)';
    for (let ly = 28; ly < 58; ly += 6.5) g.fillRect(6, ly, 32 + (ly % 3) * 3, 2);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(-4, -3, 12, 6);
    g.fillRect(42, -3, 12, 6);
    g.restore();
    g.strokeStyle = 'rgba(12,10,10,0.85)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(YARD.pipeX + 9, H * 0.3);
    g.quadraticCurveTo(W * 0.3, H * 0.3 + 26, W * 0.52, H * 0.27);
    g.quadraticCurveTo(W * 0.66, H * 0.25 + 12, YARD.lamp.x - 12, H * YARD.lamp.y - 12);
    g.stroke();
  },
  decor(ctx, _W, H, at, t, low) {
    const wa = YARD.winA;
    const wb = YARD.winB;
    for (const sy of at(H * YARD.lamp.y)) {
      ctx.globalAlpha = 0.12 + 0.06 * Math.sin(t * 1.3);
      ctx.fillStyle = '#FFD88C';
      ctx.beginPath();
      ctx.arc(YARD.lamp.x, sy + 6, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!low) {
        ctx.fillStyle = 'rgba(255,244,210,0.95)';
        ctx.fillRect(YARD.lamp.x + Math.cos(t * 2.6) * 17, sy + 3 + Math.sin(t * 3.4) * 10, 2, 2);
      }
    }
    for (const sy of at(H * wa.y)) {
      const sw = Math.sin(t * 1.1) * (low ? 2 : 4.5);
      ctx.fillStyle = 'rgba(230,80,100,0.84)';
      for (const side of [0, 1]) {
        const x0 = side ? wa.x + wa.w : wa.x;
        const dir = side ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x0, sy);
        ctx.lineTo(x0 + dir * 24, sy);
        ctx.quadraticCurveTo(x0 + dir * (16 + sw * dir), sy + wa.h * 0.5, x0 + dir * (20 + sw * 1.4 * dir), sy + wa.h * 0.9);
        ctx.lineTo(x0, sy + wa.h * 0.9);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const sy of at(H * wb.y + wb.h + 6)) {
      const cx = wb.x + 14;
      ctx.fillStyle = 'rgba(15,15,20,0.95)';
      ctx.beginPath();
      ctx.ellipse(cx, sy - 8, 12, 8, 0, 0, Math.PI * 2);
      ctx.arc(cx + 11, sy - 17, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 7, sy - 21);
      ctx.lineTo(cx + 8, sy - 28);
      ctx.lineTo(cx + 12, sy - 22);
      ctx.moveTo(cx + 12, sy - 22);
      ctx.lineTo(cx + 15.5, sy - 28);
      ctx.lineTo(cx + 17, sy - 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,15,20,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 11, sy - 5);
      ctx.quadraticCurveTo(cx - 20, sy - 14 + Math.sin(t * 2.2) * 6, cx - 16 + Math.sin(t * 2.2) * 5, sy - 25);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,224,120,0.95)';
      ctx.fillRect(cx + 12, sy - 17, 2, 2);
    }
    if (low) return;
    for (const sy of at(H * YARD.box.y - 3)) {
      const flap = Math.sin(t * 0.7) > 0.93 ? Math.sin(t * 26) * 4.5 : 0;
      const cx = YARD.box.x + 22;
      ctx.fillStyle = '#0E1014';
      ctx.beginPath();
      ctx.ellipse(cx, sy - 7, 9, 6, -0.2, 0, Math.PI * 2);
      ctx.arc(cx - 9, sy - 12, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 13, sy - 12);
      ctx.lineTo(cx - 19, sy - 11);
      ctx.lineTo(cx - 13, sy - 9);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 3, sy - 9);
      ctx.lineTo(cx + 8, sy - 16 - flap);
      ctx.lineTo(cx + 12, sy - 6);
      ctx.fill();
    }
    for (const sy of at(H * YARD.poster.y + 62)) {
      const k = (t * 0.2) % 1;
      ctx.save();
      ctx.translate(YARD.poster.x + 40 + Math.sin(k * 14) * 10 * k, sy + k * 70);
      ctx.rotate(k * 6);
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#E8E0C8';
      ctx.fillRect(-5, -4, 10, 8);
      ctx.restore();
    }
  },
};

// ================================================================== 1. THE OFFICE BASEMENT
const BASE = { shelf: { x: 8, y: 0.34 }, rack: { x: 276, y: 0.12 }, copier: { x: 14, y: 0.72 }, bulb: { x: 150, y: 0.04 }, valveY: 0.52 };

const basement: Scene = {
  sky(g, W, H) {
    g.fillStyle = '#241E1A';
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    blockWall(g, W, H, ['#3C3530', '#352F2B', '#413A34', '#2F2A26', '#46403A'], 30 * S, 11 * S, 91);
    const r = rng(92);
    for (let i = 0; i < 6; i++) {
      const sg = g.createRadialGradient(r() * W, r() * H, 3, r() * W, r() * H, 80);
      sg.addColorStop(0, 'rgba(0,0,0,0.2)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sg;
      g.fillRect(0, 0, W, H);
    }
    molding(g, W, 9, '#3A3834', '#5A5750');
    pipeH(g, H * 0.18, W, 15, '#B87333');
    pipeH(g, H * 0.62, W, 13, '#3F6E9A');
    pipeV(g, 20, 13, H, '#6E7A84');
    pipeV(g, W - 30, 13, H, '#6E7A84');
    // A valve wheel on the blue pipe.
    const vy = H * BASE.valveY;
    g.fillStyle = '#15110F';
    g.fillRect(250, vy - 2, 4, H * 0.62 - vy + 2);
    g.strokeStyle = '#B22A2A';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(252, vy - 8, 11, 0, Math.PI * 2);
    g.moveTo(241, vy - 8);
    g.lineTo(263, vy - 8);
    g.moveTo(252, vy - 19);
    g.lineTo(252, vy + 3);
    g.stroke();
    // The shelf with boxes and the archive plate.
    const sx = BASE.shelf.x + 26;
    const sy = H * BASE.shelf.y;
    for (const [dy, cols] of [[0, ['#9A7440', '#B08850', '#8A6A3A']], [78, ['#8A6A3A', '#A07C48', '#9A7440']]] as [number, string[]][]) {
      g.fillStyle = '#4A3C2E';
      g.fillRect(sx - 8, sy + dy + 46, 120, 6);
      shadow(g, sx - 8, sy + dy + 52, 120, 12);
      let bx = sx;
      for (let i = 0; i < 3; i++) {
        const bw = 32 + (i % 2) * 6;
        const bh = 34 + ((i * 7) % 12);
        rect(g, bx, sy + dy + 46 - bh, bw, bh, cols[i]);
        rect(g, bx + bw / 2 - 2, sy + dy + 46 - bh, 4, bh, 'rgba(255,255,255,0.35)');
        rect(g, bx, sy + dy + 46 - bh, bw, 3, 'rgba(255,255,255,0.14)');
        bx += bw + 4;
      }
    }
    rr(g, sx - 6, sy + 150, 70, 17, 3, '#CBB98A');
    g.fillStyle = '#4A3A22';
    g.font = '700 11px sans-serif';
    g.textAlign = 'center';
    g.fillText('АРХИВ', sx + 29, sy + 163);
    g.textAlign = 'left';
    // The server rack.
    const rx = BASE.rack.x;
    const ry = H * BASE.rack.y;
    g.fillStyle = '#0E1116';
    g.fillRect(rx - 3, ry - 3, 70, 150);
    for (let i = 0; i < 8; i++) {
      rect(g, rx + 3, ry + 4 + i * 17, 58, 13, '#232B36');
      rect(g, rx + 6, ry + 7 + i * 17, 18, 3, '#0A0D12');
      rect(g, rx + 3, ry + 4 + i * 17, 58, 1.5, 'rgba(255,255,255,0.1)');
    }
    // The copier.
    const cx = BASE.copier.x;
    const cy = H * BASE.copier.y;
    g.fillStyle = '#15110F';
    g.fillRect(cx - 2, cy - 2, 96, 66);
    const cg = g.createLinearGradient(cx, cy, cx, cy + 62);
    cg.addColorStop(0, '#C4C9CF');
    cg.addColorStop(1, '#8E959C');
    g.fillStyle = cg;
    g.fillRect(cx, cy, 92, 62);
    g.fillStyle = '#6A7078';
    g.fillRect(cx, cy, 92, 12);
    g.fillStyle = '#2A3036';
    g.fillRect(cx + 10, cy + 20, 34, 9);
    g.fillStyle = '#3A4048';
    g.fillRect(cx + 54, cy + 18, 26, 14);
    g.fillStyle = '#16191E';
    g.fillRect(cx + 4, cy + 42, 56, 8);
    // The bulb hangs on a wire, with its pool of light on the blocks.
    pool(g, BASE.bulb.x, H * BASE.bulb.y + 80, 120, '255,200,110', 0.3);
    shadeSides(g, W, H, 0.55);
  },
  decor(ctx, W, H, at, t, low) {
    // The bulb swings, and the light with it.
    for (const sy of at(H * BASE.bulb.y)) {
      const a = Math.sin(t * 1.15) * 0.3;
      const bx = BASE.bulb.x + Math.sin(a) * 52;
      const by = sy + Math.cos(a) * 52;
      ctx.strokeStyle = '#15110F';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(BASE.bulb.x, sy);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const flick = 0.85 + 0.15 * Math.sin(t * 7) * (Math.sin(t * 0.4) > 0.9 ? 2 : 0.4);
      if (low) {
        ctx.fillStyle = `rgba(255,210,120,${0.25 * flick})`;
        ctx.beginPath();
        ctx.arc(bx, by, 30, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, 64);
        g.addColorStop(0, `rgba(255,210,120,${0.55 * flick})`);
        g.addColorStop(1, 'rgba(255,170,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(bx - 64, by - 64, 128, 128);
        ctx.restore();
      }
      ctx.fillStyle = '#FFF2C4';
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2A2420';
      ctx.fillRect(bx - 3, by - 9, 6, 5);
    }
    // The server lights.
    for (const sy of at(H * BASE.rack.y)) {
      for (let i = 0; i < 8; i++) {
        if (Math.sin(t * (0.9 + (i % 3) * 0.35) + i * 2.3) < -0.2) continue;
        ctx.fillStyle = (i + Math.floor(t / 4)) % 5 === 0 ? '#FF5A4A' : '#52E07A';
        ctx.fillRect(BASE.rack.x + 40, sy + 8 + i * 17, 4, 4);
        if (i % 2 === 0) ctx.fillRect(BASE.rack.x + 48, sy + 8 + i * 17, 4, 4);
      }
    }
    if (low) return;
    // Steam from the valve and a drop that falls from the flange.
    for (const sy of at(H * BASE.valveY - 8)) {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i / 3) % 1;
        ctx.globalAlpha = 0.34 * Math.sin(ph * Math.PI);
        ctx.fillStyle = '#D8DEE6';
        ctx.beginPath();
        ctx.arc(252 + ph * 16 + Math.sin(ph * 6 + i) * 4, sy - ph * 46, 4 + ph * 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const sy of at(H * 0.18 + 15)) {
      const k = (t * 0.6) % 1;
      ctx.fillStyle = 'rgba(160,210,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(W * 0.34, sy + k * k * 60, 2, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The copier prints a sheet that slides out and flutters down.
    for (const sy of at(H * BASE.copier.y + 38)) {
      const ph = (t / 3.4) % 1;
      if (ph > 0.8) continue;
      const k = ph / 0.8;
      ctx.save();
      ctx.translate(BASE.copier.x + 70 + k * 36, sy + k * k * 60);
      ctx.rotate(0.3 + Math.sin(k * 9) * 0.4 * k);
      ctx.globalAlpha = 1 - Math.max(0, (k - 0.7) / 0.3);
      ctx.fillStyle = '#F4F4EE';
      ctx.fillRect(-9, -6, 18, 12);
      ctx.fillStyle = 'rgba(40,40,60,0.45)';
      ctx.fillRect(-6, -3, 12, 1.4);
      ctx.fillRect(-6, 0.5, 9, 1.4);
      ctx.restore();
    }
  },
};

// ================================================================== 2. THE OPEN OFFICE
const OFFICE = { win: { x: 30, y: 0.07, w: 108, h: 118 }, desk: { x: 12, y: 0.55 }, board: { x: 232, y: 0.09 }, cooler: { x: 296, y: 0.58 }, clock: { x: 226, y: 0.4 } };

const office: Scene = {
  sky(g, W, H) {
    g.fillStyle = '#3A4A56';
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    plaster(g, W, H, '#4F6371', '#5A6F7D', 31);
    // A baseboard and a stripe of fabric partition on the lower part of the wall.
    g.fillStyle = '#3A4854';
    g.fillRect(0, H * 0.5, W, H * 0.5);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < W; x += 6) g.fillRect(x, H * 0.5, 2, H * 0.5);
    g.fillStyle = '#1F2830';
    g.fillRect(0, H * 0.5 - 3, W, 6);
    // The ceiling with a row of light panels (it is the top of every storey).
    g.fillStyle = '#2A343C';
    g.fillRect(0, 0, W, 16);
    for (let x = 10; x < W - 40; x += 90) {
      rr(g, x, 3, 70, 8, 3, '#F4F8FF');
    }
    pool(g, W * 0.5, 14, 200, '230,240,255', 0.2);
    shadow(g, 0, 16, W, 30);
    // A big window with the evening city.
    const w = OFFICE.win;
    win(g, w.x, H * w.y, w.w, w.h, '#233A63', '#E8A070', '#1B1F26');
    g.fillStyle = 'rgba(10,16,30,0.75)';
    for (let i = 0; i < 7; i++) {
      const bh = 24 + ((i * 17) % 40);
      g.fillRect(w.x + 4 + i * 14.5, H * w.y + w.h - bh, 12, bh);
    }
    g.fillStyle = 'rgba(255,220,150,0.85)';
    for (let i = 0; i < 18; i++) g.fillRect(w.x + 6 + ((i * 29) % 96), H * w.y + 70 + ((i * 13) % 40), 2, 3);
    // A desk with a monitor, a keyboard, a mug and a lamp.
    const dx = OFFICE.desk.x;
    const dy = H * OFFICE.desk.y;
    g.fillStyle = '#6B4E34';
    g.fillRect(dx, dy + 56, 118, 8);
    g.fillStyle = '#8A6A48';
    g.fillRect(dx, dy + 56, 118, 2.4);
    shadow(g, dx, dy + 64, 118, 22);
    g.fillStyle = '#15110F';
    g.fillRect(dx + 8, dy + 4, 62, 46);
    g.fillStyle = '#0F2236';
    g.fillRect(dx + 11, dy + 7, 56, 38);
    g.fillStyle = '#2A2F36';
    g.fillRect(dx + 33, dy + 50, 14, 6);
    g.fillRect(dx + 24, dy + 54, 32, 3);
    g.fillStyle = '#C8CDD4';
    g.fillRect(dx + 30, dy + 58 - 4, 40, 4);
    g.fillStyle = '#E8E0C8';
    g.fillRect(dx + 86, dy + 44, 12, 12);
    g.fillStyle = '#6A4A32';
    g.fillRect(dx + 88, dy + 46, 8, 3);
    g.fillStyle = '#3A3F46';
    g.fillRect(dx + 104, dy + 14, 3, 42);
    g.fillRect(dx + 98, dy + 10, 16, 5);
    pool(g, dx + 40, dy + 26, 70, '120,200,255', 0.22);
    // The whiteboard with notes, the water cooler, a plant and the clock.
    const b = OFFICE.board;
    g.fillStyle = '#B8BEC6';
    g.fillRect(b.x - 4, H * b.y - 4, 118, 86);
    g.fillStyle = '#F4F6F8';
    g.fillRect(b.x, H * b.y, 110, 78);
    const notes = ['#FFE066', '#FF8FB1', '#7FD6FF', '#9CF08A'];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = notes[i % 4];
      g.fillRect(b.x + 8 + (i % 3) * 34, H * b.y + 8 + Math.floor(i / 3) * 22, 28, 18);
    }
    g.strokeStyle = '#D8403A';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(b.x + 8, H * b.y + 68);
    g.lineTo(b.x + 34, H * b.y + 56);
    g.lineTo(b.x + 62, H * b.y + 62);
    g.lineTo(b.x + 100, H * b.y + 48);
    g.stroke();
    const c = OFFICE.cooler;
    g.fillStyle = '#9CD6F4';
    g.beginPath();
    g.ellipse(c.x + 20, H * c.y - 6, 17, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(c.x + 10, H * c.y - 24, 4, 24);
    g.fillStyle = '#E8ECF0';
    g.fillRect(c.x, H * c.y + 12, 40, 66);
    g.fillStyle = '#1F5FA8';
    g.fillRect(c.x + 8, H * c.y + 22, 8, 8);
    g.fillStyle = '#C8302A';
    g.fillRect(c.x + 24, H * c.y + 22, 8, 8);
    plant(g, W - 20, H * 0.9, 1.2);
    const k = OFFICE.clock;
    g.fillStyle = '#15110F';
    g.beginPath();
    g.arc(k.x, H * k.y, 25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#F4F6F8';
    g.beginPath();
    g.arc(k.x, H * k.y, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1B1F26';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillRect(k.x + Math.sin(a) * 18 - 1, H * k.y - Math.cos(a) * 18 - 1, 2, 2);
    }
    shadeSides(g, W, H, 0.5);
  },
  decor(ctx, W, H, at, t, low) {
    // The monitor shows bars that rise and fall.
    for (const sy of at(H * OFFICE.desk.y)) {
      for (let i = 0; i < 6; i++) {
        const bh = 6 + (Math.sin(t * 1.3 + i * 1.1) * 0.5 + 0.5) * 24;
        ctx.fillStyle = i % 2 ? '#52E07A' : '#7FD6FF';
        ctx.fillRect(OFFICE.desk.x + 15 + i * 8.6, sy + 41 - bh, 6, bh);
      }
    }
    // The second hand of the clock.
    for (const sy of at(H * OFFICE.clock.y)) {
      ctx.strokeStyle = '#C8302A';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(OFFICE.clock.x, sy);
      ctx.lineTo(OFFICE.clock.x + Math.sin(t * 2) * 17, sy - Math.cos(t * 2) * 17);
      ctx.stroke();
      ctx.strokeStyle = '#1B1F26';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(OFFICE.clock.x, sy);
      ctx.lineTo(OFFICE.clock.x + 9, sy - 6);
      ctx.stroke();
    }
    if (low) return;
    // Bubbles in the cooler and a paper plane that crosses the office now and then.
    for (const sy of at(H * OFFICE.cooler.y - 6)) {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.5 + i / 3) % 1;
        ctx.fillStyle = `rgba(255,255,255,${0.7 * Math.sin(ph * Math.PI)})`;
        ctx.beginPath();
        ctx.arc(OFFICE.cooler.x + 14 + i * 6, sy + 14 - ph * 28, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const sy of at(H * 0.34)) {
      const k = (t * 0.1) % 1;
      if (k > 0.6) continue;
      const kk = k / 0.6;
      ctx.save();
      ctx.translate(-20 + kk * (W + 40), sy + Math.sin(kk * 8) * 14 + kk * 20);
      ctx.rotate(0.15 + Math.sin(kk * 8) * 0.2);
      ctx.fillStyle = '#F4F4EE';
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(9, -3);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  },
};

// ================================================================== 3. THE PRIVATE OFFICE
const CAB = { win: { x: 28, y: 0.08, w: 96, h: 150 }, shelf: { x: 232, y: 0.1 }, clock: { x: 148, y: 0.4 }, lamp: { x: 262, y: 0.7 }, globe: { x: 296, y: 0.48 } };

const cabinet: Scene = {
  sky(g, W, H) {
    g.fillStyle = '#2B1A1A';
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    // Dark green wallpaper with a pattern above, walnut paneling below.
    plaster(g, W, H, '#22403A', '#2B4C44', 44);
    g.fillStyle = 'rgba(255,255,255,0.045)';
    for (let y = 30; y < H * 0.55; y += 30) for (let x = ((y / 30) % 2) * 15 + 8; x < W; x += 30) {
      g.beginPath();
      g.arc(x, y, 3.4, 0, Math.PI * 2);
      g.fill();
    }
    planks(g, 0, H * 0.58, W, H * 0.42, '#5A3A26', '#4E3220', 17, 45);
    g.fillStyle = '#7A5238';
    g.fillRect(0, H * 0.58 - 5, W, 8);
    g.fillStyle = 'rgba(255,230,190,0.2)';
    g.fillRect(0, H * 0.58 - 5, W, 2);
    shadow(g, 0, H * 0.58 + 3, W, 20);
    molding(g, W, 12, '#6A4A30', '#9A7248');
    // The window with the rainy city (arched) and heavy curtains.
    const w = CAB.win;
    win(g, w.x, H * w.y, w.w, w.h, '#1A2A4A', '#3E5E8C', '#1F1410', false, true);
    g.fillStyle = 'rgba(8,14,28,0.8)';
    for (let i = 0; i < 6; i++) g.fillRect(w.x + 4 + i * 15, H * w.y + w.h - 30 - ((i * 19) % 36), 12, 70);
    g.fillStyle = 'rgba(255,220,150,0.85)';
    for (let i = 0; i < 16; i++) g.fillRect(w.x + 6 + ((i * 31) % 84), H * w.y + 90 + ((i * 11) % 50), 2, 3);
    g.fillStyle = '#7A1A28';
    for (const side of [0, 1]) {
      const x0 = side ? w.x + w.w + 6 : w.x - 6;
      const dir = side ? -1 : 1;
      g.beginPath();
      g.moveTo(x0, H * w.y - 8);
      g.lineTo(x0 + dir * 30, H * w.y - 8);
      g.quadraticCurveTo(x0 + dir * 22, H * w.y + w.h * 0.6, x0 + dir * 30, H * w.y + w.h + 6);
      g.lineTo(x0, H * w.y + w.h + 6);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#C9A24A';
    g.fillRect(w.x - 14, H * w.y - 14, w.w + 28, 6);
    // The bookshelf with rows of books and diplomas.
    const sx = CAB.shelf.x;
    const sy = H * CAB.shelf.y;
    g.fillStyle = '#1F1410';
    g.fillRect(sx - 4, sy - 4, 114, 168);
    for (let row = 0; row < 4; row++) {
      g.fillStyle = '#4A3020';
      g.fillRect(sx, sy + 38 + row * 42, 106, 5);
      let bx = sx + 4;
      const r = rng(60 + row);
      while (bx < sx + 100) {
        const bw = 6 + r() * 7;
        const bh = 22 + r() * 14;
        g.fillStyle = ['#8A2A2A', '#2A5A8A', '#C9A24A', '#3A7A4A', '#6A3A7A', '#D8D0B8'][Math.floor(r() * 6)];
        g.fillRect(bx, sy + 38 + row * 42 - bh, bw, bh);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(bx, sy + 38 + row * 42 - bh, 1.4, bh);
        bx += bw + 1;
      }
    }
    frameBox(g, 150, H * 0.2, 54, 40, '#D8D0B8');
    frameBox(g, 150, H * 0.2 + 52, 54, 40, '#C8D8E8');
    pool(g, 176, H * 0.2 + 40, 100, '255,220,150', 0.16);
    // A tall pendulum clock.
    const k = CAB.clock;
    g.fillStyle = '#3A2414';
    g.fillRect(k.x - 22, H * k.y - 8, 44, 140);
    g.fillStyle = '#5A3A24';
    g.fillRect(k.x - 22, H * k.y - 8, 44, 4);
    g.fillStyle = '#E8E0C8';
    g.beginPath();
    g.arc(k.x, H * k.y + 14, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#15110F';
    g.fillRect(k.x - 1, H * k.y + 14, 2, -9);
    g.fillRect(k.x, H * k.y + 14, 7, 2);
    g.fillStyle = '#1F1410';
    g.fillRect(k.x - 14, H * k.y + 40, 28, 84);
    // A desk lamp on a side table with a green shade, and a globe on a stand.
    const l = CAB.lamp;
    g.fillStyle = '#4A3020';
    g.fillRect(l.x - 26, H * l.y + 30, 60, 8);
    g.fillRect(l.x - 20, H * l.y + 38, 8, 40);
    g.fillRect(l.x + 20, H * l.y + 38, 8, 40);
    pool(g, l.x + 6, H * l.y + 14, 90, '255,210,120', 0.4);
    g.fillStyle = '#1F7A4A';
    g.beginPath();
    g.moveTo(l.x - 10, H * l.y + 16);
    g.lineTo(l.x + 22, H * l.y + 16);
    g.lineTo(l.x + 14, H * l.y - 2);
    g.lineTo(l.x - 2, H * l.y - 2);
    g.closePath();
    g.fill();
    g.fillStyle = '#C9A24A';
    g.fillRect(l.x + 5, H * l.y + 16, 3, 14);
    shadeSides(g, W, H, 0.55);
  },
  decor(ctx, W, H, at, t, low) {
    // Rain runs down the glass of the window.
    const w = CAB.win;
    for (const sy of at(H * w.y)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(w.x, sy, w.w, w.h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(190,220,255,0.55)';
      ctx.lineWidth = 1.3;
      const n = low ? 6 : 12;
      for (let i = 0; i < n; i++) {
        const x = w.x + ((i * 37) % w.w);
        const y = sy + ((t * (70 + (i % 4) * 22) + i * 53) % (w.h + 20)) - 10;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2.6, y + 12);
        ctx.stroke();
      }
      ctx.restore();
    }
    // The pendulum swings.
    for (const sy of at(H * CAB.clock.y + 42)) {
      const a = Math.sin(t * 2.4) * 0.34;
      ctx.strokeStyle = '#C9A24A';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(CAB.clock.x, sy);
      ctx.lineTo(CAB.clock.x + Math.sin(a) * 66, sy + Math.cos(a) * 66);
      ctx.stroke();
      ctx.fillStyle = '#D8B84A';
      ctx.beginPath();
      ctx.arc(CAB.clock.x + Math.sin(a) * 66, sy + Math.cos(a) * 66, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    // The lamp breathes.
    for (const sy of at(H * CAB.lamp.y + 14)) {
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 1.4);
      ctx.fillStyle = '#FFD890';
      ctx.beginPath();
      ctx.arc(CAB.lamp.x + 6, sy, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (low) return;
    // A globe turns: a meridian and two continents slide across it.
    for (const sy of at(H * CAB.globe.y)) {
      const cx = CAB.globe.x;
      ctx.fillStyle = '#2A5A8A';
      ctx.beginPath();
      ctx.arc(cx, sy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, sy, 22, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#4A9A5A';
      for (const [dx, dy, rx] of [[0, -6, 9], [18, 8, 8], [-24, 4, 8]] as [number, number, number][]) {
        const px = ((cx + dx + t * 12 + 40) % 80) + cx - 40;
        ctx.beginPath();
        ctx.ellipse(px, sy + dy, rx, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = '#C9A24A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, sy, 25, -2.2, 2.2);
      ctx.stroke();
      ctx.fillStyle = '#4A3020';
      ctx.fillRect(cx - 3, sy + 24, 6, 14);
      ctx.fillRect(cx - 14, sy + 36, 28, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(cx - 8, sy - 8, 6, 3, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    void W;
  },
};

// ================================================================== 4. THE CAR SHOWROOM
const SHOW = { podiumY: 0.34, podium2Y: 0.8, banner: { x: 150, y: 0.5 } };

const showroom: Scene = {
  sky(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#0B1830');
    s.addColorStop(0.6, '#1E4472');
    s.addColorStop(1, '#3E7AAE');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    const r = rng(1201);
    // The city glows behind the glass wall of the showroom.
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#0E1C38');
    s.addColorStop(1, '#2C5C8E');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 38; i++) {
      const x = r() * W;
      const y = H * 0.2 + r() * H * 0.8;
      pool(g, x, y, 8 + r() * 12, r() < 0.6 ? '255,214,140' : '150,220,255', 0.7);
    }
    g.fillStyle = 'rgba(8,16,36,0.85)';
    let bx = 0;
    while (bx < W) {
      const bw = 22 + r() * 34;
      const bh = 70 + r() * 150;
      g.fillRect(bx, H - bh, bw, bh);
      g.fillStyle = 'rgba(255,226,150,0.8)';
      for (let wy = H - bh + 8; wy < H - 6; wy += 14) for (let wx = bx + 4; wx < bx + bw - 5; wx += 9) if (r() < 0.3) g.fillRect(wx, wy, 3, 5);
      g.fillStyle = 'rgba(8,16,36,0.85)';
      bx += bw + 2;
    }
    // Mullions of the glass wall and its reflections.
    g.strokeStyle = 'rgba(210,235,255,0.35)';
    g.lineWidth = 2;
    for (let x = 0; x <= W; x += W / 4) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (const x of [W * 0.18, W * 0.55, W * 0.82]) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 34, 0);
      g.lineTo(x + 34 - H * 0.4, H);
      g.lineTo(x - H * 0.4, H);
      g.closePath();
      g.fill();
    }
    molding(g, W, 8, '#3A4658', '#6A7A92');
    // Cars on white podiums on both sides, bigger than before.
    for (const [py, px, colorA] of [[SHOW.podiumY, 6, '#D8322C'], [SHOW.podium2Y, W - 128, '#2C6BD8']] as [number, number, string][]) {
      const y = H * py;
      pool(g, px + 60, y - 20, 110, '255,245,215', 0.22);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      g.ellipse(px + 62, y + 12, 66, 9, 0, 0, Math.PI * 2);
      g.fill();
      rr(g, px, y + 2, 124, 13, 6, '#EEF1F6');
      rr(g, px + 3, y + 13, 118, 5, 2.5, '#8A94A4');
      car(g, px + 10, y - 2, 2.35, colorA, true);
      g.fillStyle = 'rgba(190,225,255,0.6)';
      g.beginPath();
      g.moveTo(px + 10 + 15 * 2.35, y - 2 - 9 * 2.35 + 2);
      g.lineTo(px + 10 + 24 * 2.35, y - 2 - 9 * 2.35 + 2);
      g.lineTo(px + 10 + 31 * 2.35, y - 2 - 5 * 2.35);
      g.lineTo(px + 10 + 15 * 2.35, y - 2 - 5 * 2.35);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(px + 10 + 6 * 2.35, y - 2 - 8 * 2.35, 14, 2);
    }
    // A red banner with a star on a stand.
    const b = SHOW.banner;
    const by = H * b.y;
    rect(g, b.x, by, 4, 120, '#7A8294');
    rr(g, b.x - 24, by - 90, 52, 84, 6, '#C8242E');
    g.fillStyle = '#FFE08A';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? 7 : 16;
      g.lineTo(b.x + 2 + Math.cos(a) * rad, by - 48 + Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
    // Ceiling tracks with spotlights.
    for (const y of [H * 0.14, H * 0.6]) {
      rect(g, 0, y, W, 5, '#8A93A3');
      for (const sx of [24, 86, W - 86, W - 24]) {
        rr(g, sx - 6, y + 5, 12, 10, 3, '#2A3040');
        g.fillStyle = 'rgba(255,245,200,0.95)';
        g.beginPath();
        g.arc(sx, y + 15, 3.6, 0, Math.PI * 2);
        g.fill();
      }
    }
    shadeSides(g, W, H, 0.45);
  },
  decor(ctx, W, H, at, t, low) {
    for (const sy of at(H * 0.14 + 15)) {
      ctx.fillStyle = 'rgba(255,245,210,0.08)';
      for (const [sx, dir] of [[24, 1], [86, -1], [W - 86, 1], [W - 24, -1]] as [number, number][]) {
        const sw = Math.sin(t * 0.8 + sx * 0.1) * 0.12 * dir;
        ctx.beginPath();
        ctx.moveTo(sx - 3, sy);
        ctx.lineTo(sx + 3, sy);
        ctx.lineTo(sx + sw * 190 + 38, sy + 140);
        ctx.lineTo(sx + sw * 190 - 38, sy + 140);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const [py, px] of [[SHOW.podiumY, 6], [SHOW.podium2Y, W - 128]] as [number, number][]) {
      for (const sy of at(H * py)) {
        const cx = px + 62;
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(cx, sy + 9, 60, 7, 0, 0, Math.PI * 2);
        ctx.stroke();
        const a = t * 1.3 + px;
        ctx.fillStyle = '#FFF6C8';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 60, sy + 9 + Math.sin(a) * 7, 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (!low && Math.sin(t * 0.9 + px) > 0.9) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const hx = px + 10 + 38 * 2.35;
          const g = ctx.createRadialGradient(hx, sy - 8, 0, hx, sy - 8, 26);
          g.addColorStop(0, 'rgba(255,250,210,0.9)');
          g.addColorStop(1, 'rgba(255,250,210,0)');
          ctx.fillStyle = g;
          ctx.fillRect(hx - 26, sy - 34, 52, 52);
          ctx.restore();
        }
      }
    }
    if (low) return;
    for (const sy of at(H * SHOW.banner.y - 6)) {
      for (let i = 0; i < 3; i++) {
        const bx = SHOW.banner.x + 14 + i * 13 + Math.sin(t * 0.9 + i * 1.7) * 4;
        const by = sy - 52 - i * 7 + Math.sin(t * 1.3 + i) * 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(SHOW.banner.x + 4, sy + 8);
        ctx.lineTo(bx, by + 10);
        ctx.stroke();
        ctx.fillStyle = ['#FF6A8A', '#FFD25A', '#6FD6FF'][i];
        ctx.beginPath();
        ctx.ellipse(bx, by, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(bx - 3, by - 5, 2, 3.4);
      }
    }
    for (const sy of at(H * 0.46)) {
      const on = Math.sin(t * 2.1) > -0.3;
      ctx.fillStyle = on ? 'rgba(255,90,150,0.98)' : 'rgba(255,90,150,0.3)';
      ctx.font = '800 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('АКЦИЯ', W - 54, sy);
      ctx.textAlign = 'left';
      if (on) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(W - 54, sy - 4, 0, W - 54, sy - 4, 34);
        g.addColorStop(0, 'rgba(255,90,150,0.4)');
        g.addColorStop(1, 'rgba(255,90,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(W - 88, sy - 38, 68, 68);
        ctx.restore();
      }
    }
  },
};

// ================================================================== 5. BUYING A HOUSE
const BUY = { win: { x: 30, y: 0.12, w: 84, h: 100 }, door: { x: 240, y: 0.52 }, sign: { x: 130, y: 0.62 }, light: { x: 222, y: 0.5 } };

const buyHouse: Scene = {
  sky(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#3A5A8A');
    s.addColorStop(1, '#F0B070');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    // A plaster facade in warm sand with a roof edge of tiles at the top of every storey.
    plaster(g, W, H, '#9A8466', '#A68E6E', 55);
    g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let y = 40; y < H; y += 64) g.fillRect(0, y, W, 2);
    g.fillStyle = '#B5522E';
    g.fillRect(0, 0, W, 24);
    g.fillStyle = '#8E3E22';
    for (let x = 0; x < W; x += 16) {
      g.beginPath();
      g.arc(x + 8, 20, 8, 0, Math.PI);
      g.fill();
    }
    g.fillStyle = 'rgba(255,200,160,0.22)';
    g.fillRect(0, 0, W, 3);
    shadow(g, 0, 24, W, 36);
    // A big window with green shutters and a box of flowers.
    const w = BUY.win;
    win(g, w.x, H * w.y, w.w, w.h, '#F2C888', '#D89A58', '#3A2A20');
    g.fillStyle = '#3F7A5A';
    g.fillRect(w.x - 26, H * w.y - 4, 20, w.h + 8);
    g.fillRect(w.x + w.w + 6, H * w.y - 4, 20, w.h + 8);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let sy = H * w.y; sy < H * w.y + w.h; sy += 8) {
      g.fillRect(w.x - 26, sy, 20, 2);
      g.fillRect(w.x + w.w + 6, sy, 20, 2);
    }
    g.fillStyle = '#6A3E22';
    g.fillRect(w.x - 4, H * w.y + w.h + 12, w.w + 8, 14);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ['#E8445A', '#F2C030', '#E8E0F0', '#E8445A'][i % 4];
      g.beginPath();
      g.arc(w.x + 6 + i * 11, H * w.y + w.h + 10, 5, 0, Math.PI * 2);
      g.fill();
    }
    // The front door with a brass number, a porch lamp and a mat.
    const d = BUY.door;
    const dy = H * d.y;
    g.fillStyle = '#2A1F1A';
    g.fillRect(d.x - 7, dy - 7, 78, 128);
    const dg = g.createLinearGradient(d.x, dy, d.x + 64, dy);
    dg.addColorStop(0, '#2F5A48');
    dg.addColorStop(1, '#244838');
    g.fillStyle = dg;
    g.fillRect(d.x, dy, 64, 120);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(d.x + 8, dy + 10, 48, 44);
    g.fillRect(d.x + 8, dy + 62, 48, 50);
    g.fillStyle = '#C9A24A';
    g.beginPath();
    g.arc(d.x + 52, dy + 62, 4, 0, Math.PI * 2);
    g.fill();
    g.font = '800 15px sans-serif';
    g.textAlign = 'center';
    g.fillText('12', d.x + 32, dy + 34);
    g.textAlign = 'left';
    g.fillStyle = '#B8B2A4';
    g.fillRect(d.x - 12, dy + 120, 88, 6);
    g.fillStyle = '#7A3A2A';
    g.fillRect(d.x + 6, dy + 126, 52, 5);
    lampWall(g, BUY.light.x, H * BUY.light.y, '255,200,120', 0.5, 96);
    // A "sold" sign on a post by the path.
    const sg = BUY.sign;
    const sy = H * sg.y;
    g.fillStyle = '#6A4A30';
    g.fillRect(sg.x + 20, sy, 5, 70);
    g.fillRect(sg.x, sy + 6, 46, 4);
    rr(g, sg.x - 8, sy + 10, 62, 34, 4, '#F4F0E4');
    g.fillStyle = '#C8242E';
    g.fillRect(sg.x - 2, sy + 22, 50, 10);
    g.fillStyle = '#FFFFFF';
    g.font = '800 9px sans-serif';
    g.textAlign = 'center';
    g.fillText('ПРОДАНО', sg.x + 23, sy + 30);
    g.textAlign = 'left';
    // A mailbox and a bush.
    g.fillStyle = '#C8302A';
    g.fillRect(34, H * 0.78, 40, 24);
    g.fillRect(48, H * 0.78 + 24, 5, 30);
    g.fillStyle = '#3F8A46';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(290 + i * 11, H * 0.9 + (i % 2) * 6, 14, 0, Math.PI * 2);
      g.fill();
    }
    shadeSides(g, W, H, 0.45);
  },
  decor(ctx, _W, H, at, t, low) {
    for (const sy of at(H * BUY.light.y)) {
      ctx.globalAlpha = 0.12 + 0.05 * Math.sin(t * 1.3);
      ctx.fillStyle = '#FFD890';
      ctx.beginPath();
      ctx.arc(BUY.light.x, sy + 8, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // The "sold" sign swings a little on its hook; a bird lands on it now and then.
    for (const sy of at(H * BUY.sign.y + 10)) {
      const a = Math.sin(t * 1.4) * 0.03;
      ctx.save();
      ctx.translate(BUY.sign.x + 23, sy);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(-31, 0, 62, 4);
      ctx.restore();
      if (!low && Math.sin(t * 0.4) > 0.3) {
        ctx.fillStyle = '#2A2F3A';
        ctx.beginPath();
        ctx.ellipse(BUY.sign.x + 40, sy - 6, 6, 4, 0, 0, Math.PI * 2);
        ctx.arc(BUY.sign.x + 45, sy - 9, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F2A030';
        ctx.fillRect(BUY.sign.x + 48, sy - 9.4, 3, 1.8);
      }
    }
    if (low) return;
    // Petals from the bush float down.
    for (const sy of at(H * 0.9)) {
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.2 + i / 4) % 1;
        ctx.fillStyle = `rgba(255,200,210,${0.85 * Math.sin(ph * Math.PI)})`;
        ctx.beginPath();
        ctx.ellipse(290 + i * 20 + Math.sin(ph * 7 + i) * 8, sy - 20 + ph * 70, 3, 1.8, ph * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
};

// ================================================================== 6. THE EMPTY HOUSE
const EMPTY = { win: { x: 236, y: 0.1, w: 90, h: 124 }, boxes: { x: 14, y: 0.62 }, ladder: { x: 124, y: 0.2 }, bulb: { x: 100, y: 0.04 } };

const emptyHouse: Scene = {
  sky(g, W, H) {
    g.fillStyle = '#4A4036';
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    plaster(g, W, H, '#8E826F', '#9C907B', 66);
    // The ghosts of pictures that hung on the wall and the peeling paint.
    g.fillStyle = 'rgba(255,255,255,0.1)';
    for (const [x, y, w, h] of [[24, 0.34, 54, 40], [150, 0.4, 36, 50]] as [number, number, number, number][]) g.fillRect(x, H * y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (const [x, y, w, h] of [[24, 0.34, 54, 40], [150, 0.4, 36, 50]] as [number, number, number, number][]) g.fillRect(x + w - 3, H * y + 3, 3, h);
    const r = rng(67);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = 'rgba(70,60,48,0.55)';
      g.beginPath();
      const x = 20 + r() * (W - 60);
      const y = r() * H;
      g.moveTo(x, y);
      g.lineTo(x + 14 + r() * 16, y + 4);
      g.lineTo(x + 8, y + 16 + r() * 12);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(190, 0);
    g.lineTo(196, H * 0.18);
    g.lineTo(188, H * 0.3);
    g.lineTo(194, H * 0.46);
    g.stroke();
    molding(g, W, 10, '#6E6455', '#A89C86');
    // The window with a shaft of sunlight falling across the empty room.
    const w = EMPTY.win;
    win(g, w.x, H * w.y, w.w, w.h, '#CFE6F4', '#F6E6C0', '#3A2A20');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,236,170,0.14)';
    g.beginPath();
    g.moveTo(w.x, H * w.y + w.h);
    g.lineTo(w.x + w.w, H * w.y + w.h);
    g.lineTo(w.x - 120, H * w.y + 380);
    g.lineTo(w.x - 220, H * w.y + 300);
    g.closePath();
    g.fill();
    g.restore();
    // Boxes in a stack with tape and a label, a bucket and a roller.
    const bx = EMPTY.boxes.x;
    const by = H * EMPTY.boxes.y;
    for (const [dx, dy, w2, h2] of [[0, 62, 88, 62], [92, 80, 70, 44], [10, 0, 70, 62], [6, -54, 64, 54]] as [number, number, number, number][]) {
      g.fillStyle = '#15110F';
      g.fillRect(bx + dx - 2, by + dy - 2, w2 + 4, h2 + 4);
      const bg = g.createLinearGradient(bx + dx, by + dy, bx + dx + w2, by + dy);
      bg.addColorStop(0, '#B08850');
      bg.addColorStop(1, '#8E6A3E');
      g.fillStyle = bg;
      g.fillRect(bx + dx, by + dy, w2, h2);
      g.fillStyle = 'rgba(235,225,200,0.65)';
      g.fillRect(bx + dx + w2 / 2 - 5, by + dy, 10, h2);
    }
    g.fillStyle = '#F4F0E4';
    g.fillRect(bx + 14, by + 76, 30, 20);
    g.fillStyle = '#C8242E';
    g.font = '800 7px sans-serif';
    g.fillText('ХРУПКОЕ', bx + 15, by + 90);
    g.fillStyle = '#3A6EA8';
    g.fillRect(bx + 112, by + 52, 26, 28);
    g.fillStyle = '#E8E4D8';
    g.fillRect(bx + 112, by + 52, 26, 5);
    // A stepladder and a bare bulb on a cord, with a pool of light.
    const l = EMPTY.ladder;
    const ly = H * l.y;
    g.strokeStyle = '#B8B2A4';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(l.x, ly + 150);
    g.lineTo(l.x + 22, ly);
    g.moveTo(l.x + 56, ly + 150);
    g.lineTo(l.x + 34, ly);
    g.stroke();
    g.lineWidth = 4;
    for (let sy = ly + 24; sy < ly + 140; sy += 26) {
      g.beginPath();
      g.moveTo(l.x + 22 - (sy - ly) * 0.15, sy);
      g.lineTo(l.x + 34 + (sy - ly) * 0.15, sy);
      g.stroke();
    }
    g.fillStyle = '#C8402A';
    g.fillRect(l.x + 14, ly - 8, 28, 10);
    pool(g, EMPTY.bulb.x, H * EMPTY.bulb.y + 120, 130, '255,214,140', 0.22);
    shadeSides(g, W, H, 0.5);
  },
  decor(ctx, _W, H, at, t, low) {
    for (const sy of at(H * EMPTY.bulb.y)) {
      const a = Math.sin(t * 0.9) * 0.1;
      const bx = EMPTY.bulb.x + Math.sin(a) * 60;
      const by = sy + Math.cos(a) * 60;
      ctx.strokeStyle = '#15110F';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(EMPTY.bulb.x, sy);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.fillStyle = '#FFF2C4';
      ctx.beginPath();
      ctx.arc(bx, by, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.14 + 0.06 * Math.sin(t * 1.7);
      ctx.fillStyle = '#FFE0A0';
      ctx.beginPath();
      ctx.arc(bx, by, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (low) return;
    // Dust floats in the shaft of light, a drip falls in the corner, and a cat looks out of a box.
    for (const sy of at(H * EMPTY.win.y + 120)) {
      for (let i = 0; i < 12; i++) {
        const ph = (t * 0.06 + i * 0.083) % 1;
        const x = EMPTY.win.x - ph * 160 + Math.sin(t + i) * 8;
        const y = sy + ph * 200 + Math.cos(t * 0.8 + i) * 6;
        ctx.fillStyle = `rgba(255,244,210,${0.8 * Math.sin(ph * Math.PI)})`;
        ctx.fillRect(x, y, 2.2, 2.2);
      }
    }
    for (const sy of at(H * EMPTY.boxes.y - 52)) {
      const up = 3 + Math.sin(t * 0.6) * 3;
      ctx.fillStyle = '#B85A28';
      ctx.beginPath();
      ctx.ellipse(EMPTY.boxes.x + 38, sy + 2 - up, 11, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(EMPTY.boxes.x + 29, sy - 4 - up);
      ctx.lineTo(EMPTY.boxes.x + 30, sy - 13 - up);
      ctx.lineTo(EMPTY.boxes.x + 35, sy - 6 - up);
      ctx.moveTo(EMPTY.boxes.x + 41, sy - 6 - up);
      ctx.lineTo(EMPTY.boxes.x + 46, sy - 13 - up);
      ctx.lineTo(EMPTY.boxes.x + 47, sy - 4 - up);
      ctx.fill();
      ctx.fillStyle = '#FFE070';
      ctx.fillRect(EMPTY.boxes.x + 33, sy - 1 - up, 3, 2);
      ctx.fillRect(EMPTY.boxes.x + 41, sy - 1 - up, 3, 2);
    }
  },
};

// ================================================================== 7. THE FURNISHED HOUSE
const HOME = { fire: { x: 14, y: 0.5 }, sofa: { x: 190, y: 0.66 }, lamp: { x: 150, y: 0.5 }, tv: { x: 236, y: 0.14 } };

const home: Scene = {
  sky(g, W, H) {
    g.fillStyle = '#4A2E26';
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    // Warm striped wallpaper above a white wainscot.
    const base = '#6A4036';
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 30) {
      g.fillStyle = 'rgba(255,220,180,0.08)';
      g.fillRect(x, 0, 14, H);
      g.fillStyle = 'rgba(0,0,0,0.1)';
      g.fillRect(x + 14, 0, 1.4, H);
    }
    g.fillStyle = '#DDD4C4';
    g.fillRect(0, H * 0.74, W, H * 0.26);
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let x = 0; x < W; x += 60) g.fillRect(x + 4, H * 0.78, 52, H * 0.18);
    g.fillStyle = '#F4EEE2';
    g.fillRect(0, H * 0.74 - 4, W, 6);
    shadow(g, 0, H * 0.74 + 2, W, 12);
    molding(g, W, 12, '#E8DFCE', '#FFFBF0');
    // The fireplace in stone with a mantel, a clock and candles.
    const f = HOME.fire;
    const fy = H * f.y;
    g.fillStyle = '#6A6258';
    g.fillRect(f.x, fy, 112, 148);
    for (let row = 0; row < 7; row++) for (let col = 0; col < 4; col++) {
      g.fillStyle = (row + col) % 2 ? '#7A7266' : '#5E564C';
      g.fillRect(f.x + 2 + col * 28 + (row % 2) * 12, fy + 2 + row * 21, 26, 19);
    }
    g.fillStyle = '#15110F';
    g.fillRect(f.x + 26, fy + 52, 60, 96);
    g.fillStyle = '#8E7C5E';
    g.fillRect(f.x - 8, fy - 6, 128, 12);
    g.fillStyle = '#E8DCB8';
    g.fillRect(f.x + 8, fy - 26, 8, 20);
    g.fillRect(f.x + 98, fy - 26, 8, 20);
    g.fillStyle = '#C9A24A';
    g.beginPath();
    g.arc(f.x + 56, fy - 18, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#F4F0E4';
    g.beginPath();
    g.arc(f.x + 56, fy - 18, 9, 0, Math.PI * 2);
    g.fill();
    pool(g, f.x + 56, fy + 100, 130, '255,150,70', 0.34);
    // Pictures of the family, a floor lamp and a plant.
    frameBox(g, 150, H * 0.12, 50, 62, '#B8C8D8');
    frameBox(g, 206, H * 0.17, 40, 34, '#D8C8B0');
    frameBox(g, 160, H * 0.12 + 74, 34, 44, '#C8B8D8');
    plant(g, 336, H * 0.73, 1.5);
    const lp = HOME.lamp;
    pool(g, lp.x, H * lp.y - 20, 100, '255,210,140', 0.32);
    g.fillStyle = '#2A2420';
    g.fillRect(lp.x - 2, H * lp.y, 4, 120);
    g.fillRect(lp.x - 14, H * lp.y + 118, 28, 5);
    g.fillStyle = '#F2E2C0';
    g.beginPath();
    g.moveTo(lp.x - 18, H * lp.y);
    g.lineTo(lp.x + 18, H * lp.y);
    g.lineTo(lp.x + 10, H * lp.y - 26);
    g.lineTo(lp.x - 10, H * lp.y - 26);
    g.closePath();
    g.fill();
    // The sofa with cushions.
    const so = HOME.sofa;
    const sy = H * so.y;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(so.x - 4, sy + 56, 160, 8);
    const sg = g.createLinearGradient(0, sy, 0, sy + 60);
    sg.addColorStop(0, '#2F7A7A');
    sg.addColorStop(1, '#1F5A5A');
    g.fillStyle = sg;
    rr(g, so.x, sy - 18, 156, 40, 12, '#2A6E6E');
    rr(g, so.x - 8, sy + 8, 172, 48, 12, '#2F7A7A');
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(so.x + 6, sy + 12, 140, 3);
    for (const [cx, c] of [[so.x + 14, '#E8A030'], [so.x + 118, '#E85A6A']] as [number, string][]) {
      g.fillStyle = c;
      rr(g, cx, sy - 4, 28, 28, 8, c);
    }
    // The TV on a cabinet.
    const tv = HOME.tv;
    g.fillStyle = '#15110F';
    g.fillRect(tv.x, H * tv.y, 104, 66);
    g.fillStyle = '#0F2236';
    g.fillRect(tv.x + 4, H * tv.y + 4, 96, 54);
    shadeSides(g, W, H, 0.5);
  },
  decor(ctx, _W, H, at, t, low) {
    // The fire.
    for (const sy of at(H * HOME.fire.y + 146)) {
      const fx = HOME.fire.x + 56;
      for (const [k, c] of [[1, '#E8420F'], [0.74, '#FF9A2E'], [0.44, '#FFF3B0']] as [number, string][]) {
        const sway = Math.sin(t * 7 + k * 3) * 4;
        const hgt = (34 + Math.sin(t * 11 + k) * 6) * k;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(fx - 20 * k, sy);
        ctx.quadraticCurveTo(fx - 24 * k, sy - hgt * 0.5, fx + sway, sy - hgt);
        ctx.quadraticCurveTo(fx + 24 * k, sy - hgt * 0.5, fx + 20 * k, sy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 9);
      ctx.fillStyle = '#FFAA55';
      ctx.beginPath();
      ctx.arc(fx, sy - 20, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // The TV flickers with a changing picture.
    for (const sy of at(H * HOME.tv.y)) {
      const hue = (t * 40) % 360;
      ctx.fillStyle = `hsla(${hue},60%,45%,0.65)`;
      ctx.fillRect(HOME.tv.x + 4, sy + 4, 96, 54);
      ctx.fillStyle = `hsla(${(hue + 120) % 360},70%,60%,0.7)`;
      ctx.fillRect(HOME.tv.x + 10 + Math.sin(t) * 10, sy + 14, 38, 26);
    }
    if (low) return;
    // A cat asleep on the sofa breathes.
    for (const sy of at(H * HOME.sofa.y + 4)) {
      const b = Math.sin(t * 1.6) * 1.6;
      ctx.fillStyle = '#E8A060';
      ctx.beginPath();
      ctx.ellipse(HOME.sofa.x + 80, sy - 2 - b * 0.4, 22, 11 + b, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(HOME.sofa.x + 100, sy - 4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#B8743C';
      ctx.fillRect(HOME.sofa.x + 66, sy - 12 - b * 0.4, 4, 9);
      ctx.fillRect(HOME.sofa.x + 76, sy - 13 - b * 0.4, 4, 9);
    }
    for (const sy of at(H * HOME.lamp.y - 12)) {
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 1.5);
      ctx.fillStyle = '#FFE0A0';
      ctx.beginPath();
      ctx.arc(HOME.lamp.x, sy, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },
};

// ================================================================== 8. THE BUSINESS
const BIZ = { screen: { x: 214, y: 0.1, w: 126, h: 86 }, lift: { x: 18, y: 0.3 }, heli: { y: 0.18 } };

const business: Scene = {
  sky(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#0A1428');
    s.addColorStop(1, '#2A3A66');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    const r = rng(81);
    // A glass wall of a skyscraper at night: towers with lights across the whole width.
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#0A1428');
    s.addColorStop(1, '#27386A');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    for (let layer = 0; layer < 2; layer++) {
      let x = -10;
      while (x < W) {
        const bw = 28 + r() * 44;
        const bh = (layer ? 90 : 150) + r() * (layer ? 120 : 180);
        g.fillStyle = layer ? '#101C3A' : '#16264A';
        g.fillRect(x, H - bh, bw, bh);
        g.fillStyle = layer ? 'rgba(255,224,150,0.85)' : 'rgba(255,224,150,0.5)';
        for (let wy = H - bh + 8; wy < H - 6; wy += 12) for (let wx = x + 4; wx < x + bw - 5; wx += 9) if (r() < (layer ? 0.38 : 0.26)) g.fillRect(wx, wy, 3.4, 5);
        x += bw + 3;
      }
    }
    // The dark frames of the glass wall.
    g.fillStyle = 'rgba(12,18,34,0.9)';
    for (const x of [W * 0.25, W * 0.5, W * 0.75]) g.fillRect(x - 3, 0, 6, H);
    g.fillRect(0, H * 0.46, W, 6);
    molding(g, W, 8, '#1C2640', '#3A4A74');
    // A wall screen with a growing chart.
    const sc = BIZ.screen;
    g.fillStyle = '#05080F';
    g.fillRect(sc.x - 5, H * sc.y - 5, sc.w + 10, sc.h + 10);
    g.fillStyle = '#0C1830';
    g.fillRect(sc.x, H * sc.y, sc.w, sc.h);
    g.strokeStyle = 'rgba(120,180,255,0.2)';
    g.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      g.beginPath();
      g.moveTo(sc.x, H * sc.y + i * 17);
      g.lineTo(sc.x + sc.w, H * sc.y + i * 17);
      g.stroke();
    }
    // Elevator doors with lights.
    const l = BIZ.lift;
    const ly = H * l.y;
    g.fillStyle = '#0E1118';
    g.fillRect(l.x - 6, ly - 22, 112, 170);
    const mg = g.createLinearGradient(l.x, ly, l.x + 100, ly);
    mg.addColorStop(0, '#AEB6C2');
    mg.addColorStop(0.5, '#E4E9F0');
    mg.addColorStop(1, '#8E96A4');
    g.fillStyle = mg;
    g.fillRect(l.x, ly, 100, 146);
    g.fillStyle = '#0E1118';
    g.fillRect(l.x + 49, ly, 2.4, 146);
    g.fillStyle = '#0A0D12';
    g.fillRect(l.x + 28, ly - 18, 44, 14);
    pool(g, l.x + 50, ly + 150, 110, '120,170,255', 0.2);
    // A conference table edge and chairs in silhouette at the bottom of the storey.
    const ty = H * 0.8;
    g.fillStyle = '#0E1420';
    g.fillRect(0, ty, W, 22);
    g.fillStyle = 'rgba(160,200,255,0.25)';
    g.fillRect(0, ty, W, 2.4);
    for (const cx of [40, 120, 200, 280]) {
      rr(g, cx, ty - 40, 44, 40, 10, '#16203A');
      rr(g, cx + 4, ty - 4, 36, 6, 3, '#0A0F1C');
    }
    shadeSides(g, W, H, 0.5);
  },
  decor(ctx, W, H, at, t, low) {
    // The chart on the wall screen draws itself and keeps growing.
    for (const sy of at(H * BIZ.screen.y)) {
      const sc = BIZ.screen;
      const k = (t * 0.22) % 1;
      ctx.strokeStyle = '#52E07A';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      const n = 22;
      for (let i = 0; i <= n * k; i++) {
        const x = sc.x + 6 + (i / n) * (sc.w - 12);
        const y = sy + sc.h - 10 - (i / n) * (sc.h - 24) - Math.sin(i * 1.3) * 5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const bh = 8 + (Math.sin(t * 1.1 + i) * 0.5 + 0.5) * 22;
        ctx.fillStyle = 'rgba(127,214,255,0.7)';
        ctx.fillRect(sc.x + 8 + i * 19, sy + sc.h - 6 - bh, 12, bh);
      }
    }
    // The lights of the elevator: an arrow runs, and now and then a bell lights up.
    for (const sy of at(BIZ.lift.y * H - 11)) {
      const up = Math.floor(t * 1.6) % 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === up ? '#FFD25A' : 'rgba(255,210,90,0.2)';
        ctx.beginPath();
        ctx.moveTo(BIZ.lift.x + 38 + i * 11, sy + 8);
        ctx.lineTo(BIZ.lift.x + 43 + i * 11, sy + 2);
        ctx.lineTo(BIZ.lift.x + 48 + i * 11, sy + 8);
        ctx.fill();
      }
    }
    if (low) return;
    // A helicopter passes behind the glass with blinking lights.
    for (const sy of at(H * BIZ.heli.y)) {
      const k = (t * 0.06) % 1;
      if (k > 0.5) continue;
      const kk = k / 0.5;
      const x = -30 + kk * (W + 60);
      ctx.fillStyle = '#05080F';
      ctx.beginPath();
      ctx.ellipse(x, sy, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 28, sy - 1.5, 14, 3);
      ctx.fillRect(x - 12, sy - 12, 24, 2);
      ctx.fillRect(x - 1, sy - 12, 2, 8);
      ctx.fillStyle = Math.sin(t * 6) > 0 ? '#FF4A4A' : 'rgba(255,74,74,0.2)';
      ctx.beginPath();
      ctx.arc(x - 28, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 10; i++) {
      const on = Math.sin(t * 0.8 + i * 3.3) > 0.4;
      if (!on) continue;
      for (const sy of at(H * 0.5 + i * 20)) {
        ctx.fillStyle = 'rgba(255,230,160,0.9)';
        ctx.fillRect(20 + ((i * 97) % (W - 40)), sy, 3.4, 5);
      }
    }
  },
};

// ================================================================== 9. FAME
const FAME = { wall: { y: 0.1 }, rope: { y: 0.78 }, statue: { x: 280, y: 0.5 } };

const fame: Scene = {
  sky(g, W, H) {
    g.fillStyle = '#1A0E2E';
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    // A deep purple wall of a gala with a backdrop of golden stars on a dark panel.
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#2A1048');
    s.addColorStop(1, '#4A1A5A');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#16081E';
    g.fillRect(W * 0.1, H * FAME.wall.y, W * 0.8, H * 0.5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
      const cx = W * 0.1 + 24 + x * ((W * 0.8 - 48) / 5);
      const cy = H * FAME.wall.y + 24 + y * ((H * 0.5 - 48) / 4);
      g.fillStyle = (x + y) % 2 ? '#6A4E2E' : '#7E6034';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 ? 5 : 12;
        g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#8A6A3A';
    g.lineWidth = 3;
    g.strokeRect(W * 0.1, H * FAME.wall.y, W * 0.8, H * 0.5);
    molding(g, W, 9, '#3A1A4A', '#8A5A9A');
    // The red carpet with velvet ropes on golden posts.
    const cy = H * FAME.rope.y;
    g.fillStyle = '#A01830';
    g.fillRect(0, cy + 14, W, H - cy - 14);
    g.fillStyle = '#E8B53A';
    g.fillRect(0, cy + 14, W, 3);
    shadow(g, 0, cy - 12, W, 26);
    for (let x = 18; x < W; x += 78) {
      g.fillStyle = '#E8B53A';
      g.fillRect(x - 3, cy - 36, 6, 52);
      g.beginPath();
      g.arc(x, cy - 38, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(x - 2, cy - 36, 1.6, 50);
      g.strokeStyle = '#8A1426';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x, cy - 30);
      g.quadraticCurveTo(x + 39, cy - 6, x + 78, cy - 30);
      g.stroke();
    }
    // A golden trophy on a pedestal.
    const st = FAME.statue;
    const sy = H * st.y;
    g.fillStyle = '#2A1A30';
    g.fillRect(st.x - 8, sy + 70, 66, 70);
    g.fillStyle = '#8A5A9A';
    g.fillRect(st.x - 8, sy + 70, 66, 4);
    const tg = g.createLinearGradient(st.x, 0, st.x + 50, 0);
    tg.addColorStop(0, '#C98A12');
    tg.addColorStop(0.5, '#FFE58A');
    tg.addColorStop(1, '#C98A12');
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(st.x + 4, sy);
    g.lineTo(st.x + 46, sy);
    g.quadraticCurveTo(st.x + 44, sy + 44, st.x + 25, sy + 52);
    g.quadraticCurveTo(st.x + 6, sy + 44, st.x + 4, sy);
    g.closePath();
    g.fill();
    g.fillRect(st.x + 21, sy + 52, 8, 16);
    g.fillRect(st.x + 8, sy + 66, 34, 6);
    pool(g, st.x + 25, sy + 20, 110, '255,214,120', 0.32);
    shadeSides(g, W, H, 0.5);
  },
  decor(ctx, W, H, at, t, low) {
    // Photographers: flashes pop at random places in the crowd, each lasting a moment.
    for (let i = 0; i < 9; i++) {
      const ph = (t * 0.7 + i * 0.37) % 1;
      if (ph > 0.12) continue;
      const k = 1 - ph / 0.12;
      for (const sy of at(H * 0.6 + ((i * 53) % (H * 0.3)))) {
        const x = 10 + ((i * 131) % (W - 20));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(x, sy, 0, x, sy, 54 * k + 8);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * k})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 64, sy - 64, 128, 128);
        ctx.restore();
      }
    }
    // The stars on the backdrop twinkle in turn.
    for (const sy of at(H * FAME.wall.y)) {
      for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
        const a = Math.sin(t * 1.6 + x * 1.1 + y * 0.7);
        if (a < 0.7) continue;
        const cx = W * 0.1 + 24 + x * ((W * 0.8 - 48) / 5);
        const cy = sy + 24 + y * ((H * 0.5 - 48) / 4);
        ctx.strokeStyle = `rgba(255,255,255,${(a - 0.7) * 3})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy);
        ctx.lineTo(cx + 12, cy);
        ctx.moveTo(cx, cy - 12);
        ctx.lineTo(cx, cy + 12);
        ctx.stroke();
      }
    }
    if (low) return;
    // Searchlights cross the wall.
    for (const sy of at(H * 0.04)) {
      ctx.fillStyle = 'rgba(255,240,200,0.07)';
      for (const [x0, dir] of [[40, 1], [W - 40, -1]] as [number, number][]) {
        const sw = Math.sin(t * 0.7 + x0) * 0.5 * dir;
        ctx.beginPath();
        ctx.moveTo(x0 - 5, sy);
        ctx.lineTo(x0 + 5, sy);
        ctx.lineTo(x0 + sw * 220 + 46, sy + 240);
        ctx.lineTo(x0 + sw * 220 - 46, sy + 240);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Sparkles on the trophy.
    for (const sy of at(H * FAME.statue.y)) {
      const a = (t * 0.9) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${Math.sin(a * Math.PI)})`;
      ctx.lineWidth = 1.6;
      const x = FAME.statue.x + 14;
      ctx.beginPath();
      ctx.moveTo(x - 9 * a, sy + 8);
      ctx.lineTo(x + 9 * a, sy + 8);
      ctx.moveTo(x, sy + 8 - 9 * a);
      ctx.lineTo(x, sy + 8 + 9 * a);
      ctx.stroke();
    }
  },
};

// ================================================================== 10. THE MANSION
const MAN = { win: { x: 150, y: 0.1, w: 84, h: 134 }, fountain: { x: 24, y: 0.7 }, car: { x: 220, y: 0.84 } };

const mansion: Scene = {
  sky(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#3A3A78');
    s.addColorStop(0.55, '#D8708A');
    s.addColorStop(1, '#F8C078');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
  },
  tile(g, W, H) {
    // A marble facade of cream stone with big columns and a balustrade.
    plaster(g, W, H, '#C8BCA4', '#D6CAB2', 101);
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (let y = 30; y < H; y += 46) g.fillRect(0, y, W, 2);
    g.fillStyle = 'rgba(0,0,0,0.05)';
    for (let y = 0; y < H; y += 46) for (let x = ((y / 46) % 2) * 40; x < W; x += 80) g.fillRect(x, y, 2, 46);
    molding(g, W, 14, '#E8E0CC', '#FFFBF0');
    for (const x of [18, W - 66]) {
      const cg = g.createLinearGradient(x, 0, x + 48, 0);
      cg.addColorStop(0, '#B8AE98');
      cg.addColorStop(0.35, '#F6F0E0');
      cg.addColorStop(1, '#9A907C');
      g.fillStyle = cg;
      g.fillRect(x + 6, 0, 36, H);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let fx = x + 12; fx < x + 40; fx += 8) g.fillRect(fx, 0, 1.6, H);
      for (const y of [H * 0.5, H - 30]) {
        g.fillStyle = '#E8E0CC';
        g.fillRect(x, y, 48, 14);
        g.fillStyle = '#FFFBF0';
        g.fillRect(x, y, 48, 3);
      }
    }
    // The big arched window with warm light and a golden frame.
    const w = MAN.win;
    win(g, w.x, H * w.y, w.w, w.h, '#FFD890', '#E8A050', '#A07A30', false, true);
    pool(g, w.x + w.w / 2, H * w.y + 70, 150, '255,200,120', 0.3);
    // A fountain: three bowls on a stem.
    const f = MAN.fountain;
    const fy = H * f.y;
    for (const [dy, bw] of [[0, 96], [-30, 66], [-58, 40]] as [number, number][]) {
      const bg = g.createLinearGradient(f.x, fy + dy, f.x + bw, fy + dy);
      bg.addColorStop(0, '#9A907C');
      bg.addColorStop(0.5, '#F2EAD8');
      bg.addColorStop(1, '#8E846E');
      g.fillStyle = bg;
      g.beginPath();
      g.ellipse(f.x + 48, fy + dy, bw / 2, 11, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = '#7FD0E8';
      g.beginPath();
      g.ellipse(f.x + 48, fy + dy, bw / 2 - 3, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#C8E8F0';
      g.fillRect(f.x + 45, fy + dy - 2, 6, 28);
    }
    // A yellow sports car on the drive and a clipped bush in a pot.
    car(g, MAN.car.x, H * MAN.car.y, 2.4, '#F2C020', true);
    g.fillStyle = 'rgba(190,225,255,0.6)';
    g.beginPath();
    g.moveTo(MAN.car.x + 15 * 2.4, H * MAN.car.y - 9 * 2.4 + 2);
    g.lineTo(MAN.car.x + 24 * 2.4, H * MAN.car.y - 9 * 2.4 + 2);
    g.lineTo(MAN.car.x + 31 * 2.4, H * MAN.car.y - 5 * 2.4);
    g.lineTo(MAN.car.x + 15 * 2.4, H * MAN.car.y - 5 * 2.4);
    g.closePath();
    g.fill();
    g.fillStyle = '#2F7A3C';
    g.beginPath();
    g.arc(W * 0.5, H * 0.42, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#B5562E';
    g.fillRect(W * 0.5 - 12, H * 0.42 + 20, 24, 20);
    shadeSides(g, W, H, 0.4);
  },
  decor(ctx, _W, H, at, t, low) {
    // The fountain: arcs of water leap from the top bowl and fall into the lower ones.
    for (const sy of at(H * MAN.fountain.y - 58)) {
      const fx = MAN.fountain.x + 48;
      ctx.strokeStyle = 'rgba(200,240,255,0.8)';
      ctx.lineWidth = 1.8;
      for (let i = -2; i <= 2; i++) {
        const k = (t * 0.9 + i * 0.13) % 1;
        ctx.beginPath();
        ctx.moveTo(fx, sy - 6);
        ctx.quadraticCurveTo(fx + i * 12, sy - 34 - Math.abs(i) * 2, fx + i * 24, sy + 6 + k * 3);
        ctx.stroke();
      }
      if (!low) {
        for (let i = 0; i < 6; i++) {
          const k = (t * 1.1 + i / 6) % 1;
          ctx.fillStyle = `rgba(220,245,255,${0.8 * Math.sin(k * Math.PI)})`;
          ctx.beginPath();
          ctx.arc(fx + (i - 2.5) * 11, sy + 6 + k * 62, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    for (const sy of at(H * MAN.win.y + 70)) {
      ctx.globalAlpha = 0.12 + 0.06 * Math.sin(t * 1.1);
      ctx.fillStyle = '#FFD890';
      ctx.beginPath();
      ctx.arc(MAN.win.x + MAN.win.w / 2, sy, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (low) return;
    // The sun glints on the car and a flock of birds crosses the sky.
    for (const sy of at(H * MAN.car.y - 22)) {
      const a = (t * 0.7) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${Math.sin(a * Math.PI)})`;
      ctx.lineWidth = 1.6;
      const x = MAN.car.x + 20 + a * 60;
      ctx.beginPath();
      ctx.moveTo(x - 8, sy);
      ctx.lineTo(x + 8, sy);
      ctx.moveTo(x, sy - 8);
      ctx.lineTo(x, sy + 8);
      ctx.stroke();
    }
    for (const sy of at(H * 0.3)) {
      const k = (t * 0.05) % 1;
      if (k > 0.5) continue;
      const kk = k / 0.5;
      ctx.strokeStyle = 'rgba(30,20,40,0.8)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const x = -20 + kk * 420 - i * 22;
        const y = sy + i * 8 + Math.sin(kk * 10 + i) * 6;
        const flap = Math.sin(t * 11 + i) * 3.4;
        ctx.beginPath();
        ctx.moveTo(x - 7, y - flap);
        ctx.quadraticCurveTo(x - 3, y - 4, x, y);
        ctx.quadraticCurveTo(x + 3, y - 4, x + 7, y - flap);
        ctx.stroke();
      }
    }
  },
};

// ================================================================== 11. THE YACHT
const YACHT = { palm: { x: 10, y: 0.2 }, sail: { x: 250 }, ring: { x: 40, y: 0.64 } };

const yacht: Scene = {
  sky(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#2A8AC8');
    s.addColorStop(0.55, '#8AD8E8');
    s.addColorStop(1, '#0E7C9E');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    // Sun and a far island on the horizon.
    pool(g, W * 0.5, H * 0.5, 190, '255,236,170', 0.55);
    g.fillStyle = '#FFF4C8';
    g.beginPath();
    g.arc(W * 0.5, H * 0.5, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(30,110,120,0.7)';
    g.beginPath();
    g.moveTo(0, H * 0.62);
    g.quadraticCurveTo(W * 0.2, H * 0.52, W * 0.42, H * 0.62);
    g.fill();
    g.fillStyle = '#0A6A8C';
    g.fillRect(0, H * 0.62, W, H * 0.38);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    const r = rng(140);
    for (let i = 0; i < 40; i++) g.fillRect(r() * W, H * 0.64 + r() * H * 0.34, 8 + r() * 24, 2);
  },
  tile(g, W, H) {
    // The deck: a chrome rail with posts and rope on the left, palm leaves, a white sail on the right.
    for (const x of [8, W - 20]) {
      const pg = g.createLinearGradient(x, 0, x + 12, 0);
      pg.addColorStop(0, '#8A929E');
      pg.addColorStop(0.5, '#F4F8FC');
      pg.addColorStop(1, '#7A828E');
      g.fillStyle = pg;
      g.fillRect(x, 0, 12, H);
    }
    g.fillStyle = '#E8E0C8';
    for (let y = 30; y < H; y += 60) {
      g.beginPath();
      g.arc(14, y, 7, 0, Math.PI * 2);
      g.fill();
    }
    // A palm trunk and the fronds hanging over the left edge.
    const p = YACHT.palm;
    g.fillStyle = '#8A5A32';
    g.beginPath();
    g.moveTo(p.x + 24, H);
    g.quadraticCurveTo(p.x + 46, H * 0.55, p.x + 36, H * p.y + 40);
    g.lineTo(p.x + 54, H * p.y + 40);
    g.quadraticCurveTo(p.x + 70, H * 0.55, p.x + 52, H);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = H * 0.3; y < H; y += 16) g.fillRect(p.x + 30, y, 20, 3);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.95 + i * 0.4;
      g.save();
      g.translate(p.x + 45, H * p.y + 38);
      g.rotate(a);
      g.fillStyle = i % 2 ? '#2F8A46' : '#3FA056';
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(48, -14, 98, 6);
      g.quadraticCurveTo(48, 6, 0, 0);
      g.fill();
      g.restore();
    }
    // The sail with a mast and a rope.
    const sx = YACHT.sail.x;
    g.fillStyle = '#C8D0D8';
    g.fillRect(sx + 52, 0, 5, H);
    g.fillStyle = '#F8FAFC';
    g.beginPath();
    g.moveTo(sx + 50, H * 0.08);
    g.quadraticCurveTo(sx - 30, H * 0.36, sx + 50, H * 0.7);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(80,120,160,0.18)';
    g.beginPath();
    g.moveTo(sx + 50, H * 0.08);
    g.quadraticCurveTo(sx - 4, H * 0.3, sx + 50, H * 0.3);
    g.closePath();
    g.fill();
    // A lifebuoy.
    const rg = YACHT.ring;
    g.strokeStyle = '#F8FAFC';
    g.lineWidth = 11;
    g.beginPath();
    g.arc(rg.x + 40, H * rg.y, 22, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#D8302A';
    g.lineWidth = 11;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(rg.x + 40, H * rg.y, 22, i * Math.PI / 2 - 0.25, i * Math.PI / 2 + 0.25);
      g.stroke();
    }
    shadeSides(g, W, H, 0.22);
  },
  decor(ctx, W, H, at, t, low) {
    // Glints dance on the sea, and the sail breathes in the wind.
    for (const sy of at(H * 0.7)) {
      for (let i = 0; i < 10; i++) {
        const a = Math.sin(t * 1.3 + i * 2.1);
        if (a < 0.4) continue;
        ctx.fillStyle = `rgba(255,255,255,${(a - 0.4) * 1.2})`;
        ctx.fillRect(40 + ((i * 83) % (W - 80)), sy + ((i * 29) % 70), 16, 2);
      }
    }
    for (const sy of at(H * 0.08)) {
      const sw = Math.sin(t * 0.9) * 5;
      ctx.strokeStyle = 'rgba(80,120,160,0.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(YACHT.sail.x + 50, sy + 20);
      ctx.quadraticCurveTo(YACHT.sail.x - 10 + sw, sy + 120, YACHT.sail.x + 50, sy + 240);
      ctx.stroke();
    }
    if (low) return;
    // The palm fronds sway and gulls glide past.
    for (const sy of at(H * YACHT.palm.y + 38)) {
      ctx.fillStyle = 'rgba(63,160,86,0.9)';
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI * 0.5 + i * 0.6 + Math.sin(t * 1.2 + i) * 0.14;
        ctx.save();
        ctx.translate(YACHT.palm.x + 45, sy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(40, -12, 82, 4);
        ctx.quadraticCurveTo(40, 5, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    }
    for (const sy of at(H * 0.34)) {
      const k = (t * 0.07) % 1;
      if (k > 0.6) continue;
      const kk = k / 0.6;
      const x = W + 20 - kk * (W + 60);
      const y = sy + Math.sin(kk * 7) * 10;
      const flap = Math.sin(t * 9) * 4;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x - 11, y - flap);
      ctx.quadraticCurveTo(x - 4, y - 6, x, y);
      ctx.quadraticCurveTo(x + 4, y - 6, x + 11, y - flap);
      ctx.stroke();
    }
  },
};

// ================================================================== 12. THE SPACEPORT
const SPACE = { gantry: { x: 8 }, rocket: { x: 258 }, beacon: { y: 0.18 } };

const space: Scene = {
  sky(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#05081C');
    s.addColorStop(0.7, '#1A1A4A');
    s.addColorStop(1, '#4A2A6A');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    const r = rng(1500);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
      g.beginPath();
      g.arc(r() * W, r() * H, 0.6 + r() * 1.5, 0, Math.PI * 2);
      g.fill();
    }
    // A big planet with rings and a nebula.
    pool(g, W * 0.3, H * 0.3, 200, '150,90,220', 0.22);
    const pg = g.createRadialGradient(W * 0.42, H * 0.26, 4, W * 0.5, H * 0.3, 76);
    pg.addColorStop(0, '#F2B890');
    pg.addColorStop(0.6, '#C86A5A');
    pg.addColorStop(1, '#5A2A4A');
    g.fillStyle = pg;
    g.beginPath();
    g.arc(W * 0.5, H * 0.3, 70, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,225,190,0.65)';
    g.lineWidth = 6;
    g.beginPath();
    g.ellipse(W * 0.5, H * 0.3, 120, 26, -0.3, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,225,190,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(W * 0.5, H * 0.3, 136, 31, -0.3, 0, Math.PI * 2);
    g.stroke();
  },
  tile(g, W, H) {
    // A launch tower of steel lattice on the left with red lights and a service arm.
    const gx = SPACE.gantry.x;
    g.fillStyle = '#2A3040';
    g.fillRect(gx, 0, 14, H);
    g.fillRect(gx + 66, 0, 14, H);
    g.strokeStyle = '#4A5468';
    g.lineWidth = 4;
    for (let y = 0; y < H; y += 56) {
      g.beginPath();
      g.moveTo(gx + 14, y);
      g.lineTo(gx + 66, y + 56);
      g.moveTo(gx + 66, y);
      g.lineTo(gx + 14, y + 56);
      g.stroke();
      g.fillStyle = '#3A4256';
      g.fillRect(gx, y, 80, 5);
    }
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(gx + 2, 0, 3, H);
    g.fillStyle = '#4A5468';
    g.fillRect(gx + 80, H * 0.4, 70, 12);
    g.fillStyle = '#E8B53A';
    g.fillRect(gx + 80, H * 0.4, 70, 3);
    // A rocket on the right: white with a red nose, windows and fins, under floodlights.
    const rx = SPACE.rocket.x;
    pool(g, rx + 40, H * 0.5, 160, '180,200,255', 0.24);
    const rg = g.createLinearGradient(rx, 0, rx + 80, 0);
    rg.addColorStop(0, '#B8BEC8');
    rg.addColorStop(0.45, '#FFFFFF');
    rg.addColorStop(1, '#8E96A4');
    g.fillStyle = rg;
    g.fillRect(rx, 0, 80, H);
    g.fillStyle = '#D8302A';
    for (const y of [H * 0.08, H * 0.58]) g.fillRect(rx, y, 80, 22);
    for (const y of [H * 0.26, H * 0.76]) {
      g.fillStyle = '#15110F';
      g.beginPath();
      g.arc(rx + 40, y, 17, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4A9AE8';
      g.beginPath();
      g.arc(rx + 40, y, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.beginPath();
      g.arc(rx + 34, y - 5, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(rx + 68, 0, 12, H);
    // Floodlights on poles.
    for (const [x, y] of [[170, H * 0.62], [200, H * 0.1]] as [number, number][]) {
      g.fillStyle = '#2A3040';
      g.fillRect(x, y, 5, 80);
      g.fillStyle = '#F4F8FF';
      g.beginPath();
      g.arc(x + 2, y, 8, 0, Math.PI * 2);
      g.fill();
      pool(g, x + 2, y, 70, '200,220,255', 0.4);
    }
    shadeSides(g, W, H, 0.3);
  },
  decor(ctx, W, H, at, t, low) {
    // The beacons on the tower blink red in turn.
    for (let y = 0; y < H; y += 112) {
      for (const sy of at(y + 30)) {
        const on = Math.floor(t * 1.2 + y * 0.01) % 2 === 0;
        ctx.fillStyle = on ? '#FF3A3A' : 'rgba(255,58,58,0.2)';
        ctx.beginPath();
        ctx.arc(SPACE.gantry.x + 7, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        if (on && !low) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(SPACE.gantry.x + 7, sy, 0, SPACE.gantry.x + 7, sy, 18);
          g.addColorStop(0, 'rgba(255,58,58,0.6)');
          g.addColorStop(1, 'rgba(255,58,58,0)');
          ctx.fillStyle = g;
          ctx.fillRect(SPACE.gantry.x - 12, sy - 18, 38, 36);
          ctx.restore();
        }
      }
    }
    // The portholes of the rocket light up and fade.
    for (const y of [H * 0.26, H * 0.76]) {
      for (const sy of at(y)) {
        ctx.globalAlpha = 0.3 + 0.25 * Math.sin(t * 1.4 + y);
        ctx.fillStyle = '#BEE4FF';
        ctx.beginPath();
        ctx.arc(SPACE.rocket.x + 40, sy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (low) return;
    // Cold vapour streams from the rocket and a shooting star crosses the sky.
    for (const sy of at(H * 0.42)) {
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.4 + i / 4) % 1;
        ctx.globalAlpha = 0.3 * Math.sin(ph * Math.PI);
        ctx.fillStyle = '#E8F0FF';
        ctx.beginPath();
        ctx.arc(SPACE.rocket.x - 6 - ph * 22, sy + Math.sin(ph * 5 + i) * 6 + i * 4, 5 + ph * 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const sy of at(H * 0.1)) {
      const k = (t * 0.09) % 1;
      if (k > 0.25) continue;
      const kk = k / 0.25;
      const x = W * 0.9 - kk * W * 0.7;
      const y = sy + kk * 90;
      const g = ctx.createLinearGradient(x, y, x + 60, y - 22);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 60, y - 22);
      ctx.stroke();
    }
  },
};

// ------------------------------------------------------------------ the list of scenes and the entry points
const SCENES: Scene[] = [yard, basement, office, cabinet, showroom, buyHouse, emptyHouse, home, business, fame, mansion, yacht, space];

/** The static sky behind the scrolling tile. */
export function paintStorySky(g: G, tier: number, W: number, H: number): void {
  SCENES[Math.min(tier, SCENES.length - 1)].sky?.(g, W, H);
}

/** The scrolling tile with the wall and its big props (it repeats up the screen). */
export function paintStoryTile(g: G, tier: number, W: number, H: number): void {
  SCENES[Math.min(tier, SCENES.length - 1)].tile?.(g, W, H);
}

/** Every scene paints its own far view into the tile or the sky, so there is no separate far layer. */
export function paintStoryParallax(_g: G, _tier: number, _W: number, _H: number, _layer: 0 | 1 | 2): void {
  // Nothing: the tiles are opaque or sit on their own sky.
}

/**
 * The living details of a scene, drawn on top of the tile every frame. `off` is the scroll offset of
 * the tile: every position is drawn twice (the tile itself is drawn twice). `low` leaves only the
 * cheapest details.
 */
export function drawStoryDecor(ctx: CanvasRenderingContext2D, tier: number, W: number, H: number, off: number, t: number, low: boolean): void {
  const at = (y: number): number[] => [y + off - H, y + off];
  ctx.save();
  SCENES[Math.min(tier, SCENES.length - 1)].decor?.(ctx, W, H, at, t, low);
  ctx.restore();
}
