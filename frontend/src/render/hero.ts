// The hero, drawn with smooth two-segment limbs, outlines, soft shading and secondary motion.
// Origin is at the feet; negative y goes up. Outfit is chosen by wealth tier (design doc, section 4).
// No filters or shadowBlur: shading is done with gradients.

export type Face = 'normal' | 'grin' | 'scared' | 'squint';
export type Gesture = 'none' | 'scratch' | 'pocket' | 'tie' | 'wave';

export interface Outfit {
  feet: 'bare' | 'slippers' | 'shoes';
  legs: 'shorts' | 'sweats' | 'trousers';
  top: 'tank' | 'shirt' | 'jacket';
  watch: boolean;
  newTorch: boolean;
  tie: boolean;
  phone: boolean;
  luxury: boolean;
  suit: boolean;
}

export interface HeroPose {
  tier: number;
  /** Flashlight color as "r,g,b". */
  light: string;
  neutral: boolean;
  /** Seconds since landing (squash) and vertical speed (tuck, arm swing). */
  sinceLand: number;
  vy: number;
  /** Horizontal velocity, used for the walk cycle. */
  vx?: number;
  time: number;
  face?: Face;
  gesture?: Gesture;
  /** Pieces picked up early on platforms, worn on top of the tier outfit. */
  extra?: Partial<Outfit>;
  /** Skip the flashlight beam (drawn separately by the renderer). */
  noBeam?: boolean;
}

export function outfitFor(tier: number): Outfit {
  return {
    feet: tier >= 9 ? 'shoes' : tier >= 1 ? 'slippers' : 'bare',
    legs: tier >= 4 ? 'trousers' : tier >= 2 ? 'sweats' : 'shorts',
    top: tier >= 5 ? 'jacket' : tier >= 3 ? 'shirt' : 'tank',
    watch: tier >= 6,
    newTorch: tier >= 7,
    tie: tier >= 8,
    phone: tier >= 10,
    luxury: tier >= 11,
    suit: tier >= 12,
  };
}

const SKIN = '#EDB98F';
const SKIN_SHADE = '#CF9670';
const HAIR = '#3A2A22';
const LINE = 'rgba(28,20,24,0.85)';

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

/** One smooth tapered segment with rounded ends. */
function seg(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, wa: number, wb: number, color: string): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ra = wa / 2;
  const rb = wb / 2;
  const a0 = Math.atan2(ny, nx);
  const a1 = a0 + Math.PI;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ax + nx * ra, ay + ny * ra);
  ctx.lineTo(bx + nx * rb, by + ny * rb);
  ctx.arc(bx, by, rb, a0, a1);
  ctx.lineTo(ax - nx * ra, ay - ny * ra);
  ctx.arc(ax, ay, ra, a1, a0);
  ctx.closePath();
  ctx.fill();

  // Very restrained highlight keeps the forms readable without making them glossy.
  if (len > 3) {
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(0.6, Math.min(1.1, wa * 0.12));
    ctx.beginPath();
    ctx.moveTo(ax + nx * ra * 0.55, ay + ny * ra * 0.55);
    ctx.lineTo(bx + nx * rb * 0.55, by + ny * rb * 0.55);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** A tapered two-segment limb with a clean outline: shoulder/hip -> elbow/knee -> wrist/ankle. */
function limb(
  ctx: CanvasRenderingContext2D,
  p: [number, number, number, number, number, number],
  w: [number, number, number],
  upper: string,
  lower: string,
): void {
  const o = 2.4;
  seg(ctx, p[0], p[1], p[2], p[3], w[0] + o, w[1] + o, LINE);
  seg(ctx, p[2], p[3], p[4], p[5], w[1] + o, w[2] + o, LINE);
  seg(ctx, p[2], p[3], p[4], p[5], w[1], w[2], lower);
  seg(ctx, p[0], p[1], p[2], p[3], w[0], w[1], upper);
}

/**
 * Two-bone IK: an arm from the shoulder to a target hand position.
 * `bend` picks the side the elbow points to (+1 / -1).
 */
function reach(sx: number, sy: number, tx: number, ty: number, l1: number, l2: number, bend: number): [number, number, number, number, number, number] {
  const dx = tx - sx;
  const dy = ty - sy;
  const d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, Math.hypot(dx, dy)));
  const base = Math.atan2(dy, dx);
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const ea = base + a * bend;
  const ex = sx + Math.cos(ea) * l1;
  const ey = sy + Math.sin(ea) * l1;
  return [sx, sy, ex, ey, sx + Math.cos(base) * d, sy + Math.sin(base) * d];
}

/** Points of a two-segment limb from angles (radians, 0 = straight down, positive = forward). */
function chain(x: number, y: number, a1: number, l1: number, a2: number, l2: number): [number, number, number, number, number, number] {
  const x1 = x + Math.sin(a1) * l1;
  const y1 = y + Math.cos(a1) * l1;
  const x2 = x1 + Math.sin(a1 + a2) * l2;
  const y2 = y1 + Math.cos(a1 + a2) * l2;
  return [x, y, x1, y1, x2, y2];
}

function hand(ctx: CanvasRenderingContext2D, p: [number, number, number, number, number, number], skin: string): void {
  const a = Math.atan2(p[5] - p[3], p[4] - p[2]);
  const hx = p[4] + Math.cos(a) * 1.8;
  const hy = p[5] + Math.sin(a) * 1.8;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a);
  ctx.fillStyle = skin;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.45, 2.75, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,75,55,0.42)';
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.moveTo(0.2, -1.5);
  ctx.lineTo(2.1, -0.9);
  ctx.moveTo(0.6, 1.1);
  ctx.lineTo(2.2, 0.7);
  ctx.stroke();
  ctx.restore();
}

function torsoPath(ctx: CanvasRenderingContext2D, ty: number): void {
  ctx.beginPath();
  ctx.moveTo(-8.8, ty + 3);
  ctx.quadraticCurveTo(-9.2, ty, -6, ty - 0.8);
  ctx.quadraticCurveTo(-3.2, ty - 2.4, 0, ty - 1.8);
  ctx.quadraticCurveTo(3.2, ty - 2.4, 6, ty - 0.8);
  ctx.quadraticCurveTo(9.2, ty, 8.8, ty + 3);
  ctx.quadraticCurveTo(9.4, ty + 12, 7.2, ty + 21);
  ctx.quadraticCurveTo(0, ty + 23.2, -7.2, ty + 21);
  ctx.quadraticCurveTo(-9.4, ty + 12, -8.8, ty + 3);
  ctx.closePath();
}

function fillShaded(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fill();
  const g = ctx.createLinearGradient(-9, 0, 9, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.18)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.0)');
  g.addColorStop(1, 'rgba(255,255,255,0.18)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

export function drawHeroBody(ctx: CanvasRenderingContext2D, pose: HeroPose): void {
  const o: Outfit = { ...outfitFor(pose.tier), ...(pose.extra ?? {}) };
  const t = pose.time;
  const breathe = Math.sin(t * 3.2) * 0.5;
  const speed = Math.min(1, Math.abs(pose.vx ?? 0) / 220);
  const walking = speed > 0.08 && Math.abs(pose.vy) < 90;
  const walk = walking ? Math.sin(t * (8 + speed * 4)) * speed : 0;
  const rising = Math.max(-1, Math.min(1, pose.vy / 700));
  const land = Math.exp(-pose.sinceLand * 14);
  // Wealth makes the gait composed: flailing in the yard, poised in the palace.
  const poise = Math.min(1, pose.tier / 8);
  const flail = (1 - poise) * Math.sin(t * 11) * 0.18;
  const tuck = Math.max(0, rising) * 0.65 + land * 0.4;

  const jacket = o.top === 'jacket';
  const jacketC = o.luxury ? '#191B24' : '#22305A';
  const skin = o.suit ? '#E9EEF5' : SKIN;
  const sleeve = o.suit ? '#E9EEF5' : jacket ? jacketC : o.top === 'shirt' ? '#BCD5EE' : SKIN;
  const pants = o.suit ? '#E9EEF5' : o.legs === 'trousers' ? (o.luxury ? '#16171E' : '#2C3140') : o.legs === 'sweats' ? '#6B7280' : '#46608A';
  const shin = o.legs === 'shorts' && !o.suit ? SKIN : pants;
  const shoulderY = -38 + breathe;

  // ---- Flashlight beam (only when the renderer does not draw its own) ----
  if (!pose.noBeam) {
    ctx.globalAlpha = pose.neutral ? 0.16 : 0.4;
    const beam = ctx.createLinearGradient(28, -22, 80, 30);
    beam.addColorStop(0, `rgba(${pose.light},0.95)`);
    beam.addColorStop(1, `rgba(${pose.light},0)`);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(28, -22);
    ctx.lineTo(84, 10);
    ctx.lineTo(44, 40);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- Arms are placed by target hand positions (IK), so every gesture stays natural ----
  const gesture = pose.gesture ?? (o.phone ? 'none' : poise >= 1 ? 'pocket' : 'none');
  const backShoulder: [number, number] = [-4.5, shoulderY + 1.5];
  const frontShoulder: [number, number] = [5, shoulderY + 1.5];
  let otherTarget: [number, number];
  let otherBend = -1;
  let otherLayer: 'behind' | 'chest' | 'head' = 'behind';
  if (gesture === 'pocket') {
    otherTarget = [-3, -25];
    otherBend = 1;
  } else if (gesture === 'scratch') {
    otherTarget = [-5 + Math.sin(t * 10) * 0.8, -58 + breathe];
    otherBend = 1;
    otherLayer = 'head';
  } else if (gesture === 'tie') {
    otherTarget = [1.5, -37 + Math.sin(t * 4) * 0.6 + breathe];
    otherBend = 1;
    otherLayer = 'chest';
  } else {
    // Natural swing: forward-up on the jump, loose and flailing in poor tiers.
    const swing = -0.2 - rising * 0.9 * (1 - poise * 0.6) + flail + walk * 0.55;
    otherTarget = [backShoulder[0] + Math.sin(swing) * 15, backShoulder[1] + Math.cos(swing) * 15];
  }
  const other = reach(backShoulder[0], backShoulder[1], otherTarget[0], otherTarget[1], 8.5, 7.8, otherBend);
  const drawOtherArm = (): void => {
    limb(ctx, other, [6, 5, 4.4], sleeve, o.top === 'tank' && !o.suit ? SKIN : sleeve);
    if (gesture === 'pocket') return;
    hand(ctx, other, skin);
    if (o.phone && gesture === 'none') {
      ctx.save();
      ctx.translate(other[4], other[5]);
      ctx.rotate(0.2);
      ctx.fillStyle = '#16181F';
      rr(ctx, -2.5, -1, 6, 10, 1.6);
      ctx.fill();
      ctx.fillStyle = 'rgba(140,200,255,0.95)';
      ctx.fillRect(-1.5, 0.4, 4, 7);
      ctx.restore();
    }
  };
  if (otherLayer === 'behind') drawOtherArm();

  // ---- Legs: almost straight when standing, knees tuck up on the jump ----
  for (const side of [-1, 1]) {
    const phase = side === 1 ? walk : -walk;
    const k = side === 1
      ? 0.08 + tuck * 0.85 + phase * 0.42
      : -0.06 + tuck * 0.6 + phase * 0.42;
    const leg = chain(side * 3.6, -21, k, 10, -k * 1.5 + phase * 0.12, 9.5);
    leg[5] = Math.min(leg[5], -2.2);
    limb(ctx, leg, [8, 6.6, 5.6], pants, shin);
    ctx.save();
    ctx.translate(leg[4], leg[5] + 0.8);
    if (o.feet === 'bare') {
      ctx.fillStyle = SKIN_SHADE;
      rr(ctx, -3, -2, 9, 4, 2);
    } else if (o.feet === 'slippers') {
      ctx.fillStyle = '#3B82F6';
      rr(ctx, -3.5, -1.2, 11, 3.4, 1.6);
    } else {
      ctx.fillStyle = o.suit ? '#C9D2DD' : '#17181D';
      rr(ctx, -3.5, -3.2, 11.5, 5.4, 2.4);
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = o.suit ? '#AEB9C8' : '#F1F2F4';
      rr(ctx, -2.8, -0.8, 9.2, 1.3, 0.55);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(0, -2.1);
      ctx.lineTo(2.8, -2.1);
      ctx.moveTo(0.8, -1.1);
      ctx.lineTo(3.2, -1.1);
      ctx.stroke();
    }
    if (o.feet !== 'shoes') {
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    if (o.feet === 'shoes' && !o.suit) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(2, -2.4, 4, 1);
    }
    ctx.restore();
  }

  // ---- Torso ----
  const ty = -42 + breathe;
  const torsoC = o.suit ? '#E9EEF5' : jacket ? jacketC : o.top === 'shirt' ? '#CFE3F5' : '#EEE8DA';
  torsoPath(ctx, ty);
  fillShaded(ctx, torsoC);
  if (o.top === 'tank' && !o.suit) {
    // Skin shows at the neck scoop and outside the straps.
    ctx.save();
    torsoPath(ctx, ty);
    ctx.clip();
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.moveTo(-4, ty - 1);
    ctx.quadraticCurveTo(0, ty + 8, 4, ty - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-10, ty - 1, 3.5, 7);
    ctx.fillRect(6.5, ty - 1, 3.5, 7);
    ctx.restore();
    ctx.strokeStyle = 'rgba(28,20,24,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, ty);
    ctx.quadraticCurveTo(0, ty + 7.5, 4, ty);
    ctx.stroke();
  }
  if (o.top === 'shirt' && !o.suit) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(28,20,24,0.5)';
    ctx.lineWidth = 0.9;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, ty + 4.5);
      ctx.lineTo(sx * 5, ty - 0.5);
      ctx.lineTo(sx * 2, ty - 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,60,90,0.5)';
    for (let i = 0; i < 3; i++) ctx.fillRect(-0.6, ty + 8 + i * 4.3, 1.2, 1.2);
  }
  if (jacket && !o.suit) {
    ctx.fillStyle = '#F7F7F7';
    ctx.beginPath();
    ctx.moveTo(-4, ty);
    ctx.lineTo(0, ty + 12);
    ctx.lineTo(4, ty);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = o.luxury ? '#E8C060' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-5, ty + 0.5);
    ctx.lineTo(-0.6, ty + 12.5);
    ctx.lineTo(-3, ty + 20);
    ctx.moveTo(5, ty + 0.5);
    ctx.lineTo(0.6, ty + 12.5);
    ctx.stroke();
    ctx.fillStyle = o.luxury ? '#E8C060' : '#C9CED8';
    ctx.beginPath();
    ctx.arc(1.5, ty + 15, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.tie && !o.suit) {
    const sway = Math.sin(t * 6) * 0.05 + rising * 0.1;
    ctx.save();
    ctx.translate(0, ty + 1.5);
    ctx.rotate(sway);
    ctx.fillStyle = o.luxury ? '#E8C060' : '#C8263C';
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-1.6, 0);
    ctx.lineTo(1.6, 0);
    ctx.lineTo(2.4, 10.5);
    ctx.lineTo(0, 13.5);
    ctx.lineTo(-2.4, 10.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (o.suit) {
    ctx.fillStyle = '#F08A24';
    rr(ctx, -7, ty + 8, 5, 3, 1);
    ctx.fill();
    ctx.fillStyle = '#5AA8FF';
    rr(ctx, 3.5, ty + 6, 4, 4, 1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,130,150,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, ty + 15);
    ctx.lineTo(8, ty + 15);
    ctx.stroke();
  }

  if (otherLayer === 'chest') drawOtherArm();

  // ---- Head ----
  const hy = -54 + breathe * 1.15;
  const headTilt = Math.max(-0.035, Math.min(0.035, -rising * 0.02));
  ctx.save();
  ctx.rotate(headTilt);

  // Neck first, so the head grows naturally out of the torso.
  ctx.fillStyle = SKIN;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.15;
  rr(ctx, -3.1, hy + 7.5, 6.2, 6.2, 1.9);
  ctx.fill();
  ctx.stroke();

  // Main head shape: slightly wider and less perfectly oval than the old version.
  ctx.beginPath();
  ctx.moveTo(-8.7, hy + 2.8);
  ctx.quadraticCurveTo(-9.3, hy - 5.5, -3.8, hy - 9.4);
  ctx.quadraticCurveTo(1.8, hy - 13.2, 7.2, hy - 8.8);
  ctx.quadraticCurveTo(11, hy - 5.2, 10.2, hy + 2.5);
  ctx.quadraticCurveTo(9.5, hy + 8.8, 3.6, hy + 10.1);
  ctx.quadraticCurveTo(-3.4, hy + 10.7, -7.3, hy + 6.5);
  ctx.quadraticCurveTo(-9, hy + 4.8, -8.7, hy + 2.8);
  ctx.closePath();
  ctx.fillStyle = SKIN;
  ctx.fill();
  const hs = ctx.createLinearGradient(-9, hy, 11, hy);
  hs.addColorStop(0, 'rgba(160,90,60,0.22)');
  hs.addColorStop(0.48, 'rgba(255,255,255,0)');
  hs.addColorStop(1, 'rgba(255,255,255,0.08)');
  ctx.fillStyle = hs;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // Ear.
  ctx.beginPath();
  ctx.ellipse(-7.9, hy + 2.2, 1.8, 2.7, -0.12, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 0.85;
  ctx.stroke();
  ctx.strokeStyle = SKIN_SHADE;
  ctx.beginPath();
  ctx.arc(-7.8, hy + 2.1, 0.95, -1.25, 1.15);
  ctx.stroke();

  // Hair mass with a deliberately simple silhouette.
  const tuft = -rising * 2 + Math.sin(t * 4.5) * 0.35;
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-8.9, hy + 2.4);
  ctx.quadraticCurveTo(-10.2, hy - 7.8, -3.8, hy - 11.1);
  ctx.quadraticCurveTo(1.4, hy - 14.3, 6.5, hy - 10.3);
  ctx.quadraticCurveTo(10.1, hy - 7.4, 10.1, hy - 2.2);
  ctx.quadraticCurveTo(7.2, hy - 5.2, 3.8, hy - 4.4);
  ctx.quadraticCurveTo(-1.1, hy - 5.8, -4.8, hy + 0.9);
  ctx.quadraticCurveTo(-6.7, hy + 3.8, -8.9, hy + 2.4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.8, hy - 10.5);
  ctx.quadraticCurveTo(-2.1, hy - 14.4 + tuft, 2.8 + tuft, hy - 14.7 + tuft);
  ctx.quadraticCurveTo(2.2, hy - 11.3, 3.8, hy - 10.2);
  ctx.fill();

  // Face: readable three-quarter view instead of a single-eye profile.
  const face = pose.face ?? 'normal';
  const blink = face === 'normal' && t % 3.7 < 0.12;
  const eyeY = hy - 0.8;
  const eyeXs = [1.9, 6.9];
  const eyeScale = face === 'scared' ? 1.18 : 1;
  if (o.luxury && !o.suit && face !== 'scared') {
    ctx.fillStyle = '#111';
    rr(ctx, 0.2, eyeY - 2.7, 9.1, 4.3, 1.7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(1.5, eyeY - 1.9, 2.4, 0.8);
  } else if (face === 'squint' || blink) {
    ctx.strokeStyle = '#1D1A24';
    ctx.lineWidth = 1.25;
    for (const ex of eyeXs) {
      ctx.beginPath();
      ctx.moveTo(ex - 1.5, eyeY + 0.3);
      ctx.quadraticCurveTo(ex, eyeY + 1.1, ex + 1.5, eyeY + 0.3);
      ctx.stroke();
    }
  } else {
    for (const ex of eyeXs) {
      const r = (face === 'scared' ? 2.55 : 2.05) * eyeScale;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, r, r * 1.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(28,20,24,0.5)';
      ctx.lineWidth = 0.75;
      ctx.stroke();
      ctx.fillStyle = '#1D1A24';
      ctx.beginPath();
      ctx.arc(ex + 0.45, eyeY - rising * 0.35, face === 'scared' ? 1.05 : 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(ex + 0.75, eyeY - 1.05 - rising * 0.35, 0.65, 0.65);
    }
  }

  // Brows make the face readable even when scaled down.
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (face === 'scared') {
    ctx.moveTo(0.5, eyeY - 3.7); ctx.lineTo(3.1, eyeY - 4.5);
    ctx.moveTo(5.8, eyeY - 4.4); ctx.lineTo(8.3, eyeY - 3.7);
  } else if (face === 'grin') {
    ctx.moveTo(0.6, eyeY - 3.5); ctx.lineTo(3.1, eyeY - 3.1);
    ctx.moveTo(5.8, eyeY - 3.1); ctx.lineTo(8.4, eyeY - 3.5);
  } else {
    ctx.moveTo(0.7, eyeY - 3.8); ctx.lineTo(3.1, eyeY - 3.8);
    ctx.moveTo(5.8, eyeY - 3.8); ctx.lineTo(8.2, eyeY - 3.8);
  }
  ctx.stroke();

  // Tiny nose and mouth.
  ctx.strokeStyle = SKIN_SHADE;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(4.5, hy + 1.2);
  ctx.quadraticCurveTo(5.1, hy + 2.5, 4.3, hy + 3);
  ctx.stroke();
  ctx.strokeStyle = '#6E2E24';
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  if (face === 'scared') {
    ctx.ellipse(4.6, hy + 6.1, 1.25, 1.65, 0, 0, Math.PI * 2);
  } else if (face === 'grin') {
    ctx.arc(4.9, hy + 5.2, 2.5, 0.15, Math.PI * 0.9);
  } else {
    ctx.arc(4.8, hy + 5.3, 1.45, 0.15, Math.PI * 0.78);
  }
  ctx.stroke();

  // Wearable face/head equipment follows the animated head rather than floating at a fixed world point.
  if (o.luxury && !o.suit) {
    ctx.strokeStyle = '#17181D';
    ctx.lineWidth = 1.05;
    ctx.fillStyle = 'rgba(170,215,255,0.16)';
    for (const ex of [1.9, 6.9]) {
      ctx.beginPath();
      rr(ctx, ex - 2.55, eyeY - 1.75, 5.1, 3.5, 1.15);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(4.45, eyeY);
    ctx.lineTo(4.55, eyeY);
    ctx.stroke();
  }
  if (o.suit) {
    // A real helmet silhouette, with a clear visor and a small rear rim.
    ctx.save();
    ctx.fillStyle = 'rgba(215,231,245,0.92)';
    ctx.strokeStyle = '#8D9AA8';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-9.5, hy + 0.5);
    ctx.quadraticCurveTo(-8.8, hy - 12.8, 1, hy - 15.1);
    ctx.quadraticCurveTo(9.2, hy - 12.5, 10.2, hy - 1.5);
    ctx.lineTo(7.7, hy + 0.3);
    ctx.quadraticCurveTo(0, hy - 3.2, -7.8, hy + 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(95,132,168,0.28)';
    ctx.beginPath();
    ctx.moveTo(-6.8, hy - 2.1);
    ctx.quadraticCurveTo(0, hy - 7.1, 7.1, hy - 2.1);
    ctx.lineTo(6.2, hy + 0.1);
    ctx.quadraticCurveTo(0, hy - 3.3, -6.2, hy + 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  if (o.suit) {
    ctx.strokeStyle = 'rgba(220,235,255,0.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-7, -40);
    ctx.lineTo(-9, -35);
    ctx.moveTo(7, -40);
    ctx.lineTo(9, -35);
    ctx.stroke();
  }

  if (otherLayer === 'head') drawOtherArm();

  // ---- Front arm holding the flashlight (waves it in the menu) ----
  const waving = gesture === 'wave';
  const handTarget: [number, number] = waving
    ? [15 + Math.sin(t * 7) * 2.5, -49 + Math.abs(Math.cos(t * 7)) * 0.8 + breathe]
    : [19, -29 + rising * 2.5 + breathe];
  const front = reach(frontShoulder[0], frontShoulder[1], handTarget[0], handTarget[1], 8.5, 8.2, 1);
  limb(ctx, front, [6, 5, 4.4], sleeve, o.top === 'tank' && !o.suit ? SKIN : sleeve);
  if (o.watch) {
    const wa = Math.atan2(front[5] - front[3], front[4] - front[2]);
    ctx.save();
    ctx.translate(front[4], front[5]);
    ctx.rotate(wa);
    ctx.fillStyle = '#C59A3A';
    rr(ctx, -2.9, -2.2, 5.8, 2.1, 0.9);
    ctx.fill();
    ctx.fillStyle = '#E8C060';
    rr(ctx, -2.1, -1.35, 4.2, 3.1, 0.9);
    ctx.fill();
    ctx.fillStyle = '#FFF5C7';
    ctx.beginPath();
    ctx.arc(0, 0.2, 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (jacket && !o.suit) {
    // White shirt cuff.
    const a = Math.atan2(front[5] - front[3], front[4] - front[2]);
    seg(ctx, front[4] - Math.cos(a) * 1.5, front[5] - Math.sin(a) * 1.5, front[4], front[5], 4.6, 4.4, '#F4F4F4');
  }
  ctx.save();
  ctx.translate(front[4], front[5]);
  // The torch points down-forward, or up while waving.
  ctx.rotate(waving ? Math.PI * 1.1 + Math.sin(t * 7) * 0.2 : -Math.atan2(0.78, 0.62));
  ctx.fillStyle = o.newTorch ? '#D3D8E2' : '#3B3F4A';
  rr(ctx, -3, -1.5, 6, o.newTorch ? 12 : 10, 2);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  if (o.newTorch) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(-2, -0.5, 1.1, 9);
  }
  ctx.fillStyle = `rgb(${pose.light})`;
  rr(ctx, -3.8, o.newTorch ? 9.8 : 7.8, 7.6, 3, 1);
  ctx.fill();
  // Hand wrapped around the torch.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, 1, 3.4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();
}

export interface HeroAttachmentPose {
  tier: number;
  vx?: number;
  vy: number;
  time: number;
  gesture?: Gesture;
}

/**
 * Returns a live local-space attachment point for wearable/held objects.
 * The renderer uses these points while an item is flying onto the hero, so the
 * destination follows the animated body instead of being a fixed world offset.
 */
export function heroAttachment(item: Item, pose: HeroAttachmentPose): [number, number] {
  const o = outfitFor(pose.tier);
  const t = pose.time;
  const breathe = Math.sin(t * 3.2) * 0.5;
  const speed = Math.min(1, Math.abs(pose.vx ?? 0) / 220);
  const walking = speed > 0.08 && Math.abs(pose.vy) < 90;
  const walk = walking ? Math.sin(t * (8 + speed * 4)) * speed : 0;
  const rising = Math.max(-1, Math.min(1, pose.vy / 700));
  const poise = Math.min(1, pose.tier / 8);
  const flail = (1 - poise) * Math.sin(t * 11) * 0.18;
  const tuck = Math.max(0, rising) * 0.65;
  const shoulderY = -38 + breathe;
  const backShoulder: [number, number] = [-4.5, shoulderY + 1.5];
  const frontShoulder: [number, number] = [5, shoulderY + 1.5];
  const gesture = pose.gesture ?? (o.phone ? 'none' : poise >= 1 ? 'pocket' : 'none');

  let otherTarget: [number, number];
  let otherBend = -1;
  if (gesture === 'pocket') {
    otherTarget = [-3, -25]; otherBend = 1;
  } else if (gesture === 'scratch') {
    otherTarget = [-5 + Math.sin(t * 10) * 0.8, -58 + breathe]; otherBend = 1;
  } else if (gesture === 'tie') {
    otherTarget = [1.5, -37 + Math.sin(t * 4) * 0.6 + breathe]; otherBend = 1;
  } else {
    const swing = -0.2 - rising * 0.9 * (1 - poise * 0.6) + flail + walk * 0.55;
    otherTarget = [backShoulder[0] + Math.sin(swing) * 15, backShoulder[1] + Math.cos(swing) * 15];
  }
  const other = reach(backShoulder[0], backShoulder[1], otherTarget[0], otherTarget[1], 8.5, 7.8, otherBend);
  const waving = gesture === 'wave';
  const handTarget: [number, number] = waving
    ? [15 + Math.sin(t * 7) * 2.5, -49 + Math.abs(Math.cos(t * 7)) * 0.8 + breathe]
    : [19, -29 + rising * 2.5 + breathe];
  const front = reach(frontShoulder[0], frontShoulder[1], handTarget[0], handTarget[1], 8.5, 8.2, 1);

  switch (item) {
    case 'watch':
    case 'newTorch':
    case 'torch':
      return [front[4], front[5]];
    case 'phone':
      return [other[4], other[5]];
    case 'glasses':
      return [4.5, -53 + breathe * 1.15];
    case 'helmet':
      return [1, -67 + breathe * 1.15];
    case 'tie':
      return [0, -36 + breathe];
    case 'shirt':
    case 'tank':
    case 'jacket':
      return [0, -33 + breathe];
    case 'shorts':
    case 'sweats':
    case 'trousers':
      return [0, -15];
    case 'slippers':
    case 'shoes': {
      const legs: [number, number, number, number, number, number][] = [];
      for (const side of [-1, 1]) {
        const phase = side === 1 ? walk : -walk;
        const k = side === 1 ? 0.08 + tuck * 0.85 + phase * 0.42 : -0.06 + tuck * 0.6 + phase * 0.42;
        legs.push(chain(side * 3.6, -21, k, 10, -k * 1.5 + phase * 0.12, 9.5));
      }
      return [(legs[0][4] + legs[1][4]) / 2, (legs[0][5] + legs[1][5]) / 2 + 0.8];
    }
    default:
      return [0, -30];
  }
}

/** Torch lens position in hero coordinates (used for light effects). */
export const TORCH_TIP: [number, number] = [28, -22];

// ---------- Suit-up items (fly in and snap onto the hero) ----------

export type Item =
  | 'slippers' | 'shoes' | 'shorts' | 'sweats' | 'trousers' | 'tank' | 'shirt' | 'jacket'
  | 'watch' | 'torch' | 'newTorch' | 'tie' | 'phone' | 'glasses' | 'helmet';

export interface ItemChange {
  item: Item;
  /** The piece knocked off the hero when the new one snaps on. */
  replaces: Item | null;
  /** Where it attaches, in hero coordinates (feet at 0,0, up is negative). */
  anchor: [number, number];
}

/** Which pieces of clothing change between two tiers. */
export function outfitChanges(from: number, to: number): ItemChange[] {
  const a = outfitFor(from);
  const b = outfitFor(to);
  const out: ItemChange[] = [];
  if (a.feet !== b.feet && b.feet !== 'bare') out.push({ item: b.feet, replaces: a.feet === 'bare' ? null : a.feet, anchor: [0, -2] });
  if (a.legs !== b.legs) out.push({ item: b.legs, replaces: a.legs, anchor: [0, -15] });
  if (a.top !== b.top) out.push({ item: b.top, replaces: b.top === 'jacket' ? null : a.top, anchor: [0, -33] });
  if (!a.watch && b.watch) out.push({ item: 'watch', replaces: null, anchor: [13, -27] });
  if (!a.newTorch && b.newTorch) out.push({ item: 'newTorch', replaces: 'torch', anchor: [16, -22] });
  if (!a.tie && b.tie) out.push({ item: 'tie', replaces: null, anchor: [0, -36] });
  if (!a.phone && b.phone) out.push({ item: 'phone', replaces: null, anchor: [-14, -26] });
  if (!a.luxury && b.luxury) out.push({ item: 'glasses', replaces: null, anchor: [4.5, -53] });
  if (!a.suit && b.suit) out.push({ item: 'helmet', replaces: null, anchor: [1, -64] });
  return out;
}

/** Draws a single clothing item centered at 0,0 (same scale as the hero). */
export function drawItem(ctx: CanvasRenderingContext2D, item: Item): void {
  switch (item) {
    case 'slippers':
    case 'shoes': {
      const c = item === 'shoes' ? '#121212' : '#3B82F6';
      rr(ctx, -12, -2, 11, item === 'shoes' ? 5 : 3.5, 2, );
      ctx.fillStyle = c;
      ctx.fill();
      rr(ctx, 2, -2, 11, item === 'shoes' ? 5 : 3.5, 2);
      ctx.fill();
      break;
    }
    case 'shorts':
    case 'sweats':
    case 'trousers': {
      ctx.fillStyle = item === 'shorts' ? '#46608A' : item === 'sweats' ? '#6B7280' : '#2B2F3A';
      rr(ctx, -12, -10, 24, 9, 4);
      ctx.fill();
      const len = item === 'shorts' ? 8 : 17;
      rr(ctx, -10, -3, 7, len, 3);
      ctx.fill();
      rr(ctx, 3, -3, 7, len, 3);
      ctx.fill();
      break;
    }
    case 'tank':
    case 'shirt':
    case 'jacket': {
      ctx.fillStyle = item === 'tank' ? '#E9E4D6' : item === 'shirt' ? '#CFE3F5' : '#1F2A44';
      rr(ctx, -12, -10, 24, 21, 7);
      ctx.fill();
      if (item === 'jacket') {
        ctx.fillStyle = '#F4F4F4';
        ctx.beginPath();
        ctx.moveTo(-5, -10);
        ctx.lineTo(0, 3);
        ctx.lineTo(5, -10);
        ctx.fill();
      }
      break;
    }
    case 'watch':
      ctx.fillStyle = '#E8C060';
      rr(ctx, -4, -2, 8, 4, 2);
      ctx.fill();
      ctx.fillStyle = '#fff6d0';
      ctx.beginPath();
      ctx.arc(0, 0, 1.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'torch':
    case 'newTorch':
      ctx.fillStyle = item === 'newTorch' ? '#C7CCD6' : '#3B3F4A';
      rr(ctx, -4, -6, 8, item === 'newTorch' ? 12 : 10, 2);
      ctx.fill();
      ctx.fillStyle = '#FFE58A';
      ctx.fillRect(-4, 5, 8, 3);
      break;
    case 'tie':
      ctx.fillStyle = '#C0283A';
      ctx.beginPath();
      ctx.moveTo(-2, -7);
      ctx.lineTo(2, -7);
      ctx.lineTo(2.6, 4);
      ctx.lineTo(0, 7);
      ctx.lineTo(-2.6, 4);
      ctx.closePath();
      ctx.fill();
      break;
    case 'phone':
      ctx.fillStyle = '#16181f';
      rr(ctx, -3.5, -5.5, 7, 11, 1.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(140,200,255,0.9)';
      ctx.fillRect(-2.3, -4, 4.6, 7);
      break;
    case 'glasses':
      ctx.strokeStyle = '#17181D';
      ctx.lineWidth = 1.1;
      ctx.fillStyle = 'rgba(170,215,255,0.16)';
      for (const x of [-3, 3]) {
        ctx.beginPath();
        rr(ctx, x - 2.6, -1.8, 5.2, 3.6, 1.2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-0.4, 0);
      ctx.lineTo(0.4, 0);
      ctx.stroke();
      break;
    case 'helmet':
      ctx.strokeStyle = 'rgba(220,235,255,0.95)';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(160,210,255,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
  }
}

/** Items that can be picked up early on platforms, and how they change the outfit. */
export const PICKABLE: Partial<Record<Item, Partial<Outfit>>> = {
  slippers: { feet: 'slippers' },
  shoes: { feet: 'shoes' },
  sweats: { legs: 'sweats' },
  trousers: { legs: 'trousers' },
  shirt: { top: 'shirt' },
  jacket: { top: 'jacket' },
  watch: { watch: true },
  newTorch: { newTorch: true },
  tie: { tie: true },
  phone: { phone: true },
};
