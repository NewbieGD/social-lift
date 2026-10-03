// The hero facing the player (menu, wardrobe, story card) in "soft 3D":
// cylinders and spheres lit from the top-left, glossy eyes, contact shadow.
// Origin: between the feet on the floor; y grows downward.

import type { Outfit } from './hero';
import { bodyGradient, edge, fist3d, hand3d, limb3d, sphere, spec, tone, torch3d, type P } from './shade3d';

const SKIN = '#EDB48A';
const HAIR = '#3E2C22';

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

function ik(s: P, t: P, l1: number, l2: number, bend: number): [P, P, P] {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const d = Math.min(l1 + l2 - 0.6, Math.max(Math.abs(l1 - l2) + 1.5, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const j = { x: s.x + Math.cos(base + a * bend) * l1, y: s.y + Math.sin(base + a * bend) * l1 };
  return [s, j, { x: s.x + Math.cos(base) * d, y: s.y + Math.sin(base) * d }];
}

function torsoPath(ctx: CanvasRenderingContext2D, ty: number): void {
  ctx.beginPath();
  ctx.moveTo(-9.8, ty + 3);
  ctx.quadraticCurveTo(-10.2, ty, -6, ty - 0.6);
  ctx.quadraticCurveTo(0, ty - 1.7, 6, ty - 0.6);
  ctx.quadraticCurveTo(10.2, ty, 9.8, ty + 3);
  ctx.bezierCurveTo(9.2, ty + 10, 7.6, ty + 14, 7.8, ty + 19.6);
  ctx.quadraticCurveTo(0, ty + 21.8, -7.8, ty + 19.6);
  ctx.bezierCurveTo(-7.6, ty + 14, -9.2, ty + 10, -9.8, ty + 3);
  ctx.closePath();
}

/** Shoe seen from the front: sole, rounded toe, a highlight; slippers have a soft upper. */
function shoe(ctx: CanvasRenderingContext2D, o: Outfit, x: number): void {
  ctx.save();
  ctx.translate(x, -1.8);
  // sole
  ctx.beginPath();
  ctx.ellipse(0, 1.2, 5, 1.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = o.feet === 'shoes' ? '#111216' : o.feet === 'slippers' ? '#E9ECF2' : 'rgba(0,0,0,0)';
  ctx.fill();
  if (o.suit) {
    sphere(ctx, 0, -0.4, 4.8, 2.9, '#C9D2DD');
  } else if (o.feet === 'shoes') {
    sphere(ctx, 0, -0.5, 4.6, 2.7, '#24262D');
    spec(ctx, -1.6, -1.8, 1.8, 0.7, 0.85);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-1.2, -2.4);
    ctx.lineTo(1.2, -2.4);
    ctx.moveTo(-1, -1.6);
    ctx.lineTo(1, -1.6);
    ctx.stroke();
  } else if (o.feet === 'slippers') {
    sphere(ctx, 0, -0.4, 4.8, 2.8, '#3D7EE6');
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-3, -1.5, 6, 0.8);
    spec(ctx, -1.8, -1.9, 1.6, 0.7, 0.7);
  } else {
    sphere(ctx, 0, -0.3, 3.8, 2.3, tone(SKIN, -0.06));
    ctx.strokeStyle = tone(SKIN, -0.45);
    ctx.lineWidth = 0.45;
    for (const tx of [-1.6, 0, 1.6]) {
      ctx.beginPath();
      ctx.moveTo(tx, 0.4);
      ctx.lineTo(tx, 1.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawHeroFront(
  ctx: CanvasRenderingContext2D,
  o: Outfit,
  t: number,
  pose: FrontPose = 'idle',
  face: 'normal' | 'grin' = 'normal',
): void {
  const breathe = Math.sin(t * 2.4) * 0.45;
  const jacket = o.top === 'jacket' && !o.suit;
  const skin = o.suit ? '#E9EEF5' : SKIN;
  const pants = o.suit ? '#E9EEF5' : o.legs === 'trousers' ? (o.luxury ? '#1A1B22' : '#2F3547') : o.legs === 'sweats' ? '#737B8B' : '#4A6694';
  const top = o.suit ? '#E9EEF5' : jacket ? (o.luxury ? '#1C1E28' : '#273463') : o.top === 'shirt' ? '#CFE1F3' : '#F2EDE2';
  const sleeve = o.suit ? '#E9EEF5' : jacket ? top : o.top === 'shirt' ? '#C3D8EE' : SKIN;
  const forearm = o.top === 'tank' && !o.suit ? SKIN : sleeve;

  // Contact shadow
  const sh = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(0, 0.6, 18, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- Legs ----
  for (const s of [-1, 1]) {
    const hip = { x: s * 4.3, y: -21 };
    const knee = { x: s * 4.6, y: -11.6 };
    const ank = { x: s * 4.8, y: -3.4 };
    limb3d(ctx, hip, knee, ank, [7.8, 6.6, 5.4], pants, s < 0 ? 1 : -1, o.legs === 'shorts' && !o.suit ? SKIN : pants);
    if (o.legs === 'shorts' && !o.suit) {
      // Shorts end above the knee, wider than the leg.
      ctx.beginPath();
      ctx.moveTo(s * 4.3 - 4.6, -21.5);
      ctx.lineTo(s * 4.3 + 4.6, -21.5);
      ctx.lineTo(s * 4.6 + 4.7, -13.2);
      ctx.quadraticCurveTo(s * 4.5, -12.4, s * 4.6 - 4.7, -13.2);
      ctx.closePath();
      ctx.fillStyle = bodyGradient(ctx, pants, s * 4.4 - 4.7, s * 4.4 + 4.7);
      ctx.fill();
      edge(ctx, pants);
    }
    if (o.legs === 'sweats' && !o.suit) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(s * 7.4, -20);
      ctx.lineTo(s * 7.6, -5);
      ctx.stroke();
    }
    shoe(ctx, o, s * 5);
  }

  // ---- Torso ----
  const ty = -40 + breathe;
  torsoPath(ctx, ty);
  ctx.fillStyle = bodyGradient(ctx, top, -10, 10);
  ctx.fill();
  ctx.save();
  torsoPath(ctx, ty);
  ctx.clip();
  if (o.top === 'tank' && !o.suit) {
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.moveTo(-4.2, ty - 2);
    ctx.quadraticCurveTo(0, ty + 7.5, 4.2, ty - 2);
    ctx.fill();
    ctx.fillRect(-11, ty - 2, 4.4, 7);
    ctx.fillRect(6.6, ty - 2, 4.4, 7);
  }
  if (jacket) {
    ctx.fillStyle = '#F4F4F6';
    ctx.beginPath();
    ctx.moveTo(-4.4, ty - 1);
    ctx.lineTo(0, ty + 12);
    ctx.lineTo(4.4, ty - 1);
    ctx.fill();
  }
  // Folds at the sides and ambient shadow towards the belt.
  ctx.strokeStyle = tone(top, -0.28);
  ctx.lineWidth = 0.6;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 7, ty + 9);
    ctx.quadraticCurveTo(s * 4.5, ty + 13, s * 6.5, ty + 17);
    ctx.stroke();
  }
  const ao = ctx.createLinearGradient(0, ty + 14, 0, ty + 21);
  ao.addColorStop(0, 'rgba(0,0,0,0)');
  ao.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = ao;
  ctx.fillRect(-11, ty + 14, 22, 8);
  spec(ctx, -4.5, ty + 5, 4, 2.4, 0.3);
  ctx.restore();
  torsoPath(ctx, ty);
  edge(ctx, top);

  if ((o.top === 'shirt' || jacket) && !o.suit) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, ty + 4.4);
      ctx.lineTo(s * 4.8, ty - 1.2);
      ctx.lineTo(s * 1.4, ty - 1.5);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      edge(ctx, '#C9D3E0', 0.6);
    }
  }
  if (o.top === 'shirt' && !o.suit) for (let i = 0; i < 3; i++) sphere(ctx, 0, ty + 7 + i * 4.3, 0.7, 0.7, '#E8EEF6');
  if (jacket) {
    ctx.strokeStyle = o.luxury ? '#E8C060' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-5, ty - 0.5);
    ctx.lineTo(-0.6, ty + 12.5);
    ctx.lineTo(-2.6, ty + 20);
    ctx.moveTo(5, ty - 0.5);
    ctx.lineTo(0.6, ty + 12.5);
    ctx.lineTo(2.6, ty + 20);
    ctx.stroke();
    sphere(ctx, 1.2, ty + 15, 0.9, 0.9, o.luxury ? '#E8C060' : '#C9CED8');
  }
  if (o.tie && !o.suit) {
    ctx.beginPath();
    ctx.moveTo(-1.6, ty + 2.6);
    ctx.lineTo(1.6, ty + 2.6);
    ctx.lineTo(2.4, ty + 13);
    ctx.lineTo(0, ty + 15.6);
    ctx.lineTo(-2.4, ty + 13);
    ctx.closePath();
    const tieC = o.luxury ? '#E8C060' : '#C8263C';
    ctx.fillStyle = bodyGradient(ctx, tieC, -2.4, 2.4);
    ctx.fill();
    edge(ctx, tieC, 0.7);
  }
  if (o.suit) {
    sphere(ctx, -5, ty + 8.4, 2.4, 1.5, '#F08A24');
    sphere(ctx, 4.6, ty + 7.6, 1.9, 1.9, '#5AA8FF');
  }
  // Belt
  ctx.beginPath();
  ctx.moveTo(-8, ty + 18.4);
  ctx.quadraticCurveTo(0, ty + 20, 8, ty + 18.4);
  ctx.lineTo(8.1, ty + 21.8);
  ctx.quadraticCurveTo(0, ty + 23.4, -8.1, ty + 21.8);
  ctx.closePath();
  const beltC = o.legs === 'trousers' && !o.suit ? '#5A3E2A' : pants;
  ctx.fillStyle = bodyGradient(ctx, beltC, -8, 8);
  ctx.fill();
  edge(ctx, beltC, 0.7);

  // ---- Flashlight arm (variant A): elbow bent, the torch aims forward-down at the viewer ----
  const lS = { x: -9.2, y: ty + 2.6 };
  const swing = Math.sin(t * 2.4) * 0.3;
  const tArm: [P, P, P] = [lS, { x: -12.4, y: ty + 11 + swing * 0.5 }, { x: -11.8, y: ty + 18.6 + swing }];
  const ang = Math.atan2(tArm[2].y - tArm[1].y, tArm[2].x - tArm[1].x);
  // Torch first: the fingers wrap over it.
  ctx.save();
  ctx.translate(tArm[2].x + Math.cos(ang) * 1.6, tArm[2].y + Math.sin(ang) * 1.6 + 1.2);
  ctx.rotate(Math.PI * 0.62);
  torch3d(ctx, 8.5, 1.8, '255,214,64', o.newTorch);
  ctx.restore();
  sphere(ctx, lS.x + 0.6, lS.y + 0.6, 3.6, 3.4, sleeve);
  limb3d(ctx, tArm[0], tArm[1], tArm[2], [6, 5, 4.4], sleeve, 1, forearm);
  if (jacket || o.top === 'shirt') {
    ctx.save();
    ctx.translate(tArm[2].x - Math.cos(ang) * 0.6, tArm[2].y - Math.sin(ang) * 0.6);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.roundRect(-1.2, -2.5, 2.4, 5, 1);
    ctx.fillStyle = '#F4F7FB';
    ctx.fill();
    edge(ctx, '#DCE6F2', 0.6);
    ctx.restore();
  }
  if (o.watch) {
    ctx.save();
    ctx.translate(tArm[2].x - Math.cos(ang) * 2.2, tArm[2].y - Math.sin(ang) * 2.2);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.roundRect(-1.3, -2.8, 2.6, 5.6, 1);
    ctx.fillStyle = bodyGradient(ctx, '#E8C060', -1.3, 1.3);
    ctx.fill();
    edge(ctx, '#E8C060', 0.6);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(tArm[2].x + Math.cos(ang) * 2.2, tArm[2].y + Math.sin(ang) * 2.2 + 0.4);
  ctx.rotate(Math.PI * 0.12);
  fist3d(ctx, skin);
  ctx.restore();
  // Light pooling under the lens.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pool = ctx.createRadialGradient(-15, -2, 0, -15, -2, 12);
  pool.addColorStop(0, 'rgba(255,230,140,0.35)');
  pool.addColorStop(1, 'rgba(255,230,140,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(-28, -14, 26, 24);
  ctx.restore();

  // ---- Free arm: waves now and then, otherwise on the hip (or holds the phone) ----
  const rS = { x: 9.2, y: ty + 2.6 };
  const cycle = t % 6;
  const waving = pose === 'wave' || (pose === 'idle' && cycle < 2.2);
  let target: P;
  let bend = 1;
  if (waving) {
    target = { x: 15.6 + Math.sin(t * 7) * 2.2, y: ty - 10 + Math.abs(Math.cos(t * 7)) * 0.8 };
  } else if (o.phone) {
    target = { x: 6, y: ty + 9 };
  } else {
    target = { x: 9.8, y: ty + 16.5 };
    bend = -1;
  }
  const fArm = ik(rS, target, 8.6, 7.6, bend);
  sphere(ctx, rS.x - 0.6, rS.y + 0.6, 3.6, 3.4, sleeve);
  limb3d(ctx, fArm[0], fArm[1], fArm[2], [6, 5, 4.4], sleeve, -1, forearm);
  const fa = Math.atan2(fArm[2].y - fArm[1].y, fArm[2].x - fArm[1].x);
  if (o.phone && !waving) {
    ctx.save();
    ctx.translate(fArm[2].x, fArm[2].y - 3);
    ctx.beginPath();
    ctx.roundRect(-3, -5.5, 6, 10, 1.6);
    ctx.fillStyle = '#17191F';
    ctx.fill();
    edge(ctx, '#3A3F4A');
    ctx.fillStyle = 'rgba(140,200,255,0.95)';
    ctx.fillRect(-2, -4.4, 4, 7.6);
    spec(ctx, -1, -3, 1.4, 0.8, 0.5);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(fArm[2].x + Math.cos(fa) * 1.2, fArm[2].y + Math.sin(fa) * 1.2);
  ctx.rotate(fa);
  hand3d(ctx, skin, waving);
  ctx.restore();

  // ---- Neck and head ----
  const hy = -53 + breathe * 1.1;
  limb3d(ctx, { x: 0, y: ty - 0.5 }, { x: 0, y: (ty + hy) / 2 + 3 }, { x: 0, y: hy + 9 }, [5.6, 5.4, 5.2], skin, 1);
  ctx.fillStyle = 'rgba(120,50,30,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, hy + 9.4, 3.4, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(0, hy);
  ctx.rotate(Math.sin(t * 1.3) * 0.03);
  sphere(ctx, 0, -2, 12.4, 11.6, HAIR);
  for (const s of [-1, 1]) {
    sphere(ctx, s * 11.2, 1.4, 2.5, 3.2, skin);
    ctx.strokeStyle = tone(skin, -0.4);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(s * 11.2, 1.4, 1.2, s > 0 ? -1.3 : Math.PI - 1.3, s > 0 ? 1.3 : Math.PI + 1.3);
    ctx.stroke();
  }
  // Face with warm subsurface tones.
  ctx.beginPath();
  ctx.moveTo(-10.7, -1);
  ctx.bezierCurveTo(-10.9, -11.2, 10.9, -11.2, 10.7, -1);
  ctx.bezierCurveTo(10.5, 6.2, 6.5, 11, 0, 11);
  ctx.bezierCurveTo(-6.5, 11, -10.5, 6.2, -10.7, -1);
  ctx.closePath();
  const fg = ctx.createRadialGradient(-3.6, -4.5, 1, 0, 0, 14);
  fg.addColorStop(0, tone(skin, 0.4));
  fg.addColorStop(0.45, skin);
  fg.addColorStop(0.85, tone(skin, -0.12));
  fg.addColorStop(1, tone(skin, -0.24));
  ctx.fillStyle = fg;
  ctx.fill();
  edge(ctx, skin);
  for (const s of [-1, 1]) {
    const b = ctx.createRadialGradient(s * 6.6, 4.4, 0, s * 6.6, 4.4, 3);
    b.addColorStop(0, 'rgba(235,110,100,0.38)');
    b.addColorStop(1, 'rgba(235,110,100,0)');
    ctx.fillStyle = b;
    ctx.fillRect(s * 6.6 - 3, 1.4, 6, 6);
  }
  // Glossy eyes with a top-lid shadow and blinking lids.
  const blink = blinkAt(t);
  for (const s of [-1, 1]) {
    const cx = s * 4.5;
    const cy = -1;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 2.7, 3.1, 0, 0, Math.PI * 2);
    const w = ctx.createLinearGradient(0, cy - 3.1, 0, cy + 3.1);
    w.addColorStop(0, '#D6DAE3');
    w.addColorStop(0.35, '#FFFFFF');
    w.addColorStop(1, '#F1F3F7');
    ctx.fillStyle = w;
    ctx.fill();
    ctx.clip();
    const ir = ctx.createRadialGradient(cx + 0.2, cy, 0.2, cx + 0.2, cy, 2);
    ir.addColorStop(0, '#7A4E2E');
    ir.addColorStop(1, '#3A2416');
    ctx.fillStyle = ir;
    ctx.beginPath();
    ctx.arc(cx + 0.3, cy + 0.2, 1.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#120C0A';
    ctx.beginPath();
    ctx.arc(cx + 0.3, cy + 0.2, 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx + 0.95, cy - 0.7, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 0.4, cy + 1, 0.3, 0, Math.PI * 2);
    ctx.fill();
    if (blink > 0) {
      ctx.fillStyle = tone(skin, -0.05);
      ctx.fillRect(cx - 3.2, cy - 3.4, 6.4, 6.4 * blink + 0.3);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 2.7, 3.1, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#3A2A26';
    ctx.lineWidth = 0.85;
    ctx.stroke();
    ctx.strokeStyle = '#3A2416';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    const by = face === 'grin' ? -5.9 : -5.4;
    ctx.moveTo(cx - 2.6, by);
    ctx.quadraticCurveTo(cx, by - 1.3, cx + 2.6, by - 0.1);
    ctx.stroke();
  }
  sphere(ctx, 0, 2.6, 1.7, 1.3, tone(skin, -0.05));
  spec(ctx, -0.5, 2.1, 0.7, 0.4, 0.55);
  // Mouth with depth.
  if (face === 'grin') {
    ctx.beginPath();
    ctx.moveTo(-3.3, 5.3);
    ctx.quadraticCurveTo(0, 6.1, 3.3, 5.3);
    ctx.quadraticCurveTo(0, 9.2, -3.3, 5.3);
    ctx.closePath();
    const mg = ctx.createLinearGradient(0, 5.3, 0, 8.6);
    mg.addColorStop(0, '#4A1E1A');
    mg.addColorStop(1, '#7A2E28');
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-2.4, 5.6);
    ctx.quadraticCurveTo(0, 6.3, 2.4, 5.6);
    ctx.lineTo(2.1, 6.4);
    ctx.quadraticCurveTo(0, 6.9, -2.1, 6.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#E8726E';
    ctx.beginPath();
    ctx.ellipse(0, 7.8, 1.6, 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#6A2A22';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-3, 5.3);
    ctx.quadraticCurveTo(0, 7.4, 3, 5.3);
    ctx.stroke();
  }

  // Head-worn items.
  if (o.luxury && !o.suit) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(s * 4.5 - 3.3, -3.6, 6.6, 4.4, 1.9);
      ctx.fillStyle = '#121214';
      ctx.fill();
      spec(ctx, s * 4.5 - 1.2, -2.4, 1.6, 0.6, 0.55);
    }
    ctx.fillStyle = '#121214';
    ctx.fillRect(-1.4, -2.4, 2.8, 0.9);
  }
  if (o.cap && !o.suit) {
    ctx.beginPath();
    ctx.moveTo(-12.6, -1.4);
    ctx.bezierCurveTo(-13.6, -18, 13.6, -18, 12.6, -1.4);
    ctx.quadraticCurveTo(0, -6, -12.6, -1.4);
    ctx.closePath();
    const cg = ctx.createRadialGradient(-4, -12, 1, 0, -6, 15);
    cg.addColorStop(0, '#FF5A6E');
    cg.addColorStop(0.45, '#C8263C');
    cg.addColorStop(1, '#7A0F20');
    ctx.fillStyle = cg;
    ctx.fill();
    edge(ctx, '#C8263C');
    ctx.strokeStyle = 'rgba(80,8,20,0.5)';
    ctx.lineWidth = 0.6;
    for (const x of [-5, 0, 5]) {
      ctx.beginPath();
      ctx.moveTo(x * 0.3, -15.6);
      ctx.quadraticCurveTo(x, -10, x * 1.5, -4.6);
      ctx.stroke();
    }
    spec(ctx, -5, -12, 4, 1.6, 0.5);
    ctx.fillStyle = '#9E1B2E';
    ctx.beginPath();
    ctx.moveTo(-5, -4.6);
    ctx.quadraticCurveTo(0, -6.2, 5, -4.6);
    ctx.lineTo(4.6, -2.8);
    ctx.quadraticCurveTo(0, -4.2, -4.6, -2.8);
    ctx.closePath();
    ctx.fill();
    sphere(ctx, 0, -15.7, 1.4, 1.1, '#F2F2F2');
  } else if (!o.suit) {
    ctx.beginPath();
    ctx.moveTo(-11.4, -1);
    ctx.bezierCurveTo(-12.6, -13, 10, -16, 11.6, -2.4);
    ctx.quadraticCurveTo(7, -7.6, 2, -6.8);
    ctx.quadraticCurveTo(0.6, -8.6, -2.4, -7.6);
    ctx.quadraticCurveTo(-7, -6.8, -9, -3);
    ctx.closePath();
    const hg = ctx.createLinearGradient(-8, -14, 6, -4);
    hg.addColorStop(0, '#6A4A38');
    hg.addColorStop(1, '#2E2019');
    ctx.fillStyle = hg;
    ctx.fill();
    edge(ctx, HAIR);
    ctx.strokeStyle = 'rgba(255,220,190,0.22)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-7 + i * 3, -12 + i * 0.4);
      ctx.quadraticCurveTo(-5 + i * 3, -9, -4.5 + i * 3, -7.2);
      ctx.stroke();
    }
  }
  if (o.suit) {
    ctx.beginPath();
    ctx.arc(0, -1, 15.5, 0, Math.PI * 2);
    const hg = ctx.createRadialGradient(-6, -8, 2, 0, -1, 16);
    hg.addColorStop(0, 'rgba(220,240,255,0.32)');
    hg.addColorStop(1, 'rgba(160,210,255,0.1)');
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,235,255,0.95)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    spec(ctx, -6, -8, 4, 2.4, 0.6);
  }
  ctx.restore();
}
