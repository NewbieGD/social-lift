// Pets (decoration only). Drawn in "pet units" (about the size of the hero's units), facing +x,
// origin on the ground under the body; y grows downward. Same soft-3D look as the hero.
// Poses: sit (idle), walk, jump (in the air), perch/fly for the parrot.

import { bodyGradient, edge, limb3d, sphere, spec, tone } from './shade3d';

type Ctx = CanvasRenderingContext2D;

export type PetKind = 'cat' | 'dog' | 'parrot';
export type PetMode = 'sit' | 'walk' | 'jump' | 'perch' | 'fly';

export interface PetPose {
  t: number;
  mode: PetMode;
  /** Walk cycle phase (radians). */
  phase: number;
}

export const PET_IDS: Record<string, PetKind> = { pet_cat: 'cat', pet_dog: 'dog', pet_parrot: 'parrot' };

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

/** A leg: hip -> paw at angle `a` (0 = straight down), with a soft paw. */
function leg(g: Ctx, hx: number, hy: number, a: number, len: number, w: number, col: string, paw: string): void {
  const fx = hx + Math.sin(a) * len;
  const fy = Math.min(-0.3, hy + Math.cos(a) * len);
  const j = { x: (hx + fx) / 2 + Math.cos(a) * 0.5, y: (hy + fy) / 2 };
  limb3d(g, { x: hx, y: hy }, j, { x: fx, y: fy }, [w, w * 0.9, w * 0.78], col, 1);
  sphere(g, fx + 0.3, fy - 0.1, w * 0.78, w * 0.5, paw);
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
// Cat
// ===========================================================================

function cat(g: Ctx, p: PetPose): void {
  const col = '#E8A055';
  const dark = '#B86A28';
  const light = '#F6E3C8';
  const { t, mode, phase } = p;
  const sit = mode === 'sit';
  const air = mode === 'jump';
  shadow(g, sit ? 5 : 7, air ? 4 : 0);
  const bob = mode === 'walk' ? Math.abs(Math.sin(phase)) * 0.5 : 0;
  const tailSway = Math.sin(t * 3.1) * 1.4;

  // Tail.
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const tail = (): void => {
    g.beginPath();
    if (sit) {
      g.moveTo(-3.4, -1.6);
      g.quadraticCurveTo(-7.2, 0.2, -4, 0.6 + tailSway * 0.1);
      g.quadraticCurveTo(1, 1.2, 4.4, 0.4);
    } else {
      g.moveTo(-5, -6.4 - bob);
      g.quadraticCurveTo(-9.2 + tailSway, -8.4, -8.4 + tailSway, -12.6);
    }
  };
  tail();
  g.strokeStyle = tone(dark, -0.45);
  g.lineWidth = 2.3;
  g.stroke();
  tail();
  g.strokeStyle = col;
  g.lineWidth = 1.7;
  g.stroke();
  g.restore();

  if (sit) {
    // Upright body with a round haunch.
    g.save();
    g.translate(-0.6, -4.8);
    g.rotate(0.18);
    sphere(g, 0, 0, 3.7, 4.7, col);
    g.restore();
    sphere(g, -2, -2.4, 3.2, 2.7, tone(col, -0.04));
    leg(g, 1.5, -5.6, 0, 5.2, 1.5, col, light);
    leg(g, 3, -5.6, -0.05, 5.2, 1.5, tone(col, 0.05), light);
    sphere(g, 2.2, -4.4, 1.6, 2.6, light);
  } else {
    const swing = mode === 'walk' ? 0.8 : 0;
    const fwd = air ? 1.05 : 0;
    // Far legs.
    leg(g, -3.4, -4.6 - bob, air ? -fwd : Math.sin(phase + Math.PI) * swing, 4.4, 1.3, tone(col, -0.2), tone(light, -0.2));
    leg(g, 3.6, -4.6 - bob, air ? fwd : Math.sin(phase) * swing, 4.4, 1.3, tone(col, -0.2), tone(light, -0.2));
    // Body.
    g.save();
    g.translate(0, -6.3 - bob);
    g.rotate(air ? -0.12 : 0);
    sphere(g, 0, 0, 5.8, 3.1, col);
    g.fillStyle = light;
    g.beginPath();
    g.ellipse(1, 1.2, 3.8, 1.3, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = tone(dark, 0.05);
    g.lineWidth = 0.7;
    for (const x of [-3, -1, 1]) {
      g.beginPath();
      g.moveTo(x, -3);
      g.quadraticCurveTo(x + 0.4, -1.8, x - 0.2, -0.6);
      g.stroke();
    }
    g.restore();
    // Near legs.
    leg(g, -2.6, -4.4 - bob, air ? -fwd : Math.sin(phase) * swing, 4.4, 1.5, col, light);
    leg(g, 4.6, -4.4 - bob, air ? fwd : Math.sin(phase + Math.PI) * swing, 4.4, 1.5, col, light);
  }

  // Head.
  const hx = sit ? 2.6 : 6.1;
  const hy = sit ? -10.9 : -8.9 - bob;
  for (const [ex, ey, flip] of [[hx - 1.6, hy - 2.2, -1], [hx + 1.7, hy - 2.4, 1]] as [number, number, number][]) {
    g.beginPath();
    g.moveTo(ex - 1.5, ey + 1.2);
    g.lineTo(ex + flip * 0.3, ey - 2.9);
    g.lineTo(ex + 1.7, ey + 1.2);
    g.closePath();
    g.fillStyle = col;
    g.fill();
    edge(g, col, 0.6);
    g.beginPath();
    g.moveTo(ex - 0.8, ey + 0.8);
    g.lineTo(ex + flip * 0.2, ey - 1.6);
    g.lineTo(ex + 0.9, ey + 0.8);
    g.closePath();
    g.fillStyle = '#F2A0A8';
    g.fill();
  }
  sphere(g, hx, hy, 3.1, 2.8, col);
  g.fillStyle = light;
  g.beginPath();
  g.ellipse(hx + 1.7, hy + 1, 1.7, 1.25, 0, 0, Math.PI * 2);
  g.fill();
  const b = blink(t);
  eye(g, hx + 0.4, hy - 0.4, 0.8, '#7ED36B', b);
  eye(g, hx + 2.6, hy - 0.5, 0.85, '#7ED36B', b);
  g.fillStyle = '#E7788A';
  g.beginPath();
  g.moveTo(hx + 3.2, hy + 0.3);
  g.lineTo(hx + 4.1, hy + 0.3);
  g.lineTo(hx + 3.65, hy + 0.9);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(40,28,20,0.5)';
  g.lineWidth = 0.35;
  for (const dy of [-0.2, 0.5]) {
    g.beginPath();
    g.moveTo(hx + 3.4, hy + 0.5 + dy);
    g.lineTo(hx + 6.4, hy + 0.2 + dy * 2);
    g.stroke();
  }
  spec(g, hx - 1, hy - 1.6, 1.2, 0.7, 0.45);
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
  shadow(g, sit ? 6 : 8.4, air ? 4 : 0);
  const bob = mode === 'walk' ? Math.abs(Math.sin(phase)) * 0.6 : 0;
  const wag = Math.sin(t * (mode === 'sit' ? 12 : 8)) * 0.5;

  // Tail, wagging.
  g.save();
  g.translate(sit ? -4.4 : -6.4, sit ? -2.4 : -7.2 - bob);
  g.rotate(sit ? -0.5 + wag * 0.4 : -1.0 + wag * 0.5);
  limb3d(g, { x: 0, y: 0 }, { x: -1.2, y: -2 }, { x: -1.4, y: -4.2 }, [1.5, 1.3, 0.9], col, 1);
  g.restore();

  if (sit) {
    g.save();
    g.translate(-0.8, -5.2);
    g.rotate(0.15);
    sphere(g, 0, 0, 4.2, 5.2, col);
    g.restore();
    sphere(g, -2.4, -2.6, 3.6, 3, tone(col, -0.05));
    leg(g, 1.6, -6, 0, 5.8, 1.7, col, cream);
    leg(g, 3.3, -6, 0, 5.8, 1.7, tone(col, 0.06), cream);
    sphere(g, 2.4, -5.2, 1.9, 3, cream);
  } else {
    const swing = mode === 'walk' ? 0.85 : 0;
    const fwd = air ? 1.1 : 0;
    leg(g, -4, -5 - bob, air ? -fwd : Math.sin(phase + Math.PI) * swing, 5, 1.5, tone(col, -0.22), tone(cream, -0.2));
    leg(g, 4.4, -5 - bob, air ? fwd : Math.sin(phase) * swing, 5, 1.5, tone(col, -0.22), tone(cream, -0.2));
    g.save();
    g.translate(0, -7.3 - bob);
    g.rotate(air ? -0.1 : 0);
    sphere(g, 0, 0, 6.8, 3.7, col);
    g.fillStyle = cream;
    g.beginPath();
    g.ellipse(1.4, 1.5, 4.4, 1.5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    leg(g, -2.8, -5 - bob, air ? -fwd : Math.sin(phase) * swing, 5, 1.7, col, cream);
    leg(g, 5.4, -5 - bob, air ? fwd : Math.sin(phase + Math.PI) * swing, 5, 1.7, col, cream);
  }

  // Head with a snout and a floppy ear.
  const hx = sit ? 2.8 : 7.2;
  const hy = sit ? -11.6 : -10.2 - bob;
  sphere(g, hx, hy, 3.4, 3.2, col);
  sphere(g, hx + 3.2, hy + 1.1, 2.6, 1.7, cream);
  g.fillStyle = '#23252B';
  g.beginPath();
  g.ellipse(hx + 5.5, hy + 0.5, 0.95, 0.75, 0, 0, Math.PI * 2);
  g.fill();
  // Tongue while panting.
  if (sit || mode === 'walk') {
    const pant = 0.6 + 0.4 * Math.sin(t * 9);
    g.fillStyle = '#E8727E';
    g.beginPath();
    g.ellipse(hx + 4.2, hy + 2.8 + pant * 0.6, 0.8, 1.1 + pant * 0.5, 0, 0, Math.PI * 2);
    g.fill();
  }
  const b = blink(t);
  eye(g, hx + 1.2, hy - 0.8, 0.75, '#4A2E1A', b);
  g.save();
  g.translate(hx - 1.2, hy - 1.6);
  g.rotate(0.3 + Math.sin(t * 2) * 0.03 + (air ? -0.5 : 0));
  limb3d(g, { x: 0, y: 0 }, { x: -0.8, y: 2.2 }, { x: -0.6, y: 4.6 }, [2.4, 2.2, 1.6], dark, 1);
  g.restore();
  spec(g, hx - 0.8, hy - 2, 1.2, 0.7, 0.4);
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

export function drawPet(g: Ctx, kind: PetKind, pose: PetPose): void {
  g.save();
  if (kind === 'cat') cat(g, pose);
  else if (kind === 'dog') dog(g, pose);
  else parrot(g, pose);
  g.restore();
}

/** Approximate height of a pet in units (for icons). */
export function petHeight(kind: PetKind): number {
  return kind === 'dog' ? 15 : kind === 'cat' ? 14 : 15;
}
