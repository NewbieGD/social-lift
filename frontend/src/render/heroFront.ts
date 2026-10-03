// The hero facing the player, for the menu, wardrobe and result covers.
// Same illustration language as the in-game hero (one outline weight, flat colors),
// plus soft volume: light from the top-left, a highlight on the head and cloth,
// ambient shadow under the chin and a contact shadow on the floor.
// Origin: between the feet on the floor; y grows downward.

import type { Outfit } from './hero';

const SKIN = '#F0BE94';
const SKIN_DARK = '#D79C72';
const HAIR = '#3B2A22';
const LINE = '#2A1E22';
const LW = 1.25;

type P = { x: number; y: number };

export type FrontPose = 'idle' | 'wave' | 'hips';

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function blinkAt(t: number): number {
  const slot = Math.floor(t / 3.2);
  const start = slot * 3.2 + hash(slot) * 2.4;
  const d = t - start;
  const one = (x: number): number => (x >= 0 && x < 0.16 ? Math.sin((x / 0.16) * Math.PI) : 0);
  let b = one(d);
  if (hash(slot + 77) > 0.78) b = Math.max(b, one(d - 0.24));
  return b;
}

function line(ctx: CanvasRenderingContext2D, w = LW): void {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Linear "volume" fill: lighter on the left (light side), darker on the right. */
function volume(ctx: CanvasRenderingContext2D, color: string, x0: number, x1: number, strength = 0.18): void {
  ctx.fillStyle = color;
  ctx.fill();
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, `rgba(255,255,255,${strength})`);
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fill();
}

function capsulePath(ctx: CanvasRenderingContext2D, a: P, b: P, wa: number, wb: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ang = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(a.x + (nx * wa) / 2, a.y + (ny * wa) / 2);
  ctx.lineTo(b.x + (nx * wb) / 2, b.y + (ny * wb) / 2);
  ctx.arc(b.x, b.y, wb / 2, ang + Math.PI / 2, ang - Math.PI / 2, true);
  ctx.lineTo(a.x - (nx * wa) / 2, a.y - (ny * wa) / 2);
  ctx.arc(a.x, a.y, wa / 2, ang - Math.PI / 2, ang + Math.PI / 2, true);
  ctx.closePath();
}

/** A limb drawn as one shape: outline pass for both parts, then fills with volume. */
function limb(ctx: CanvasRenderingContext2D, a: P, j: P, e: P, w: [number, number, number], upper: string, lower: string): void {
  const o = LW * 2;
  ctx.fillStyle = LINE;
  capsulePath(ctx, a, j, w[0] + o, w[1] + o);
  ctx.fill();
  capsulePath(ctx, j, e, w[1] + o, w[2] + o);
  ctx.fill();
  capsulePath(ctx, j, e, w[1], w[2]);
  volume(ctx, lower, Math.min(j.x, e.x) - w[1], Math.max(j.x, e.x) + w[1], 0.14);
  capsulePath(ctx, a, j, w[0], w[1]);
  volume(ctx, upper, Math.min(a.x, j.x) - w[0], Math.max(a.x, j.x) + w[0], 0.14);
}

function ik(s: P, t: P, l1: number, l2: number, bend: number): [P, P, P] {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const d = Math.min(l1 + l2 - 0.6, Math.max(Math.abs(l1 - l2) + 1.5, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const ea = base + a * bend;
  const j = { x: s.x + Math.cos(ea) * l1, y: s.y + Math.sin(ea) * l1 };
  return [s, j, { x: s.x + Math.cos(base) * d, y: s.y + Math.sin(base) * d }];
}

function hand(ctx: CanvasRenderingContext2D, at: P, skin: string, r = 3.6): void {
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  volume(ctx, skin, at.x - r, at.x + r, 0.12);
  line(ctx);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/**
 * Draws the front-facing hero. `pose` drives the arms: waving, hands on hips, or relaxed.
 */
export function drawHeroFront(
  ctx: CanvasRenderingContext2D,
  o: Outfit,
  t: number,
  pose: FrontPose = 'idle',
  face: 'normal' | 'grin' = 'normal',
): void {
  const breathe = Math.sin(t * 2.4) * 0.5;
  const skin = o.suit ? '#E9EEF5' : SKIN;
  const jacket = o.top === 'jacket' && !o.suit;
  const jacketC = o.luxury ? '#1B1D27' : '#24315C';
  const pants = o.suit ? '#E9EEF5' : o.legs === 'trousers' ? (o.luxury ? '#17181F' : '#2D3242') : o.legs === 'sweats' ? '#6E7685' : '#4A6694';
  const shin = o.legs === 'shorts' && !o.suit ? SKIN : pants;
  const top = o.suit ? '#E9EEF5' : jacket ? jacketC : o.top === 'shirt' ? '#CFE3F5' : '#F1ECDF';
  const sleeve = o.suit ? '#E9EEF5' : jacket ? jacketC : o.top === 'shirt' ? '#BCD5EE' : SKIN;

  // Contact shadow on the floor.
  const sh = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
  sh.addColorStop(0, 'rgba(0,0,0,0.35)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(0, 0.5, 16, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- Legs ----
  for (const side of [-1, 1]) {
    const hip = { x: side * 4.2, y: -21 };
    const knee = { x: side * 4.5, y: -11.5 };
    const ankle = { x: side * 4.6, y: -3 };
    limb(ctx, hip, knee, ankle, [7.6, 6.4, 5.4], pants, shin);
    if (o.legs === 'shorts' && !o.suit) {
      capsulePath(ctx, hip, { x: side * 4.45, y: -13.5 }, 8.6, 8.2);
      volume(ctx, pants, side * 4.4 - 4, side * 4.4 + 4, 0.14);
      line(ctx, 1);
    }
    if (o.legs === 'sweats' && !o.suit) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(side * 7.2, -20);
      ctx.lineTo(side * 7.4, -4);
      ctx.stroke();
    }
    // Feet / shoes, seen from the front.
    ctx.save();
    ctx.translate(side * 4.9, -1.6);
    if (o.suit) {
      rr(ctx, -4.2, -2.6, 8.4, 4.4, 2);
      volume(ctx, '#C9D2DD', -4, 4);
    } else if (o.feet === 'shoes') {
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.6, 2.6, 0, 0, Math.PI * 2);
      volume(ctx, '#1B1B1F', -4, 4, 0.25);
    } else if (o.feet === 'slippers') {
      rr(ctx, -4.6, -0.2, 9.2, 2.4, 1.2);
      ctx.fillStyle = '#2F6FD8';
      ctx.fill();
      line(ctx);
      ctx.beginPath();
      ctx.ellipse(0, -0.4, 4.2, 2.6, 0, Math.PI, 0);
      ctx.closePath();
      volume(ctx, '#4A8EF2', -4, 4);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.6, 2.2, 0, 0, Math.PI * 2);
      volume(ctx, SKIN_DARK, -4, 4);
    }
    line(ctx);
    if (o.feet === 'shoes' && !o.suit) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-2.4, -1.6, 2.6, 0.9);
    }
    ctx.restore();
  }

  // ---- Torso ----
  const ty = -40 + breathe;
  ctx.beginPath();
  ctx.moveTo(-9.6, ty + 3);
  ctx.quadraticCurveTo(-10, ty, -6, ty - 0.6);
  ctx.quadraticCurveTo(0, ty - 1.6, 6, ty - 0.6);
  ctx.quadraticCurveTo(10, ty, 9.6, ty + 3);
  ctx.bezierCurveTo(9, ty + 10, 7.4, ty + 14, 7.6, ty + 19.5);
  ctx.quadraticCurveTo(0, ty + 21.5, -7.6, ty + 19.5);
  ctx.bezierCurveTo(-7.4, ty + 14, -9, ty + 10, -9.6, ty + 3);
  ctx.closePath();
  volume(ctx, top, -10, 10, 0.2);
  ctx.save();
  ctx.clip();
  if (o.top === 'tank' && !o.suit) {
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.moveTo(-4.2, ty - 2);
    ctx.quadraticCurveTo(0, ty + 7, 4.2, ty - 2);
    ctx.fill();
    ctx.fillRect(-11, ty - 2, 4.2, 7);
    ctx.fillRect(6.8, ty - 2, 4.2, 7);
  }
  if (jacket) {
    ctx.fillStyle = '#F7F7F7';
    ctx.beginPath();
    ctx.moveTo(-4.4, ty - 1);
    ctx.lineTo(0, ty + 12);
    ctx.lineTo(4.4, ty - 1);
    ctx.closePath();
    ctx.fill();
  }
  // Fold shadow at the waist.
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(-10, ty + 16, 20, 4);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-9.6, ty + 3);
  ctx.quadraticCurveTo(-10, ty, -6, ty - 0.6);
  ctx.quadraticCurveTo(0, ty - 1.6, 6, ty - 0.6);
  ctx.quadraticCurveTo(10, ty, 9.6, ty + 3);
  ctx.bezierCurveTo(9, ty + 10, 7.4, ty + 14, 7.6, ty + 19.5);
  ctx.quadraticCurveTo(0, ty + 21.5, -7.6, ty + 19.5);
  ctx.bezierCurveTo(-7.4, ty + 14, -9, ty + 10, -9.6, ty + 3);
  ctx.closePath();
  line(ctx);
  if (o.top === 'shirt' && !o.suit) {
    ctx.strokeStyle = 'rgba(40,60,90,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, ty + 3);
    ctx.lineTo(0, ty + 20);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,60,90,0.55)';
    for (let i = 0; i < 3; i++) ctx.fillRect(-0.55, ty + 6 + i * 4.3, 1.1, 1.1);
  }
  if (jacket) {
    ctx.strokeStyle = o.luxury ? '#E8C060' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-5, ty - 0.5);
    ctx.lineTo(-0.6, ty + 12.5);
    ctx.lineTo(-2.6, ty + 20);
    ctx.moveTo(5, ty - 0.5);
    ctx.lineTo(0.6, ty + 12.5);
    ctx.lineTo(2.6, ty + 20);
    ctx.stroke();
    ctx.fillStyle = o.luxury ? '#E8C060' : '#C9CED8';
    ctx.beginPath();
    ctx.arc(1.2, ty + 15, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  if ((o.top === 'shirt' || jacket) && !o.suit) {
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, ty + 4);
      ctx.lineTo(side * 4.6, ty - 1.2);
      ctx.lineTo(side * 1.4, ty - 1.4);
      ctx.closePath();
      ctx.fill();
      line(ctx, 0.9);
    }
  }
  if (o.tie && !o.suit) {
    const sway = Math.sin(t * 2) * 0.03;
    ctx.save();
    ctx.translate(0, ty + 2.6);
    ctx.rotate(sway);
    ctx.beginPath();
    ctx.moveTo(-1.6, 0);
    ctx.lineTo(1.6, 0);
    ctx.lineTo(2.4, 10.5);
    ctx.lineTo(0, 13.2);
    ctx.lineTo(-2.4, 10.5);
    ctx.closePath();
    volume(ctx, o.luxury ? '#E8C060' : '#C8263C', -2.4, 2.4, 0.2);
    line(ctx, 0.9);
    ctx.restore();
  }
  if (o.suit) {
    ctx.fillStyle = '#F08A24';
    rr(ctx, -7, ty + 7, 4.6, 2.8, 1);
    ctx.fill();
    ctx.fillStyle = '#5AA8FF';
    rr(ctx, 2.8, ty + 6, 4, 4, 1);
    ctx.fill();
  }
  // Belt / waistband
  ctx.beginPath();
  ctx.moveTo(-7.8, ty + 18.4);
  ctx.quadraticCurveTo(0, ty + 20, 7.8, ty + 18.4);
  ctx.lineTo(7.9, ty + 21.8);
  ctx.quadraticCurveTo(0, ty + 23.4, -7.9, ty + 21.8);
  ctx.closePath();
  volume(ctx, o.legs === 'trousers' && !o.suit ? '#5A3E2A' : pants, -8, 8, 0.14);
  line(ctx, 1);

  // ---- Arms: torch in the hero's right hand (viewer's left), the other waves / rests ----
  const lS = { x: -9, y: ty + 2.4 };
  const rS = { x: 9, y: ty + 2.4 };
  // Torch arm: relaxed down and slightly forward/out.
  const torchHand = { x: -12.6, y: ty + 17 + Math.sin(t * 2.4) * 0.3 };
  const tArm = ik(lS, torchHand, 8.4, 7.8, -1);
  limb(ctx, tArm[0], tArm[1], tArm[2], [6, 5, 4.3], sleeve, o.top === 'tank' && !o.suit ? SKIN : sleeve);
  // Flashlight held pointing down-out, gripped by the hand.
  ctx.save();
  ctx.translate(tArm[2].x, tArm[2].y);
  ctx.rotate(Math.PI * 0.62);
  ctx.fillStyle = o.newTorch ? '#D3D8E2' : '#3F4450';
  rr(ctx, -3, -2.1, 13, 4.2, 1.6);
  ctx.fill();
  line(ctx);
  ctx.fillStyle = o.newTorch ? '#B9C0CC' : '#30343E';
  rr(ctx, 7.6, -2.9, 4, 5.8, 1.4);
  ctx.fill();
  line(ctx);
  ctx.fillStyle = '#FFD640';
  rr(ctx, 11.2, -2.5, 1.6, 5, 0.8);
  ctx.fill();
  ctx.restore();
  hand(ctx, tArm[2], skin);
  if (o.watch) {
    const a = Math.atan2(tArm[2].y - tArm[1].y, tArm[2].x - tArm[1].x);
    ctx.save();
    ctx.translate(tArm[2].x - Math.cos(a) * 3.2, tArm[2].y - Math.sin(a) * 3.2);
    ctx.rotate(a);
    rr(ctx, -1.4, -3, 2.8, 6, 1);
    volume(ctx, '#E8C060', -1.4, 1.4, 0.25);
    line(ctx, 0.9);
    ctx.restore();
  }

  // Free arm.
  const cycle = t % 6;
  const waving = pose === 'wave' || (pose === 'idle' && cycle < 2.2);
  const hips = pose === 'hips' || (pose === 'idle' && !waving);
  let target: P;
  let bend = 1;
  if (waving) {
    target = { x: 16 + Math.sin(t * 7) * 2.6, y: ty - 10 + Math.abs(Math.cos(t * 7)) * 0.8 };
    bend = 1;
  } else if (o.phone) {
    target = { x: 6, y: ty + 9 };
    bend = 1;
  } else if (hips) {
    target = { x: 9.6, y: ty + 17 };
    bend = -1;
  } else {
    target = { x: 12.4, y: ty + 17 };
    bend = 1;
  }
  const fArm = ik(rS, target, 8.4, 7.8, bend);
  limb(ctx, fArm[0], fArm[1], fArm[2], [6, 5, 4.3], sleeve, o.top === 'tank' && !o.suit ? SKIN : sleeve);
  if (o.phone && !waving) {
    ctx.save();
    ctx.translate(fArm[2].x, fArm[2].y - 3);
    rr(ctx, -3, -5.5, 6, 10, 1.6);
    ctx.fillStyle = '#17191F';
    ctx.fill();
    line(ctx);
    ctx.fillStyle = 'rgba(140,200,255,0.95)';
    ctx.fillRect(-2, -4.4, 4, 7.6);
    ctx.restore();
  }
  hand(ctx, fArm[2], skin);

  // ---- Neck and head ----
  const hy = -53 + breathe * 1.1;
  capsulePath(ctx, { x: 0, y: ty - 0.5 }, { x: 0, y: hy + 9 }, 5.4, 5.2);
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.fillStyle = 'rgba(120,60,40,0.28)'; // shadow under the chin
  ctx.fillRect(-2.7, hy + 8.5, 5.4, 2.4);
  capsulePath(ctx, { x: 0, y: ty - 0.5 }, { x: 0, y: hy + 9 }, 5.4, 5.2);
  line(ctx, 1);

  ctx.save();
  ctx.translate(0, hy);
  ctx.rotate(Math.sin(t * 1.3) * 0.03);
  // Hair behind
  ctx.beginPath();
  ctx.ellipse(0, -2, 12.4, 11.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = HAIR;
  ctx.fill();
  line(ctx);
  // Ears
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 11.2, 1.2, 2.4, 3.1, 0, 0, Math.PI * 2);
    volume(ctx, skin, side * 11 - 3, side * 11 + 3, 0.12);
    line(ctx, 1);
  }
  // Face with soft volume.
  ctx.beginPath();
  ctx.moveTo(-10.6, -1);
  ctx.bezierCurveTo(-10.8, -11, 10.8, -11, 10.6, -1);
  ctx.bezierCurveTo(10.4, 6, 6.4, 10.8, 0, 10.8);
  ctx.bezierCurveTo(-6.4, 10.8, -10.4, 6, -10.6, -1);
  ctx.closePath();
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const fg = ctx.createRadialGradient(-4, -5, 2, 0, 0, 14);
  fg.addColorStop(0, 'rgba(255,255,255,0.22)');
  fg.addColorStop(0.6, 'rgba(255,255,255,0)');
  fg.addColorStop(1, 'rgba(150,80,50,0.25)');
  ctx.fillStyle = fg;
  ctx.fillRect(-12, -12, 24, 24);
  ctx.fillStyle = 'rgba(232,120,110,0.18)';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 6.4, 4.2, 2.4, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-10.6, -1);
  ctx.bezierCurveTo(-10.8, -11, 10.8, -11, 10.6, -1);
  ctx.bezierCurveTo(10.4, 6, 6.4, 10.8, 0, 10.8);
  ctx.bezierCurveTo(-6.4, 10.8, -10.4, 6, -10.6, -1);
  ctx.closePath();
  line(ctx);

  // Fringe
  if (!o.cap && !o.suit) {
    ctx.beginPath();
    ctx.moveTo(-11.4, -1);
    ctx.bezierCurveTo(-12.6, -13, 10, -16, 11.6, -2.4);
    ctx.quadraticCurveTo(7, -7.6, 2, -6.8);
    ctx.quadraticCurveTo(0.6, -8.6, -2.4, -7.6);
    ctx.quadraticCurveTo(-7, -6.8, -9, -3);
    ctx.closePath();
    ctx.fillStyle = HAIR;
    ctx.fill();
    line(ctx);
    ctx.beginPath();
    ctx.moveTo(-1.6, -11.5);
    ctx.quadraticCurveTo(-1.6, -17, 3.6, -16.4);
    ctx.quadraticCurveTo(1, -14, 1.8, -11.6);
    ctx.closePath();
    ctx.fill();
    line(ctx, 1);
  }

  // Eyes
  const blink = blinkAt(t);
  for (const side of [-1, 1]) {
    const cx = side * 4.4;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, -1, 2.5, 2.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#2B2023';
    ctx.beginPath();
    ctx.arc(cx + 0.3, -0.7, 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + 0.9, -1.5, 0.55, 0, Math.PI * 2);
    ctx.fill();
    if (blink > 0) {
      ctx.fillStyle = skin;
      ctx.fillRect(cx - 3.5, -5, 7, 5.9 * blink + 0.4);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(cx, -1, 2.5, 2.9, 0, 0, Math.PI * 2);
    line(ctx, 1);
    // Eyebrow
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const by = face === 'grin' ? -5.7 : -5.2;
    ctx.moveTo(cx - 2.4, by);
    ctx.quadraticCurveTo(cx, by - 1.1, cx + 2.4, by);
    ctx.stroke();
  }
  // Nose: soft shading only.
  ctx.strokeStyle = SKIN_DARK;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-1, 2.6);
  ctx.quadraticCurveTo(0, 3.6, 1.2, 2.6);
  ctx.stroke();
  // Mouth
  if (face === 'grin') {
    ctx.beginPath();
    ctx.moveTo(-3.6, 5);
    ctx.quadraticCurveTo(0, 6, 3.6, 5);
    ctx.quadraticCurveTo(0, 9.4, -3.6, 5);
    ctx.closePath();
    ctx.fillStyle = '#5A2A24';
    ctx.fill();
    ctx.fillStyle = '#E86A6A';
    ctx.beginPath();
    ctx.ellipse(0, 7.2, 1.6, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#5A2A24';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-3, 5.2);
    ctx.quadraticCurveTo(0, 7.4, 3, 5.2);
    ctx.stroke();
  }

  // Head-worn items
  if (o.luxury && !o.suit) {
    ctx.fillStyle = '#121214';
    for (const side of [-1, 1]) {
      rr(ctx, side * 4.4 - 3.2, -3.4, 6.4, 4.2, 1.8);
      ctx.fill();
    }
    ctx.fillRect(-1.4, -2.4, 2.8, 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(-6.6, -2.8, 2, 0.8);
    ctx.fillRect(2.2, -2.8, 2, 0.8);
  }
  if (o.cap && !o.suit) {
    // Backwards cap seen from the front: the crown covers the hair, the strap band shows.
    ctx.beginPath();
    ctx.moveTo(-12.4, -1.6);
    ctx.bezierCurveTo(-13.4, -17.6, 13.4, -17.6, 12.4, -1.6);
    ctx.quadraticCurveTo(0, -6, -12.4, -1.6);
    ctx.closePath();
    volume(ctx, '#C8263C', -12, 12, 0.2);
    line(ctx);
    ctx.fillStyle = '#9E1B2E';
    ctx.beginPath();
    ctx.moveTo(-5, -4.6);
    ctx.quadraticCurveTo(0, -6.2, 5, -4.6);
    ctx.lineTo(4.6, -2.8);
    ctx.quadraticCurveTo(0, -4.2, -4.6, -2.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -15.8, 1.3, 0, Math.PI * 2);
    ctx.fill();
    line(ctx, 0.8);
  }
  if (o.suit) {
    ctx.strokeStyle = 'rgba(220,235,255,0.95)';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(160,210,255,0.16)';
    ctx.beginPath();
    ctx.arc(0, -1, 15.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-3, -4, 10, Math.PI * 1.05, Math.PI * 1.4);
    ctx.stroke();
  }
  ctx.restore();
}
