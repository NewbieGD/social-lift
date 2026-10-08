// Pets (decoration only). Drawn in "pet units" (about the size of the hero's units), facing +x,
// origin on the ground under the body; y grows downward. Same soft-3D look as the hero.
// Poses: sit (idle), walk, jump (in the air), perch/fly for the parrot.

import { bodyGradient, edge, limb3d, sphere, spec, tone } from './shade3d';

type Ctx = CanvasRenderingContext2D;

export type PetKind = 'cat' | 'dog' | 'parrot' | 'spark';
export type PetMode = 'sit' | 'walk' | 'jump' | 'perch' | 'fly';

export interface PetPose {
  t: number;
  mode: PetMode;
  /** Walk cycle phase (radians). */
  phase: number;
}

export const PET_IDS: Record<string, PetKind> = { pet_cat: 'cat', pet_dog: 'dog', pet_parrot: 'parrot', pet_spark: 'spark' };

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function blink(t: number): number {
  const slot = Math.floor(t / 3.6);
  const start = slot * 3.6 + hash(slot + 5) * 2.6;
  const d = t - start;
  return d >= 0 && d < 0.15 ? Math.sin((d / 0.15) * Math.PI) : 0;
}

function shadow(g: Ctx, rx: number, lift = 0): void {
  const a = Math.max(0.12, 0.38 - lift * 0.02);
  const s = g.createRadialGradient(0, 0.3, 0.4, 0, 0.3, rx);
  s.addColorStop(0, `rgba(0,0,0,${a})`);
  s.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = s;
  g.beginPath();
  g.ellipse(0, 0.3, rx, rx * 0.26, 0, 0, Math.PI * 2);
  g.fill();
}

function eye(g: Ctx, x: number, y: number, r: number, iris: string, closed: number): void {
  if (closed > 0.5) {
    g.strokeStyle = '#2A1E1A';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x - r, y);
    g.quadraticCurveTo(x, y + r * 0.6, x + r, y);
    g.stroke();
    return;
  }
  g.beginPath();
  g.ellipse(x, y, r, r * 1.1, 0, 0, Math.PI * 2);
  g.fillStyle = iris;
  g.fill();
  g.fillStyle = '#15110F';
  g.beginPath();
  g.ellipse(x + r * 0.15, y, r * 0.38, r * 0.85, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x - r * 0.25, y - r * 0.35, r * 0.28, 0, Math.PI * 2);
  g.fill();
}

// ===========================================================================
// Shared fur helpers: smooth outlines (no circles), two-tone shading, soft belly and light edge
// ===========================================================================

type Pt = [number, number];

/** Fills a smooth path with fur-like shading (light on the upper left, darker underneath). */
function fur(
  g: Ctx,
  build: (g: Ctx) => void,
  box: [number, number, number, number],
  base: string,
  belly?: { color: string; build: (g: Ctx) => void },
): void {
  g.beginPath();
  build(g);
  const gr = g.createLinearGradient(box[0], box[1], box[2], box[3]);
  gr.addColorStop(0, tone(base, 0.24));
  gr.addColorStop(0.5, base);
  gr.addColorStop(1, tone(base, -0.3));
  g.fillStyle = gr;
  g.fill();
  if (belly) {
    g.save();
    g.clip();
    g.beginPath();
    belly.build(g);
    g.fillStyle = belly.color;
    g.fill();
    // Soft shadow along the lower edge.
    const sh = g.createLinearGradient(0, box[1], 0, box[3]);
    sh.addColorStop(0.6, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(60,30,10,0.25)');
    g.fillStyle = sh;
    g.fillRect(box[0] - 2, box[1] - 2, box[2] - box[0] + 4, box[3] - box[1] + 4);
    g.restore();
  } else {
    g.save();
    g.clip();
    const sh = g.createLinearGradient(0, box[1], 0, box[3]);
    sh.addColorStop(0.55, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(60,30,10,0.22)');
    g.fillStyle = sh;
    g.fillRect(box[0] - 2, box[1] - 2, box[2] - box[0] + 4, box[3] - box[1] + 4);
    g.restore();
  }
  g.beginPath();
  build(g);
  edge(g, base, 0.7);
}

/** A tapered, curved limb or tail along a centerline of points, drawn as one smooth shape. */
function tube(g: Ctx, pts: Pt[], w0: number, w1: number, base: string, stripes = false): void {
  const n = pts.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w]);
    right.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w]);
  }
  const path = (c: Ctx): void => {
    c.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(left[i][0], left[i][1]);
    const e = pts[n - 1];
    c.arc(e[0], e[1], Math.max(0.2, w1 / 2), Math.atan2(left[n - 1][1] - e[1], left[n - 1][0] - e[0]), Math.atan2(right[n - 1][1] - e[1], right[n - 1][0] - e[0]), true);
    for (let i = n - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
    c.closePath();
  };
  g.beginPath();
  path(g);
  const gr = g.createLinearGradient(pts[0][0], pts[0][1] - w0, pts[n - 1][0], pts[n - 1][1] + w0);
  gr.addColorStop(0, tone(base, 0.2));
  gr.addColorStop(1, tone(base, -0.26));
  g.fillStyle = gr;
  g.fill();
  if (stripes) {
    g.save();
    g.clip();
    g.strokeStyle = tone(base, -0.42);
    g.lineWidth = 0.7;
    for (let i = 2; i < n - 1; i += 2) {
      g.beginPath();
      g.moveTo(left[i][0], left[i][1]);
      g.lineTo(right[i][0], right[i][1]);
      g.stroke();
    }
    g.restore();
  }
  g.beginPath();
  path(g);
  edge(g, base, 0.6);
}

function paw(g: Ctx, x: number, y: number, w: number, col: string): void {
  g.beginPath();
  g.ellipse(x, y - 0.3, w, w * 0.5, 0, 0, Math.PI * 2);
  g.fillStyle = col;
  g.fill();
  edge(g, col, 0.5);
}

// ===========================================================================
// Cat
// ===========================================================================

function catHead(g: Ctx, x: number, y: number, t: number, col: string, light: string, tilt: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  // Ears with soft rounded tips.
  const ear = (flip: number, ex: number): void => {
    g.beginPath();
    g.moveTo(ex - 1.9, -2.2);
    g.quadraticCurveTo(ex - 2.2 * flip, -6.6, ex - 0.4 * flip, -6.8);
    g.quadraticCurveTo(ex + 1.9, -5.8, ex + 2.0, -2.4);
    g.closePath();
    g.fillStyle = tone(col, flip > 0 ? 0 : -0.08);
    g.fill();
    edge(g, col, 0.6);
    g.beginPath();
    g.moveTo(ex - 1.0, -2.8);
    g.quadraticCurveTo(ex - 1.1 * flip, -5.2, ex - 0.1 * flip, -5.3);
    g.quadraticCurveTo(ex + 1.0, -4.6, ex + 1.1, -2.9);
    g.closePath();
    g.fillStyle = '#F2A0A8';
    g.fill();
  };
  ear(-1, -1.9);
  ear(1, 2.3);
  // Head: wide cheeks, a gentle muzzle.
  fur(
    g,
    (c) => {
      c.moveTo(-3.6, 0.2);
      c.bezierCurveTo(-3.8, -3.2, -1, -4.6, 1.8, -4.4);
      c.bezierCurveTo(4.6, -4.2, 6.2, -2.2, 6.2, 0);
      c.bezierCurveTo(6.2, 2.4, 4.2, 3.8, 1.8, 3.8);
      c.bezierCurveTo(-1.2, 3.8, -3.6, 2.6, -3.6, 0.2);
      c.closePath();
    },
    [-4, -5, 6, 4],
    col,
    {
      color: light,
      build: (c) => {
        c.ellipse(4.2, 2.1, 3.1, 1.9, 0, 0, Math.PI * 2);
      },
    },
  );
  // Forehead stripes.
  g.strokeStyle = tone(col, -0.4);
  g.lineWidth = 0.6;
  g.lineCap = 'round';
  for (const dx of [-0.8, 0.8, 2.4]) {
    g.beginPath();
    g.moveTo(dx, -4.2);
    g.lineTo(dx + 0.2, -2.6);
    g.stroke();
  }
  const b = blink(t);
  eye(g, 0.3, -0.7, 0.95, '#7ED36B', b);
  eye(g, 3.3, -0.8, 1.05, '#7ED36B', b);
  // Nose, mouth and whiskers.
  g.fillStyle = '#E7788A';
  g.beginPath();
  g.moveTo(5.0, 0.7);
  g.quadraticCurveTo(6.4, 0.5, 6.4, 1.2);
  g.quadraticCurveTo(5.8, 2.1, 5.0, 1.4);
  g.closePath();
  g.fill();
  g.strokeStyle = '#7A3A2A';
  g.lineWidth = 0.4;
  g.beginPath();
  g.moveTo(5.6, 1.9);
  g.quadraticCurveTo(4.8, 3.2, 3.6, 2.8);
  g.moveTo(5.6, 1.9);
  g.quadraticCurveTo(6.4, 3, 7.4, 2.6);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 0.35;
  for (const dy of [0.4, 1.4]) {
    g.beginPath();
    g.moveTo(5.4, 1.2 + dy * 0.3);
    g.lineTo(9, 0.2 + dy * 1.6);
    g.stroke();
  }
  spec(g, -1.2, -3, 1.4, 0.8, 0.4);
  g.restore();
}

function cat(g: Ctx, p: PetPose): void {
  const col = '#E8A055';
  const light = '#F6E3C8';
  const { t, mode, phase } = p;
  const sit = mode === 'sit';
  const air = mode === 'jump';
  shadow(g, sit ? 5 : 7.2, air ? 4 : 0);
  const bob = mode === 'walk' ? Math.abs(Math.sin(phase)) * 0.5 : 0;
  const sway = Math.sin(t * 3.1) * 1.4;

  // Tail first, behind the body.
  if (sit) {
    tube(g, [[-4.2, -1.2], [-6.4, -0.6], [-5.2, 0.5], [-1, 0.9], [3.2, 0.7], [5.4, 0.2]], 2.3, 1.5, col, true);
  } else {
    tube(g, [[-5.4, -6.6 - bob], [-7.6, -8.4], [-8.6 + sway * 0.5, -11], [-8.2 + sway, -13.6], [-6.8 + sway * 1.3, -15]], 2.3, 1.4, col, true);
  }

  if (sit) {
    // Sitting loaf: a smooth teardrop with a round haunch and two straight front legs.
    fur(
      g,
      (c) => {
        c.moveTo(3.6, -0.4);
        c.bezierCurveTo(4.8, -3, 4.4, -6.4, 3, -8.8);
        c.bezierCurveTo(1.2, -10.6, -2, -10, -3.8, -7.4);
        c.bezierCurveTo(-5.8, -4.6, -6, -1.6, -4.4, -0.4);
        c.closePath();
      },
      [-6, -10, 5, 0],
      col,
      { color: light, build: (c) => c.ellipse(3.6, -3.6, 1.8, 3.8, 0.1, 0, Math.PI * 2) },
    );
    fur(
      g,
      (c) => {
        c.moveTo(-5.2, -0.5);
        c.bezierCurveTo(-6.2, -3.2, -4.6, -5.6, -2.6, -5.2);
        c.bezierCurveTo(-0.4, -4.8, 0.2, -2, -0.6, -0.5);
        c.closePath();
      },
      [-6, -6, 1, 0],
      tone(col, -0.06),
    );
    tube(g, [[2.2, -6.2], [2.6, -3.4], [2.7, -0.8]], 2.1, 1.7, col);
    paw(g, 2.9, 0, 1.5, light);
    tube(g, [[3.6, -6], [4, -3.4], [4, -0.8]], 2, 1.6, tone(col, 0.05));
    paw(g, 4.3, 0, 1.5, light);
    catHead(g, 2.4, -13.2, t, col, light, 0);
    return;
  }

  const swing = mode === 'walk' ? 0.8 : 0;
  const fwd = air ? 1.0 : 0;
  const leg = (hx: number, a: number, w: number, c: string, pc: string): void => {
    const len = 5;
    const fx = hx + Math.sin(a) * len;
    const fy = Math.min(-0.5, -4.4 - bob + Math.cos(a) * len);
    tube(g, [[hx, -4.6 - bob], [(hx + fx) / 2 + 0.3, (-4.6 - bob + fy) / 2], [fx, fy]], w, w * 0.72, c);
    paw(g, fx + 0.5, fy + 0.2, 1.5, pc);
  };
  // Far legs.
  leg(-3.2, air ? -fwd : Math.sin(phase + Math.PI) * swing, 1.9, tone(col, -0.2), tone(light, -0.2));
  leg(3.6, air ? fwd : Math.sin(phase) * swing, 1.9, tone(col, -0.2), tone(light, -0.2));
  // Body: an arched back, deep chest, tucked belly.
  g.save();
  g.translate(0, -bob);
  g.rotate(air ? -0.1 : 0);
  fur(
    g,
    (c) => {
      c.moveTo(-5.8, -6.2);
      c.bezierCurveTo(-6, -8.8, -2.8, -9.6, 0, -9.2);
      c.bezierCurveTo(2.8, -8.9, 4.8, -8.2, 5.6, -6.8);
      c.bezierCurveTo(6.2, -5.4, 5.6, -3.6, 4.2, -3.2);
      c.bezierCurveTo(1.8, -2.6, -1.4, -2.6, -3.6, -3);
      c.bezierCurveTo(-5.6, -3.4, -6.6, -4.8, -5.8, -6.2);
      c.closePath();
    },
    [-6, -10, 6, -2],
    col,
    { color: light, build: (c) => c.ellipse(1.4, -2.6, 4.6, 1.7, 0, 0, Math.PI * 2) },
  );
  g.strokeStyle = tone(col, -0.38);
  g.lineWidth = 0.7;
  g.lineCap = 'round';
  for (const x of [-3.6, -1.6, 0.4, 2.2]) {
    g.beginPath();
    g.moveTo(x, -9);
    g.quadraticCurveTo(x + 0.5, -7.8, x - 0.1, -6.2);
    g.stroke();
  }
  g.restore();
  // Near legs.
  leg(-2.4, air ? -fwd : Math.sin(phase) * swing, 2.1, col, light);
  leg(4.6, air ? fwd : Math.sin(phase + Math.PI) * swing, 2.1, col, light);
  catHead(g, 6.4, -9.6 - bob, t, col, light, air ? -0.1 : 0);
}

// ===========================================================================
// Dog
// ===========================================================================

function dog(g: Ctx, p: PetPose): void {
  const col = '#C98F5A';
  const dark = '#7A4A26';
  const cream = '#F2DDBA';
  const { t, mode, phase } = p;
  const sit = mode === 'sit';
  const air = mode === 'jump';
  shadow(g, sit ? 6 : 9, air ? 4 : 0);
  const bob = mode === 'walk' ? Math.abs(Math.sin(phase)) * 0.6 : 0;
  const wag = Math.sin(t * (sit ? 12 : 8)) * 0.5;

  // Tail, wagging: a thick curved tube that thins out.
  const tx = sit ? -4.6 : -6.6;
  const ty = sit ? -2.2 : -7.4 - bob;
  tube(
    g,
    [[tx, ty], [tx - 1.4 + wag, ty - 2.2], [tx - 1.8 + wag * 1.6, ty - 4.4], [tx - 1.2 + wag * 2, ty - 6.2]],
    2.3,
    1.2,
    col,
  );

  const head = (hx: number, hy: number, tilt: number): void => {
    g.save();
    g.translate(hx, hy);
    g.rotate(tilt);
    // Head with a long soft snout.
    fur(
      g,
      (c) => {
        c.moveTo(-3.6, 0);
        c.bezierCurveTo(-3.8, -3.6, -0.4, -5.2, 2.6, -4.6);
        c.bezierCurveTo(4.4, -4.2, 5.4, -3.4, 7, -2.6);
        c.bezierCurveTo(8.8, -2.4, 9.4, -1.2, 9, 0.4);
        c.bezierCurveTo(8.6, 1.8, 7, 2.4, 5.6, 2.2);
        c.bezierCurveTo(3.6, 3.4, 0.4, 3.8, -1.4, 3);
        c.bezierCurveTo(-3, 2.2, -3.6, 1.2, -3.6, 0);
        c.closePath();
      },
      [-4, -5, 10, 4],
      col,
      { color: cream, build: (c) => c.ellipse(6.6, 1.4, 4.4, 2.4, 0.1, 0, Math.PI * 2) },
    );
    // Nose and mouth.
    g.fillStyle = '#23252B';
    g.beginPath();
    g.ellipse(8.6, -1.4, 1.2, 0.95, -0.2, 0, Math.PI * 2);
    g.fill();
    spec(g, 8.2, -1.8, 0.5, 0.3, 0.8);
    g.strokeStyle = '#5A3A24';
    g.lineWidth = 0.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(8.4, -0.2);
    g.quadraticCurveTo(7.4, 1.6, 5.6, 1.6);
    g.stroke();
    if (mode === 'sit' || mode === 'walk') {
      const pant = 0.6 + 0.4 * Math.sin(t * 9);
      g.fillStyle = '#E8727E';
      g.beginPath();
      g.moveTo(6.4, 1.6);
      g.quadraticCurveTo(6.2, 3.4 + pant * 1.4, 5.2, 3 + pant * 1.2);
      g.quadraticCurveTo(4.8, 2.2, 5, 1.7);
      g.closePath();
      g.fill();
    }
    // A lighter patch above the eye, the eye, and a floppy ear.
    g.fillStyle = tone(col, 0.2);
    g.beginPath();
    g.ellipse(2.6, -2.2, 1.9, 1.1, -0.2, 0, Math.PI * 2);
    g.fill();
    eye(g, 2.4, -1.2, 0.9, '#4A2E1A', blink(t));
    g.save();
    g.translate(-0.6, -3.8);
    g.rotate(0.15 + Math.sin(t * 2) * 0.03 + (air ? -0.5 : 0));
    fur(
      g,
      (c) => {
        c.moveTo(0.4, 0);
        c.bezierCurveTo(-2.4, -0.2, -3.4, 3.6, -2.4, 6.2);
        c.bezierCurveTo(-1.6, 7.6, 0.8, 7, 1.4, 5);
        c.bezierCurveTo(2, 2.8, 2.2, 0.6, 0.4, 0);
        c.closePath();
      },
      [-3.5, 0, 2.2, 7.5],
      dark,
    );
    g.restore();
    g.restore();
  };

  if (sit) {
    fur(
      g,
      (c) => {
        c.moveTo(4, -0.4);
        c.bezierCurveTo(5.4, -3.2, 5, -7, 3.2, -9.6);
        c.bezierCurveTo(1, -11.4, -2.4, -10.8, -4.4, -8);
        c.bezierCurveTo(-6.6, -5, -6.8, -1.8, -5, -0.4);
        c.closePath();
      },
      [-7, -11, 6, 0],
      col,
      { color: cream, build: (c) => c.ellipse(4, -4.4, 2.2, 4.4, 0.1, 0, Math.PI * 2) },
    );
    fur(
      g,
      (c) => {
        c.moveTo(-5.6, -0.5);
        c.bezierCurveTo(-7, -3.6, -5.2, -6.4, -2.8, -5.8);
        c.bezierCurveTo(-0.2, -5.2, 0.4, -2, -0.6, -0.5);
        c.closePath();
      },
      [-7, -6.5, 1, 0],
      tone(col, -0.06),
    );
    tube(g, [[2.4, -6.6], [2.8, -3.6], [2.9, -0.8]], 2.4, 1.9, col);
    paw(g, 3.2, 0, 1.8, cream);
    tube(g, [[4, -6.4], [4.4, -3.6], [4.4, -0.8]], 2.3, 1.9, tone(col, 0.05));
    paw(g, 4.8, 0, 1.8, cream);
    head(3.4, -14.2, 0.05);
    return;
  }

  const swing = mode === 'walk' ? 0.85 : 0;
  const fwd = air ? 1.1 : 0;
  const leg = (hx: number, a: number, w: number, c: string, pc: string): void => {
    const len = 5.4;
    const fx = hx + Math.sin(a) * len;
    const fy = Math.min(-0.5, -5.2 - bob + Math.cos(a) * len);
    tube(g, [[hx, -5.2 - bob], [(hx + fx) / 2 + 0.3, (-5.2 - bob + fy) / 2], [fx, fy]], w, w * 0.7, c);
    paw(g, fx + 0.6, fy + 0.2, 1.8, pc);
  };
  leg(-4, air ? -fwd : Math.sin(phase + Math.PI) * swing, 2.1, tone(col, -0.22), tone(cream, -0.2));
  leg(4.4, air ? fwd : Math.sin(phase) * swing, 2.1, tone(col, -0.22), tone(cream, -0.2));
  g.save();
  g.translate(0, -bob);
  g.rotate(air ? -0.08 : 0);
  fur(
    g,
    (c) => {
      c.moveTo(-6.8, -7);
      c.bezierCurveTo(-7, -9.8, -3.6, -10.4, 0, -10);
      c.bezierCurveTo(3.4, -9.8, 6, -9.4, 7, -7.8);
      c.bezierCurveTo(7.6, -6.2, 6.8, -4, 5.2, -3.6);
      c.bezierCurveTo(2, -3, -2, -3, -4.4, -3.4);
      c.bezierCurveTo(-6.6, -3.8, -7.6, -5.4, -6.8, -7);
      c.closePath();
    },
    [-7, -10.5, 7.5, -3],
    col,
    { color: cream, build: (c) => c.ellipse(2, -3.2, 5.4, 1.8, 0, 0, Math.PI * 2) },
  );
  g.restore();
  leg(-2.8, air ? -fwd : Math.sin(phase) * swing, 2.3, col, cream);
  leg(5.6, air ? fwd : Math.sin(phase + Math.PI) * swing, 2.3, col, cream);
  head(7.6, -10.4 - bob, air ? -0.08 : 0);
}

// ===========================================================================
// Parrot
// ===========================================================================

function wing(g: Ctx, ang: number, col: string, tip: string, scale = 1): void {
  g.save();
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(-2.6 * scale, -3.4 * scale, -1 * scale, -8 * scale);
  g.quadraticCurveTo(1.6 * scale, -6 * scale, 2.2 * scale, -1.4 * scale);
  g.closePath();
  g.fillStyle = bodyGradient(g, col, -2.6, 2.2);
  g.fill();
  edge(g, col, 0.6);
  g.beginPath();
  g.moveTo(-1.8 * scale, -5.4 * scale);
  g.quadraticCurveTo(-1 * scale, -8.2 * scale, 0.6 * scale, -7.2 * scale);
  g.quadraticCurveTo(0.5 * scale, -5.6 * scale, -1.8 * scale, -5.4 * scale);
  g.fillStyle = tip;
  g.fill();
  g.restore();
}

function parrot(g: Ctx, p: PetPose): void {
  const col = '#4CC76A';
  const belly = '#A6EB8C';
  const blue = '#3B7BE0';
  const red = '#E8392F';
  const { t, mode, phase } = p;
  const fly = mode === 'fly' || mode === 'jump';
  shadow(g, 4, fly ? 8 : 0);
  const flap = Math.sin(t * 20);

  if (fly) {
    g.save();
    g.translate(0, -7);
    g.rotate(-0.22);
    // Far wing, tail, body, near wing.
    g.save();
    g.translate(0.6, -1.4);
    wing(g, 0.35 + flap * 0.85, tone(blue, -0.2), tone('#FFD640', -0.2), 1.05);
    g.restore();
    limb3d(g, { x: -3, y: 0.6 }, { x: -6, y: 1.8 }, { x: -9.4, y: 3 }, [2.2, 1.8, 1.2], red, 1);
    limb3d(g, { x: -3, y: 1.2 }, { x: -6.4, y: 2.8 }, { x: -9, y: 4.8 }, [1.8, 1.4, 1], blue, 1);
    g.save();
    sphere(g, 0, 0, 4.3, 2.8, col);
    g.fillStyle = belly;
    g.beginPath();
    g.ellipse(0.4, 1, 3, 1.4, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.save();
    g.translate(-0.4, -1.6);
    wing(g, -0.25 - flap * 0.85, blue, '#FFD640', 1.2);
    g.restore();
    g.restore();
    // Head is drawn in the body's tilted frame, so rebuild it here.
    g.save();
    g.translate(0, -7);
    g.rotate(-0.22);
    parrotHead(g, 3.9, -1.4, t);
    g.restore();
    return;
  }

  const hop = mode === 'walk' ? Math.abs(Math.sin(phase)) * 0.9 : 0;
  // Tail feathers touch the ground behind.
  limb3d(g, { x: -1.5, y: -3.4 - hop }, { x: -3.4, y: -2 - hop }, { x: -5.8, y: -0.5 - hop * 0.3 }, [2, 1.7, 1.1], red, 1);
  limb3d(g, { x: -1.3, y: -3 - hop }, { x: -3, y: -1.6 - hop }, { x: -4.6, y: 0 }, [1.6, 1.3, 1], blue, 1);
  // Feet.
  g.strokeStyle = '#E9A23B';
  g.lineWidth = 0.8;
  g.lineCap = 'round';
  for (const x of [-0.6, 1.2]) {
    g.beginPath();
    g.moveTo(x, -3 - hop);
    g.lineTo(x + (mode === 'walk' ? Math.sin(phase + x) * 0.8 : 0), -0.2);
    g.stroke();
    g.beginPath();
    g.moveTo(x - 0.9, -0.2);
    g.lineTo(x + 1, -0.2);
    g.stroke();
  }
  // Body.
  g.save();
  g.translate(0, -6.8 - hop);
  g.rotate(-0.08);
  sphere(g, 0, 0, 3.5, 4.8, col);
  g.fillStyle = belly;
  g.beginPath();
  g.ellipse(1.1, 0.8, 2, 3.4, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Folded wing, with a little shake now and then.
  g.save();
  g.translate(-0.4, -9.2 - hop);
  wing(g, 2.9 + Math.sin(t * 1.3) * 0.03, blue, '#FFD640', 0.9);
  g.restore();
  parrotHead(g, 1.4, -11.8 - hop, t);
}

function parrotHead(g: Ctx, x: number, y: number, t: number): void {
  const col = '#4CC76A';
  sphere(g, x, y, 2.9, 2.8, col);
  // Red crown and a pale cheek patch.
  g.beginPath();
  g.ellipse(x - 0.5, y - 2, 1.9, 1.1, -0.2, 0, Math.PI * 2);
  g.fillStyle = '#E8392F';
  g.fill();
  g.beginPath();
  g.ellipse(x + 0.3, y + 0.9, 1.5, 1.2, 0, 0, Math.PI * 2);
  g.fillStyle = '#F6F0D6';
  g.fill();
  // Beak.
  g.beginPath();
  g.moveTo(x + 1.8, y - 1.2);
  g.quadraticCurveTo(x + 5.2, y - 1.6, x + 4.4, y + 1.6);
  g.quadraticCurveTo(x + 3.4, y + 0.4, x + 1.8, y + 0.8);
  g.closePath();
  g.fillStyle = '#FFB72E';
  g.fill();
  edge(g, '#FFB72E', 0.5);
  const b = blink(t);
  if (b > 0.5) {
    g.strokeStyle = '#1B1412';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(x + 0.2, y - 0.4);
    g.lineTo(x + 1.5, y - 0.4);
    g.stroke();
  } else {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x + 0.9, y - 0.5, 0.95, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1B1412';
    g.beginPath();
    g.arc(x + 1.1, y - 0.5, 0.5, 0, Math.PI * 2);
    g.fill();
  }
}

// ===========================================================================
// Golden spark (premium): a glowing golden orb with fluttering wings and a sparkling trail
// ===========================================================================

function spark(g: Ctx, p: PetPose): void {
  const { t } = p;
  const cy = -9 + Math.sin(t * 5) * 0.9;
  shadow(g, 3.4, 9);
  // Trail of sparkles behind (to the left), twinkling.
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const k = i / 7;
    const x = -4 - i * 2.2 - Math.sin(t * 6 + i) * 0.8;
    const y = cy + Math.sin(t * 4 + i * 1.3) * 1.6 + k * 1.2;
    const a = (1 - k) * (0.45 + 0.4 * Math.abs(Math.sin(t * 7 + i * 2)));
    const gr = g.createRadialGradient(x, y, 0, x, y, 2.2 - k * 1.2);
    gr.addColorStop(0, `rgba(255,236,150,${a})`);
    gr.addColorStop(1, 'rgba(255,200,60,0)');
    g.fillStyle = gr;
    g.fillRect(x - 3, y - 3, 6, 6);
  }
  g.restore();
  // Wings: two pairs of translucent feathers that flutter very fast.
  const flap = Math.sin(t * 38);
  for (const [side, dark] of [[-1, true], [1, false]] as [number, boolean][]) {
    for (let i = 0; i < 2; i++) {
      g.save();
      g.translate(side * 2.4, cy - 0.2);
      // The wings sweep out to the sides and a little up, and flutter.
      g.rotate(side * (1.15 + i * 0.42 + flap * 0.38));
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(-1.5, -2.6, -1.2, -5.4, 0.3, -7.6 + i * 1.2);
      g.bezierCurveTo(2, -5.4, 1.8, -2.4, 0, 0);
      g.closePath();
      const wg = g.createLinearGradient(0, 0, 0, -9);
      wg.addColorStop(0, dark ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.9)');
      wg.addColorStop(1, 'rgba(255,225,130,0.55)');
      g.fillStyle = wg;
      g.fill();
      g.strokeStyle = 'rgba(225,170,40,0.8)';
      g.lineWidth = 0.4;
      g.stroke();
      g.restore();
    }
  }
  // The orb: gold sphere with a bright core, a swirl and a small ring.
  g.save();
  g.translate(0, cy);
  const orb = g.createRadialGradient(-1, -1.2, 0.3, 0, 0, 3.6);
  orb.addColorStop(0, '#FFFBE0');
  orb.addColorStop(0.35, '#FFD84A');
  orb.addColorStop(1, '#C98A12');
  g.beginPath();
  g.arc(0, 0, 3.4, 0, Math.PI * 2);
  g.fillStyle = orb;
  g.fill();
  edge(g, '#E6B83A', 0.6);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 0.5;
  g.beginPath();
  g.arc(0, 0, 2.2, t * 3, t * 3 + 2.4);
  g.stroke();
  g.strokeStyle = 'rgba(160,100,10,0.6)';
  g.lineWidth = 0.4;
  g.beginPath();
  g.ellipse(0, 0, 3.4, 1.1, -0.3, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  g.save();
  g.globalCompositeOperation = 'lighter';
  const halo = g.createRadialGradient(0, cy, 1, 0, cy, 9);
  halo.addColorStop(0, 'rgba(255,230,120,0.7)');
  halo.addColorStop(1, 'rgba(255,200,60,0)');
  g.fillStyle = halo;
  g.fillRect(-9, cy - 9, 18, 18);
  g.restore();
}

export function drawPet(g: Ctx, kind: PetKind, pose: PetPose): void {
  g.save();
  if (kind === 'cat') cat(g, pose);
  else if (kind === 'dog') dog(g, pose);
  else if (kind === 'spark') spark(g, pose);
  else parrot(g, pose);
  g.restore();
}

/** Approximate height of a pet in units (for icons). */
export function petHeight(kind: PetKind): number {
  return kind === 'dog' ? 20 : kind === 'cat' ? 19 : kind === 'spark' ? 20 : 15;
}
