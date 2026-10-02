// The hero: layers on a simple "skeleton", outfit chosen by wealth tier (design doc, section 4).
// Origin is at the feet; negative y goes up. Drawn with plain paths, no filters.

export interface HeroPose {
  tier: number;
  /** Flashlight color as "r,g,b". */
  light: string;
  neutral: boolean;
  /** Seconds since landing (squash) and vertical speed (stretch, arm swing). */
  sinceLand: number;
  vy: number;
  time: number;
}

interface Outfit {
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

const SKIN = '#E9B48C';
const SKIN_DARK = '#D49C74';
const HAIR = '#3A2A22';

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

/** Draws the hero at the current transform (already translated to the feet and flipped by facing). */
export function drawHeroBody(ctx: CanvasRenderingContext2D, pose: HeroPose): void {
  const o = outfitFor(pose.tier);
  const breathe = Math.sin(pose.time * 3.2) * 0.6;
  const rising = Math.max(-1, Math.min(1, pose.vy / 700));
  const backArm = -0.4 - rising * 0.9; // arm swings up on the way up

  // ---- Flashlight beam (behind the body) ----
  const beamLen = o.newTorch ? 1.35 : 1;
  ctx.globalAlpha = pose.neutral ? 0.16 : o.newTorch ? 0.5 : 0.36;
  const beam = ctx.createLinearGradient(12, -24, 64 * beamLen, 30 * beamLen);
  beam.addColorStop(0, `rgba(${pose.light},0.95)`);
  beam.addColorStop(1, `rgba(${pose.light},0)`);
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(14, -24);
  ctx.lineTo(72 * beamLen, 14 * beamLen);
  ctx.lineTo(28 * beamLen, 38 * beamLen);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // ---- Back arm (with phone on high tiers) ----
  ctx.save();
  ctx.translate(-10, -40 + breathe);
  ctx.rotate(backArm);
  ctx.fillStyle = o.top === 'jacket' ? jacketColor(o) : o.top === 'shirt' ? '#BFD6EE' : SKIN;
  rr(ctx, -3, 0, 6, 15, 3);
  ctx.fill();
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(0, 16, 3, 0, Math.PI * 2);
  ctx.fill();
  if (o.phone) {
    ctx.fillStyle = '#16181f';
    rr(ctx, -3.5, 14, 7, 11, 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,200,255,0.9)';
    ctx.fillRect(-2.3, 15.5, 4.6, 7);
  }
  ctx.restore();

  // ---- Legs ----
  const legColor = o.suit ? '#E6EBF2' : o.legs === 'trousers' ? (o.luxury ? '#1a1a22' : '#2B2F3A') : o.legs === 'sweats' ? '#6B7280' : SKIN_DARK;
  ctx.fillStyle = legColor;
  rr(ctx, -10, -17, 7, 17, 3);
  ctx.fill();
  rr(ctx, 3, -17, 7, 17, 3);
  ctx.fill();
  if (o.legs === 'sweats' && !o.suit) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-9, -16, 1.4, 14);
    ctx.fillRect(4, -16, 1.4, 14);
  }

  // ---- Feet ----
  if (o.feet === 'bare') {
    ctx.fillStyle = SKIN_DARK;
    rr(ctx, -11, -3, 9, 4, 2);
    ctx.fill();
    rr(ctx, 3, -3, 9, 4, 2);
    ctx.fill();
  } else if (o.feet === 'slippers') {
    ctx.fillStyle = '#3B82F6';
    rr(ctx, -12, -2.5, 11, 3.5, 1.5);
    ctx.fill();
    rr(ctx, 2, -2.5, 11, 3.5, 1.5);
    ctx.fill();
  } else {
    ctx.fillStyle = o.suit ? '#C9D2DD' : '#121212';
    rr(ctx, -12, -4, 11, 5, 2.5);
    ctx.fill();
    rr(ctx, 2, -4, 12, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(5, -3.5, 5, 1.2);
  }

  // ---- Hips: shorts / waistband ----
  if (o.legs === 'shorts' && !o.suit) {
    ctx.fillStyle = '#46608A';
    rr(ctx, -12, -25, 24, 12, 4);
    ctx.fill();
  } else {
    ctx.fillStyle = o.suit ? '#E6EBF2' : legColor;
    rr(ctx, -12, -25, 24, 10, 4);
    ctx.fill();
  }

  // ---- Torso ----
  const ty = -43 + breathe;
  if (o.top === 'tank') {
    ctx.fillStyle = SKIN;
    rr(ctx, -12, ty, 24, 20, 7);
    ctx.fill();
    ctx.fillStyle = '#E9E4D6';
    rr(ctx, -10, ty + 3, 20, 18, 5);
    ctx.fill();
  } else if (o.top === 'shirt') {
    ctx.fillStyle = '#CFE3F5';
    rr(ctx, -12, ty, 24, 21, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-5, ty);
    ctx.lineTo(0, ty + 5);
    ctx.lineTo(5, ty);
    ctx.closePath();
    ctx.fill();
  } else {
    // Jacket over a white shirt.
    ctx.fillStyle = '#F4F4F4';
    rr(ctx, -8, ty, 16, 21, 5);
    ctx.fill();
    ctx.fillStyle = jacketColor(o);
    ctx.beginPath();
    ctx.moveTo(-12, ty + 4);
    ctx.quadraticCurveTo(-12, ty, -7, ty);
    ctx.lineTo(-1, ty + 13);
    ctx.lineTo(-2, ty + 21);
    ctx.lineTo(-12, ty + 21);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(12, ty + 4);
    ctx.quadraticCurveTo(12, ty, 7, ty);
    ctx.lineTo(1, ty + 13);
    ctx.lineTo(2, ty + 21);
    ctx.lineTo(12, ty + 21);
    ctx.closePath();
    ctx.fill();
    if (o.luxury) {
      ctx.strokeStyle = '#E8C060';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-7, ty + 0.5);
      ctx.lineTo(-1, ty + 13);
      ctx.moveTo(7, ty + 0.5);
      ctx.lineTo(1, ty + 13);
      ctx.stroke();
    }
  }
  if (o.tie) {
    ctx.fillStyle = o.luxury ? '#E8C060' : '#C0283A';
    ctx.beginPath();
    ctx.moveTo(-2, ty + 2);
    ctx.lineTo(2, ty + 2);
    ctx.lineTo(2.6, ty + 13);
    ctx.lineTo(0, ty + 16);
    ctx.lineTo(-2.6, ty + 13);
    ctx.closePath();
    ctx.fill();
  }
  if (o.suit) {
    // Spacesuit over the suit: white shell with orange patches.
    ctx.fillStyle = 'rgba(232,237,243,0.92)';
    rr(ctx, -13, ty - 1, 26, 23, 8);
    ctx.fill();
    ctx.fillStyle = '#F08A24';
    ctx.fillRect(-11, ty + 8, 5, 3);
    ctx.fillStyle = '#5AA8FF';
    ctx.fillRect(6, ty + 6, 4, 4);
  }

  // ---- Front arm with flashlight ----
  ctx.save();
  ctx.translate(9, -39 + breathe);
  ctx.rotate(0.9 - rising * 0.2);
  ctx.fillStyle = o.suit ? '#E6EBF2' : o.top === 'jacket' ? jacketColor(o) : o.top === 'shirt' ? '#BFD6EE' : SKIN;
  rr(ctx, -3, 0, 6, 14, 3);
  ctx.fill();
  if (o.watch) {
    ctx.fillStyle = '#E8C060';
    ctx.fillRect(-3.2, 9.5, 6.4, 2.6);
  }
  ctx.fillStyle = o.newTorch ? '#C7CCD6' : '#3B3F4A';
  rr(ctx, -4, 12, 8, o.newTorch ? 11 : 9, 2);
  ctx.fill();
  ctx.fillStyle = `rgb(${pose.light})`;
  ctx.fillRect(-4, o.newTorch ? 21 : 19, 8, 3);
  ctx.restore();

  // ---- Head ----
  const hy = -51 + breathe;
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(0, hy, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.arc(-1, hy - 3, 8.6, Math.PI * 1.05, Math.PI * 2.05);
  ctx.fill();
  if (o.luxury && !o.suit) {
    ctx.fillStyle = '#111';
    rr(ctx, 1, hy - 2, 8, 3.2, 1.4);
    ctx.fill();
  } else {
    ctx.fillStyle = '#1D1A24';
    ctx.fillRect(4, hy, 2, 3);
  }
  // Small smile that grows with wealth.
  ctx.strokeStyle = '#8A4A3A';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(4, hy + 4, 2 + Math.min(2, pose.tier / 5), 0.1, Math.PI * 0.6);
  ctx.stroke();
  if (o.suit) {
    ctx.strokeStyle = 'rgba(220,235,255,0.9)';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(160,210,255,0.18)';
    ctx.beginPath();
    ctx.arc(0, hy, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(-3, hy - 3, 8, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
  }
}

function jacketColor(o: Outfit): string {
  return o.luxury ? '#151720' : '#1F2A44';
}
