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

/** A limb as two rounded segments with an outline: (x0,y0) -> joint -> (x2,y2). */
function limb(
  ctx: CanvasRenderingContext2D,
  pts: [number, number, number, number, number, number],
  width: number,
  upper: string,
  lower: string,
): void {
  const [x0, y0, x1, y1, x2, y2] = pts;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = width + 2.2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = lower;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = upper;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Joint position for a two-segment limb from angles (radians, 0 = straight down). */
function chain(x: number, y: number, a1: number, l1: number, a2: number, l2: number): [number, number, number, number, number, number] {
  const x1 = x + Math.sin(a1) * l1;
  const y1 = y + Math.cos(a1) * l1;
  const x2 = x1 + Math.sin(a1 + a2) * l2;
  const y2 = y1 + Math.cos(a1 + a2) * l2;
  return [x, y, x1, y1, x2, y2];
}

function shaded(ctx: CanvasRenderingContext2D, base: string, x0: number, x1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = base;
  return g;
}

function fillOutlined(ctx: CanvasRenderingContext2D, color: string, shadeFrom: number, shadeTo: number): void {
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = shaded(ctx, color, shadeFrom, shadeTo);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

export function drawHeroBody(ctx: CanvasRenderingContext2D, pose: HeroPose): void {
  const o: Outfit = { ...outfitFor(pose.tier), ...(pose.extra ?? {}) };
  const t = pose.time;
  const breathe = Math.sin(t * 3.2) * 0.6;
  const rising = Math.max(-1, Math.min(1, pose.vy / 700));
  const land = Math.exp(-pose.sinceLand * 14);
  // Wealth makes the gait composed: flailing in the yard, poised in the palace.
  const poise = Math.min(1, pose.tier / 8);
  const flail = (1 - poise) * Math.sin(t * 11) * 0.3;
  const tuck = Math.max(0, rising) * 0.7 + land * 0.5;

  const jacket = o.top === 'jacket';
  const jacketC = o.luxury ? '#191B24' : '#22305A';
  const sleeve = o.suit ? '#E9EEF5' : jacket ? jacketC : o.top === 'shirt' ? '#BCD5EE' : SKIN;
  const pants = o.suit ? '#E9EEF5' : o.legs === 'trousers' ? (o.luxury ? '#16171E' : '#2C3140') : o.legs === 'sweats' ? '#6B7280' : '#46608A';
  const shin = o.legs === 'shorts' && !o.suit ? SKIN : pants;

  // ---- Flashlight beam (behind the body) ----
  if (!pose.noBeam) {
    ctx.globalAlpha = pose.neutral ? 0.16 : 0.4;
    const beam = ctx.createLinearGradient(30, -24, 80, 30);
    beam.addColorStop(0, `rgba(${pose.light},0.95)`);
    beam.addColorStop(1, `rgba(${pose.light},0)`);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(30, -24);
    ctx.lineTo(86, 8);
    ctx.lineTo(46, 38);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- Back arm ----
  const gesture = pose.gesture ?? (o.phone ? 'none' : poise >= 1 ? 'pocket' : 'none');
  let a1 = 0.35 + rising * 1.1 * (1 - poise * 0.6) + flail;
  let a2 = -0.6 - tuck * 0.4;
  if (gesture === 'pocket') {
    a1 = 0.18;
    a2 = 0.5;
  } else if (gesture === 'scratch') {
    a1 = Math.PI - 0.35;
    a2 = 1.6 + Math.sin(t * 9) * 0.25;
  } else if (gesture === 'wave') {
    a1 = Math.PI - 0.45;
    a2 = -0.4 + Math.sin(t * 7) * 0.55;
  } else if (gesture === 'tie') {
    a1 = Math.PI * 0.62;
    a2 = 1.7 + Math.sin(t * 4) * 0.1;
  }
  const back = chain(-8, -38 + breathe, -a1, 8.5, -a2, 8);
  limb(ctx, back, 5.6, sleeve, gesture === 'pocket' ? sleeve : o.top === 'tank' && !o.suit ? SKIN : sleeve);
  if (gesture !== 'pocket') {
    ctx.fillStyle = o.suit ? '#E9EEF5' : SKIN;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(back[4], back[5], 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (o.phone && gesture === 'none') {
      ctx.save();
      ctx.translate(back[4], back[5]);
      ctx.fillStyle = '#16181F';
      rr(ctx, -3.5, -2, 7, 11, 1.6);
      ctx.fill();
      ctx.fillStyle = 'rgba(140,200,255,0.95)';
      ctx.fillRect(-2.4, -0.6, 4.8, 7.5);
      ctx.restore();
    }
  }

  // ---- Legs (knees tuck up on the jump) ----
  for (const side of [-1, 1]) {
    const hipX = side * 4.5;
    const kneeA = side === 1 ? 0.15 + tuck * 0.9 : -0.05 + tuck * 0.7;
    const leg = chain(hipX, -21, -kneeA, 10, kneeA * 1.6, 10);
    leg[5] = Math.min(leg[5], -2.5);
    limb(ctx, leg, 7, pants, shin);
    // Feet
    ctx.save();
    ctx.translate(leg[4], leg[5] + 1);
    if (o.feet === 'bare') {
      ctx.fillStyle = SKIN_SHADE;
      rr(ctx, -3.5, -2, 10, 4, 2);
    } else if (o.feet === 'slippers') {
      ctx.fillStyle = '#3B82F6';
      rr(ctx, -4, -1.5, 11.5, 3.5, 1.6);
    } else {
      ctx.fillStyle = o.suit ? '#C9D2DD' : '#141414';
      rr(ctx, -4, -3, 12, 5, 2.5);
    }
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    if (o.feet === 'shoes') {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(2, -2.4, 4, 1.1);
    }
    ctx.restore();
  }

  // ---- Torso ----
  const ty = -42 + breathe;
  ctx.beginPath();
  ctx.moveTo(-9.5, ty + 3);
  ctx.quadraticCurveTo(-10, ty, -6, ty);
  ctx.lineTo(6, ty);
  ctx.quadraticCurveTo(10, ty, 9.5, ty + 3);
  ctx.lineTo(8, ty + 21);
  ctx.quadraticCurveTo(0, ty + 23, -8, ty + 21);
  ctx.closePath();
  const torsoC = o.suit ? '#E9EEF5' : jacket ? jacketC : o.top === 'shirt' ? '#CFE3F5' : '#EEE8DA';
  if (o.top === 'tank' && !o.suit) {
    // Shoulders and neck show around the tank top.
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-7, ty + 1);
    ctx.lineTo(-4, ty + 1);
    ctx.quadraticCurveTo(0, ty + 7, 4, ty + 1);
    ctx.lineTo(7, ty + 1);
    ctx.lineTo(8, ty + 21);
    ctx.quadraticCurveTo(0, ty + 23, -8, ty + 21);
    ctx.closePath();
    fillOutlined(ctx, torsoC, -9, 9);
  } else {
    fillOutlined(ctx, torsoC, -9, 9);
  }
  if (o.top === 'shirt' && !o.suit) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-5, ty);
    ctx.lineTo(0, ty + 5);
    ctx.lineTo(5, ty);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(40,60,90,0.55)';
    for (let i = 0; i < 3; i++) ctx.fillRect(-0.6, ty + 8 + i * 4.5, 1.2, 1.2);
  }
  if (jacket && !o.suit) {
    // White shirt V, lapels and coattails that flare on the jump.
    ctx.fillStyle = '#F7F7F7';
    ctx.beginPath();
    ctx.moveTo(-4.5, ty);
    ctx.lineTo(0, ty + 12);
    ctx.lineTo(4.5, ty);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = o.luxury ? '#E8C060' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-5, ty + 0.5);
    ctx.lineTo(-0.5, ty + 12.5);
    ctx.moveTo(5, ty + 0.5);
    ctx.lineTo(0.5, ty + 12.5);
    ctx.stroke();
    const flare = Math.max(0, -rising) * 3 + 1;
    ctx.fillStyle = jacketC;
    ctx.beginPath();
    ctx.moveTo(-8, ty + 20);
    ctx.lineTo(-9 - flare, ty + 25);
    ctx.lineTo(-2, ty + 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.stroke();
  }
  if (o.tie && !o.suit) {
    const sway = Math.sin(t * 6) * 0.06 + rising * 0.12;
    ctx.save();
    ctx.translate(0, ty + 1);
    ctx.rotate(sway);
    ctx.fillStyle = o.luxury ? '#E8C060' : '#C8263C';
    ctx.beginPath();
    ctx.moveTo(-1.8, 0);
    ctx.lineTo(1.8, 0);
    ctx.lineTo(2.6, 11);
    ctx.lineTo(0, 14);
    ctx.lineTo(-2.6, 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  if (o.suit) {
    ctx.fillStyle = '#F08A24';
    rr(ctx, -8, ty + 8, 5, 3, 1);
    ctx.fill();
    ctx.fillStyle = '#5AA8FF';
    rr(ctx, 4, ty + 6, 4, 4, 1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,130,150,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, ty + 15);
    ctx.lineTo(8, ty + 15);
    ctx.stroke();
  }

  // ---- Front arm holding the flashlight ----
  const front = chain(8, -38 + breathe, 0.55 - rising * 0.15, 8.5, 0.75, 8);
  limb(ctx, front, 5.6, sleeve, o.top === 'tank' && !o.suit ? SKIN : sleeve);
  ctx.save();
  ctx.translate(front[4], front[5]);
  ctx.rotate(-1.1);
  if (o.watch) {
    ctx.fillStyle = '#E8C060';
    rr(ctx, -3.4, -5, 6.8, 2.6, 1);
    ctx.fill();
  }
  ctx.fillStyle = o.newTorch ? '#D3D8E2' : '#3B3F4A';
  rr(ctx, -3.2, -2, 6.4, o.newTorch ? 12 : 10, 2);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  if (o.newTorch) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(-2.2, -1, 1.2, 9);
  }
  ctx.fillStyle = `rgb(${pose.light})`;
  rr(ctx, -4, o.newTorch ? 9.5 : 7.5, 8, 3, 1);
  ctx.fill();
  ctx.fillStyle = o.suit ? '#E9EEF5' : SKIN;
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.stroke();
  ctx.restore();

  // ---- Head ----
  const hy = -53 + breathe * 1.2;
  ctx.fillStyle = SKIN;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.3;
  ctx.fillRect(-2.5, hy + 7, 5, 5); // neck
  // Ear
  ctx.beginPath();
  ctx.arc(-3.5, hy + 1, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = SKIN_SHADE;
  ctx.fill();
  ctx.stroke();
  // Head with a soft shade on the back
  ctx.beginPath();
  ctx.ellipse(1, hy, 10, 10.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = SKIN;
  ctx.fill();
  const hs = ctx.createLinearGradient(-9, 0, 11, 0);
  hs.addColorStop(0, 'rgba(160,90,60,0.25)');
  hs.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = hs;
  ctx.fill();
  ctx.stroke();
  // Hair with a tuft that lags behind the motion
  const tuft = -rising * 2.2 + Math.sin(t * 5) * 0.6;
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-9, hy + 1);
  ctx.quadraticCurveTo(-10, hy - 11, 2, hy - 11);
  ctx.quadraticCurveTo(10, hy - 11, 10.5, hy - 3);
  ctx.quadraticCurveTo(5, hy - 6, -1, hy - 4.5);
  ctx.quadraticCurveTo(-4, hy - 3, -5, hy + 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-1, hy - 10.5);
  ctx.quadraticCurveTo(-3, hy - 15 + tuft, 3 + tuft, hy - 15 + tuft);
  ctx.quadraticCurveTo(1, hy - 12, 2, hy - 10.5);
  ctx.fill();

  // Face
  const face = pose.face ?? 'normal';
  const blink = face === 'normal' && t % 3.7 < 0.12;
  const ex = 5.2;
  const ey = hy - 0.5;
  if (o.luxury && !o.suit && face !== 'scared') {
    ctx.fillStyle = '#111';
    rr(ctx, 1.5, ey - 2, 9, 3.6, 1.6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(3, ey - 1.4, 2.5, 0.9);
  } else if (face === 'squint' || blink) {
    ctx.strokeStyle = '#1D1A24';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(ex - 2.2, ey);
    ctx.lineTo(ex + 2.2, ey);
    ctx.stroke();
  } else {
    const r = face === 'scared' ? 3 : 2.3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(28,20,24,0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = '#1D1A24';
    ctx.beginPath();
    ctx.arc(ex + 0.8, ey - rising * 0.6, face === 'scared' ? 1.1 : 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ex + 1.1, ey - 1.2 - rising * 0.6, 0.8, 0.8);
  }
  // Eyebrow
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  if (face === 'grin') {
    ctx.moveTo(2.6, ey - 3.6);
    ctx.lineTo(7.6, ey - 5);
  } else if (face === 'scared') {
    ctx.moveTo(2.6, ey - 5);
    ctx.lineTo(7.6, ey - 4.2);
  } else {
    ctx.moveTo(2.8, ey - 3.8);
    ctx.lineTo(7.4, ey - 3.8);
  }
  ctx.stroke();
  // Nose
  ctx.strokeStyle = SKIN_SHADE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(9.6, hy + 2.5, 1.6, -1.2, 1.4);
  ctx.stroke();
  // Mouth
  ctx.strokeStyle = '#8A3E30';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  if (face === 'scared') {
    ctx.ellipse(6, hy + 6, 1.4, 1.8, 0, 0, Math.PI * 2);
  } else {
    const r = face === 'grin' ? 3.6 : 1.8 + Math.min(1.6, pose.tier / 6);
    ctx.arc(5.5, hy + 4.2, r, 0.15, Math.PI * (face === 'grin' ? 0.85 : 0.65));
  }
  ctx.stroke();

  if (o.suit) {
    ctx.strokeStyle = 'rgba(220,235,255,0.95)';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(160,210,255,0.16)';
    ctx.beginPath();
    ctx.arc(1, hy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-2, hy - 3, 9, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
  }
}

/** Torch lens position in hero coordinates (used for light effects). */
export const TORCH_TIP: [number, number] = [30, -24];

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
  if (!a.luxury && b.luxury) out.push({ item: 'glasses', replaces: null, anchor: [5, -52] });
  if (!a.suit && b.suit) out.push({ item: 'helmet', replaces: null, anchor: [0, -51] });
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
      ctx.fillStyle = '#111';
      rr(ctx, -4, -1.6, 8, 3.2, 1.4);
      ctx.fill();
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
