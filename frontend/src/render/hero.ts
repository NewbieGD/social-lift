// The hero, drawn with smooth two-segment limbs, outlines, soft shading and secondary motion.
// Origin is at the feet; negative y goes up. Outfit is chosen by wealth tier (design doc, section 4).
// No filters or shadowBlur: shading is done with gradients.

import { bodyGradient, edge, fist3d, hand3d, limb3d, spec, tone, torch3d } from './shade3d';

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
  cap: boolean;
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
  /** Full outfit override (the collection); otherwise derived from the tier. */
  outfit?: Outfit;
  /** Skip the flashlight beam (drawn separately by the renderer). */
  noBeam?: boolean;
  /** Horizontal speed: drives the running-in-air cycle and the body lean. */
  vx?: number;
  /** Dead: limbs flail, scared face. */
  dead?: boolean;
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
    cap: false,
  };
}

/** The 13 collectible items, one per wealth tier (index = tier). */
export const ITEM_BY_TIER = [
  'cap', 'slippers', 'sweats', 'shirt', 'trousers', 'jacket', 'watch',
  'newTorch', 'tie', 'shoes', 'phone', 'glasses', 'helmet',
] as const;

export function itemCount(mask: number): number {
  let n = 0;
  for (let i = 0; i < ITEM_BY_TIER.length; i++) if (mask & (1 << i)) n++;
  return n;
}

/** The look built from the collected items: the best owned piece in each slot. */
export function outfitFromMask(mask: number): Outfit {
  const has = (item: (typeof ITEM_BY_TIER)[number]): boolean => (mask & (1 << ITEM_BY_TIER.indexOf(item))) !== 0;
  return {
    feet: has('shoes') ? 'shoes' : has('slippers') ? 'slippers' : 'bare',
    legs: has('trousers') ? 'trousers' : has('sweats') ? 'sweats' : 'shorts',
    top: has('jacket') ? 'jacket' : has('shirt') ? 'shirt' : 'tank',
    watch: has('watch'),
    newTorch: has('newTorch'),
    tie: has('tie'),
    phone: has('phone'),
    luxury: has('glasses'),
    suit: has('helmet'),
    cap: has('cap'),
  };
}

/** Where each item attaches on the hero (feet at 0,0, up is negative). */
export const ITEM_ANCHOR: Record<string, [number, number]> = {
  cap: [1, -62], slippers: [0, -2], shoes: [0, -2], sweats: [0, -15], trousers: [0, -15],
  shirt: [0, -33], jacket: [0, -33], watch: [13, -27], newTorch: [20, -26], tie: [0, -36],
  phone: [-6, -26], glasses: [6, -53], helmet: [1, -53],
};

// ======================================================================
// Character construction
// ----------------------------------------------------------------------
// 1. heroRig(pose) turns the game state into a skeleton: joint positions,
//    head/torso transforms, foot angles, the held item frame and named
//    attachment points. All animation states only change rig parameters.
// 2. drawHeroBody(ctx, pose) draws the rig in a fixed z-order with one
//    illustration language: same outline, flat colors, a single soft shade.
// Coordinates: origin at the feet, y grows downward, the hero faces +x.
// ======================================================================

const SKIN = '#F0BE94';
const SKIN_SHADE = '#D79C72';
const HAIR = '#3B2A22';
const LINE = '#3A2A30';
const LW = 1.0;

type P = { x: number; y: number };
type Limb3 = [P, P, P];

export type AttachPoint =
  | 'head' | 'headTop' | 'face' | 'neck' | 'torso' | 'waist' | 'back'
  | 'frontShoulder' | 'backShoulder' | 'frontHand' | 'backHand' | 'wrist'
  | 'frontFoot' | 'backFoot';

/** A held object's frame: position at the grip, rotation of the object's long axis. */
export interface HeldFrame {
  x: number;
  y: number;
  rot: number;
  scale: number;
}

export interface Rig {
  hip: P;
  chest: P;
  /** Torso lean (radians, positive = forward). */
  lean: number;
  torsoLen: number;
  head: P;
  headTilt: number;
  look: P;
  blink: number;
  frontArm: Limb3;
  backArm: Limb3;
  frontLeg: Limb3;
  backLeg: Limb3;
  frontFootRot: number;
  backFootRot: number;
  /** Flashlight frame (in the front hand). */
  held: HeldFrame;
  torchTip: P;
  torchAngle: number;
  /** The phone in the back hand, when carried. */
  backHeld: HeldFrame;
  gesture: Gesture;
  face: Face;
  points: Record<AttachPoint, P>;
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Natural, irregular blinking: one blink every 2-5 s, sometimes a double blink. */
function blinkAmount(t: number): number {
  const slot = Math.floor(t / 3.2);
  const start = slot * 3.2 + hash(slot) * 2.4;
  const d = t - start;
  const one = (x: number): number => (x >= 0 && x < 0.16 ? Math.sin((x / 0.16) * Math.PI) : 0);
  let b = one(d);
  if (hash(slot + 77) > 0.78) b = Math.max(b, one(d - 0.24));
  return b;
}

/** Points along a two-segment chain from angles (0 = straight down, positive = toward +x). */
function chainPts(o: P, a1: number, l1: number, a2: number, l2: number): Limb3 {
  const j = { x: o.x + Math.sin(a1) * l1, y: o.y + Math.cos(a1) * l1 };
  const e = { x: j.x + Math.sin(a1 + a2) * l2, y: j.y + Math.cos(a1 + a2) * l2 };
  return [o, j, e];
}

/**
 * Stable two-bone IK. `bend` fixes the elbow side (+1 / -1) so it never flips,
 * and the target is kept inside a safe reach to avoid the straight-arm singularity.
 */
function ik(s: P, t: P, l1: number, l2: number, bend: number): Limb3 {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1.5, l1 + l2 - 0.6);
  const base = Math.atan2(dy, dx);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ea = base + a * bend;
  const j = { x: s.x + Math.cos(ea) * l1, y: s.y + Math.sin(ea) * l1 };
  return [s, j, { x: s.x + Math.cos(base) * d, y: s.y + Math.sin(base) * d }];
}

function rot(p: P, o: P, a: number): P {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: o.x + (p.x - o.x) * c - (p.y - o.y) * s, y: o.y + (p.x - o.x) * s + (p.y - o.y) * c };
}

const UPPER_ARM = 8.4;
const FOREARM = 7.6;
const THIGH = 9.6;
const SHIN = 9.2;

/** Builds the skeleton for this frame from the animation state. */
export function heroRig(pose: HeroPose): Rig {
  const t = pose.time;
  const vy = pose.vy;
  const vx = pose.vx ?? 0;
  const o: Outfit = { ...(pose.outfit ?? outfitFor(pose.tier)), ...(pose.extra ?? {}) };
  const still = pose.gesture !== undefined || (vy === 0 && vx === 0);

  // ---- Animation parameters from the state ----
  // compress: just landed (knees bend, body squashes); rise / fall: vertical phases.
  const compress = pose.dead ? 0 : Math.exp(-pose.sinceLand * 16) * (still ? 0 : 1);
  const rise = clamp(vy / 760, 0, 1) * (1 - compress);
  const fall = clamp(-vy / 760, 0, 1.6);
  const apex = still ? 0 : clamp(1 - Math.abs(vy) / 260, 0, 1);
  const flail = pose.dead ? 1 : clamp((-vy - 900) / 400, 0, 1);
  const run = still ? 0 : clamp(Math.abs(vx) / 260, 0, 1);
  const runPhase = t * 11;
  const poise = Math.min(1, pose.tier / 8);
  const breathe = Math.sin(t * 2.6) * 0.45;

  // ---- Legs (chain from the hips; the hips drop so feet stay planted on landing) ----
  const legSwing = Math.sin(runPhase) * 0.45 * run;
  const fThigh = 0.12 + compress * 0.95 + apex * 0.55 + rise * -0.05 + fall * 0.12 + legSwing + flail * 0.5;
  const fKnee = -(0.15 + compress * 1.7 + apex * 0.95 + rise * 0.2 - fall * 0.1 + Math.max(0, legSwing) * 0.8 + flail * 0.3);
  const bThigh = -0.08 + compress * 0.75 + apex * 0.3 + rise * 0.28 - legSwing - flail * 0.5;
  const bKnee = -(0.25 + compress * 1.5 + apex * 0.6 + rise * 0.9 + Math.max(0, -legSwing) * 0.8 + flail * 0.5);

  const hipLocalF = chainPts({ x: 0, y: 0 }, fThigh, THIGH, fKnee, SHIN);
  const hipLocalB = chainPts({ x: 0, y: 0 }, bThigh, THIGH, bKnee, SHIN);
  const reachDown = Math.max(hipLocalF[2].y, hipLocalB[2].y);
  const hipY = -mix(19.5, reachDown + 1.5, clamp(compress * 1.4, 0, 1));
  const hip = { x: compress * 1.2, y: hipY };

  const frontHip = { x: hip.x + 2, y: hip.y };
  const backHip = { x: hip.x - 2.2, y: hip.y - 0.4 };
  const frontLeg = chainPts(frontHip, fThigh, THIGH, fKnee, SHIN);
  const backLeg = chainPts(backHip, bThigh, THIGH, bKnee, SHIN);
  // Feet follow the shin: toes point a little down when tucked, flat when planted.
  const shinAngle = (l: Limb3): number => Math.atan2(l[2].x - l[1].x, l[2].y - l[1].y);
  const frontFootRot = mix(-shinAngle(frontLeg) * 0.55 + 0.18 * (apex + fall * 0.6), 0, compress);
  const backFootRot = mix(-shinAngle(backLeg) * 0.55 + 0.3 * (apex + rise), 0, compress);

  // ---- Torso ----
  const lean = clamp(vx / 260, -1, 1) * 0.1 * (pose.dead ? 0 : 1) + compress * 0.14 - rise * 0.05 + fall * 0.03;
  const torsoLen = 18.5 * (1 - compress * 0.07 + rise * 0.04) + breathe * 0.25;
  const chest = { x: hip.x + Math.sin(lean) * torsoLen, y: hip.y - Math.cos(lean) * torsoLen };
  const neck = { x: chest.x + Math.sin(lean) * 2.6, y: chest.y - Math.cos(lean) * 2.6 };

  // ---- Head: follows the chest with a slight lag, looks where the body goes ----
  const headLag = compress * 1.6 - rise * 0.6 + fall * 0.8;
  const head = { x: neck.x + 1.6 + lean * 4, y: neck.y - 10.2 + headLag };
  const headTilt = lean * 0.6 + (pose.dead ? 0 : fall * 0.08 - rise * 0.05) + Math.sin(t * 1.3) * 0.015;
  const look = { x: 0.6 + clamp(vx / 260, -1, 1) * 0.4, y: -rise * 0.7 + fall * 0.9 };

  // ---- Shoulders ----
  const frontShoulder = rot({ x: chest.x + 3.4, y: chest.y + 2.2 }, chest, 0);
  const backShoulder = rot({ x: chest.x - 3.6, y: chest.y + 1.6 }, chest, 0);

  // ---- Back arm ----
  const gesture = pose.gesture ?? (o.phone ? 'none' : poise >= 1 ? 'pocket' : 'none');
  let backTarget: P;
  let backBend = 1;
  if (gesture === 'pocket') {
    backTarget = { x: hip.x - 3.5, y: hip.y - 1 };
    backBend = -1;
  } else if (gesture === 'scratch') {
    backTarget = { x: head.x - 5 + Math.sin(t * 10) * 0.8, y: head.y - 7 };
    backBend = -1;
  } else if (gesture === 'tie') {
    backTarget = { x: chest.x + 2, y: chest.y + 4 + Math.sin(t * 4) * 0.5 };
    backBend = 1;
  } else {
    // Counter-swing when moving, up and back on the rise, out for balance on the fall.
    const swing = -0.15 - rise * 1.1 + fall * 1.4 * (1 - poise * 0.4) - Math.sin(runPhase) * 0.6 * run + flail * 1.4;
    const len = 14.5 - compress * 2;
    backTarget = { x: backShoulder.x + Math.sin(swing) * len, y: backShoulder.y + Math.cos(swing) * len };
    backBend = swing > 1.2 ? -1 : 1;
  }
  const backArm = ik(backShoulder, backTarget, UPPER_ARM, FOREARM, backBend);

  // ---- Front arm holds the flashlight (or waves it in the menu) ----
  let frontTarget: P;
  if (gesture === 'wave') {
    frontTarget = { x: frontShoulder.x + 9 + Math.sin(t * 7) * 2.2, y: frontShoulder.y - 12 + Math.abs(Math.cos(t * 7)) * 0.8 };
  } else {
    frontTarget = {
      x: frontShoulder.x + 12.5 + Math.sin(runPhase) * 0.8 * run - compress * 1.5,
      y: frontShoulder.y + 6.5 + compress * 2.5 - rise * 2.5 + fall * 1.5 - flail * 10,
    };
  }
  const frontArm = ik(frontShoulder, frontTarget, UPPER_ARM, FOREARM, gesture === 'wave' ? -1 : 1);

  // Flashlight frame: mostly aims down-forward, follows the forearm a little.
  const forearm = Math.atan2(frontArm[2].y - frontArm[1].y, frontArm[2].x - frontArm[1].x);
  const aim = gesture === 'wave' ? forearm : mix(forearm, Math.atan2(0.62, 0.78), 0.65);
  const held: HeldFrame = { x: frontArm[2].x, y: frontArm[2].y, rot: aim, scale: 1 };
  const torchLen = o.newTorch ? 11.5 : 9.5;
  const torchTip = { x: held.x + Math.cos(aim) * torchLen, y: held.y + Math.sin(aim) * torchLen };
  const backForearm = Math.atan2(backArm[2].y - backArm[1].y, backArm[2].x - backArm[1].x);
  const backHeld: HeldFrame = { x: backArm[2].x, y: backArm[2].y, rot: backForearm, scale: 1 };

  const face: Face = pose.face ?? 'normal';
  const blink = face === 'scared' || pose.dead ? 0 : blinkAmount(t + pose.tier * 0.37);

  const headTop = rot({ x: head.x, y: head.y - 10 }, head, headTilt);
  const facePt = rot({ x: head.x + 5, y: head.y - 0.5 }, head, headTilt);
  return {
    hip,
    chest,
    lean,
    torsoLen,
    head,
    headTilt,
    look,
    blink,
    frontArm,
    backArm,
    frontLeg,
    backLeg,
    frontFootRot,
    backFootRot,
    held,
    torchTip,
    torchAngle: aim,
    backHeld,
    gesture,
    face,
    points: {
      head,
      headTop,
      face: facePt,
      neck,
      torso: { x: (hip.x + chest.x) / 2 + 0.5, y: (hip.y + chest.y) / 2 },
      waist: { x: hip.x, y: hip.y + 1 },
      back: { x: chest.x - 6, y: chest.y + 6 },
      frontShoulder,
      backShoulder,
      frontHand: frontArm[2],
      backHand: backArm[2],
      wrist: { x: frontArm[2].x - Math.cos(forearm) * 2.2, y: frontArm[2].y - Math.sin(forearm) * 2.2 },
      frontFoot: frontLeg[2],
      backFoot: backLeg[2],
    },
  };
}

// ---------------------------------------------------------------------------
// Drawing helpers: one outline weight for everything.
// ---------------------------------------------------------------------------

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number): number => Math.round(clamp(c * (1 - k), 0, 255));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** A tapered capsule segment. */
function capsule(ctx: CanvasRenderingContext2D, a: P, b: P, wa: number, wb: number): void {
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

/**
 * A limb as one continuous shape: the outline pass is drawn for both segments first,
 * then the fills, so the elbow/knee has no seam and no gap.
 */
function drawLimb(ctx: CanvasRenderingContext2D, l: Limb3, w: [number, number, number], upper: string, lower: string): void {
  // Soft 3D: one continuous tapered shape lit from the top-left, no seam at the joint.
  limb3d(ctx, l[0], l[1], l[2], w, upper, 1, lower);
}

function stroke(ctx: CanvasRenderingContext2D, w = LW): void {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
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

/** Torso silhouette in the torso frame (hip at 0,0, chest up along -y). */
function torsoShape(ctx: CanvasRenderingContext2D, len: number): void {
  ctx.beginPath();
  ctx.moveTo(-6.6, 0.5);
  ctx.bezierCurveTo(-7.6, -len * 0.45, -8.6, -len + 3, -6.2, -len);
  ctx.quadraticCurveTo(0, -len - 1.6, 6.4, -len + 0.2);
  ctx.bezierCurveTo(8.8, -len + 3, 7.8, -len * 0.45, 6.8, 0.5);
  ctx.quadraticCurveTo(0, 2.2, -6.6, 0.5);
  ctx.closePath();
}

function drawFoot(ctx: CanvasRenderingContext2D, at: P, r: number, o: Outfit, back: boolean): void {
  ctx.save();
  ctx.translate(at.x, at.y + 1.2);
  ctx.rotate(r);
  const dark = back ? 0.12 : 0;
  if (o.suit) {
    ctx.fillStyle = shade('#C9D2DD', dark);
    rr(ctx, -3.4, -3.2, 11.6, 5.4, 2.6);
  } else if (o.feet === 'shoes') {
    ctx.fillStyle = shade('#1B1B1F', dark);
    ctx.beginPath();
    ctx.moveTo(-3.4, -3);
    ctx.lineTo(4, -3.2);
    ctx.quadraticCurveTo(9.6, -2.6, 9.6, 0.6);
    ctx.lineTo(9.6, 1.6);
    ctx.lineTo(-3.4, 1.6);
    ctx.closePath();
  } else if (o.feet === 'slippers') {
    // Closed house slipper: a soft upper over the whole foot on a thick sole.
    ctx.fillStyle = shade('#2F6FD8', dark);
    rr(ctx, -4, -0.2, 13.2, 2.6, 1.3);
    ctx.fill();
    stroke(ctx);
    ctx.fillStyle = shade('#4A8EF2', dark);
    ctx.beginPath();
    ctx.moveTo(-3.6, 0);
    ctx.lineTo(-3.6, -2.8);
    ctx.quadraticCurveTo(-3.2, -4, 0, -4);
    ctx.lineTo(4.6, -4);
    ctx.quadraticCurveTo(9.4, -3.8, 9.4, 0);
    ctx.closePath();
  } else {
    ctx.fillStyle = shade(SKIN, dark);
    ctx.beginPath();
    ctx.moveTo(-3, -3);
    ctx.lineTo(4, -3);
    ctx.quadraticCurveTo(8.8, -2.6, 8.8, 0.4);
    ctx.lineTo(8.8, 1.2);
    ctx.lineTo(-3, 1.2);
    ctx.closePath();
  }
  // Volume: light from above, darker sole edge, a glossy toe.
  const base = typeof ctx.fillStyle === 'string' ? ctx.fillStyle : '#888888';
  const fg = ctx.createLinearGradient(0, -4, 0, 2);
  fg.addColorStop(0, tone(base, 0.28));
  fg.addColorStop(0.55, base);
  fg.addColorStop(1, tone(base, -0.32));
  ctx.fillStyle = fg;
  ctx.fill();
  edge(ctx, base);
  if ((o.feet === 'shoes' || o.feet === 'slippers') && !o.suit) spec(ctx, 4.5, -2.2, 2.4, 0.8, o.feet === 'shoes' ? 0.75 : 0.5);
  ctx.restore();
}

/** Draws a hand gripping a held object along its axis (fingers wrap over it). */
function drawGrip(ctx: CanvasRenderingContext2D, skin: string): void {
  ctx.save();
  ctx.translate(0.4, 0);
  ctx.scale(0.95, 0.9);
  fist3d(ctx, skin);
  ctx.restore();
}

function drawOpenHand(ctx: CanvasRenderingContext2D, l: Limb3, skin: string): void {
  const a = Math.atan2(l[2].y - l[1].y, l[2].x - l[1].x);
  ctx.save();
  ctx.translate(l[2].x + Math.cos(a) * 1.2, l[2].y + Math.sin(a) * 1.2);
  ctx.rotate(a);
  hand3d(ctx, skin, false);
  ctx.restore();
}

/** Flashlight in its held frame: grip at 0,0, lens along +x. */
function drawTorch(ctx: CanvasRenderingContext2D, o: Outfit, light: string): number {
  const len = o.newTorch ? 11.5 : 9.5;
  torch3d(ctx, len - 1.5, 1.1, light, o.newTorch);
  return len;
}

/** Draws the head, hair, face and head-worn items in the head frame. */
function drawHead(ctx: CanvasRenderingContext2D, rig: Rig, o: Outfit, tier: number): void {
  ctx.save();
  ctx.translate(rig.head.x, rig.head.y);
  ctx.rotate(rig.headTilt);
  const face = rig.face;

  // Back hair mass behind the head.
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.ellipse(-2.4, -1.5, 9.6, 9.8, 0, 0, Math.PI * 2);
  ctx.fill();
  stroke(ctx);

  // Head (3/4 view facing right)
  ctx.beginPath();
  ctx.moveTo(-8.6, -2);
  ctx.bezierCurveTo(-9, -10.5, 8, -11.5, 10.2, -3.5);
  ctx.bezierCurveTo(11.4, 1, 10.6, 6.2, 6.6, 8.6);
  ctx.quadraticCurveTo(1, 11, -4.4, 8.6);
  ctx.bezierCurveTo(-8, 6.8, -8.8, 2.4, -8.6, -2);
  ctx.closePath();
  const headG = ctx.createRadialGradient(3, -5, 1, 1, 0, 13);
  headG.addColorStop(0, tone(SKIN, 0.38));
  headG.addColorStop(0.5, SKIN);
  headG.addColorStop(1, tone(SKIN, -0.2));
  ctx.fillStyle = headG;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(190,110,70,0.16)';
  ctx.beginPath();
  ctx.ellipse(-7, 3, 6, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cheek blush, under the near eye.
  ctx.fillStyle = 'rgba(232,120,110,0.14)';
  ctx.beginPath();
  ctx.ellipse(9, 2.6, 1.8, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  stroke(ctx);

  // Ear
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.ellipse(-5.6, 1.4, 2.1, 2.8, 0.1, 0, Math.PI * 2);
  ctx.fill();
  stroke(ctx);
  ctx.strokeStyle = SKIN_SHADE;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(-5.4, 1.5, 1.1, -1.2, 1.3);
  ctx.stroke();

  // Fringe with a tuft that lags behind the motion.
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.moveTo(-8.8, -1);
  ctx.bezierCurveTo(-10, -11, 3, -14, 9.6, -6.5);
  ctx.quadraticCurveTo(10.6, -6.4, 10.2, -5.6);
  ctx.quadraticCurveTo(6.4, -8.6, 2.6, -7.6);
  ctx.quadraticCurveTo(3, -8.8, 1.2, -9);
  ctx.quadraticCurveTo(-2, -6.6, -4.2, -5.6);
  ctx.quadraticCurveTo(-5.6, -2.4, -6.2, 0.6);
  ctx.closePath();
  ctx.fill();
  stroke(ctx);
  const tuft = -rig.look.y * 1.4;
  if (!(o.cap || o.suit)) {
  ctx.beginPath();
  ctx.moveTo(-1.5, -10.6);
  ctx.quadraticCurveTo(-2.4, -15.4 + tuft, 3.4, -14.6 + tuft);
  ctx.quadraticCurveTo(0.6, -12.6, 1.6, -11);
  ctx.closePath();
  ctx.fill();
  stroke(ctx, 1);
  }

  // Eyes: far eye smaller, near eye larger; eyelids close from the top for blinks.
  const lids = face === 'squint' ? 0.55 : 0;
  const eye = (cx: number, rx: number, ry: number): void => {
    const lid = Math.max(lids, rig.blink);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, -1, rx, ry, 0, 0, Math.PI * 2);
    const ew = ctx.createLinearGradient(0, -1 - ry, 0, -1 + ry);
    ew.addColorStop(0, '#D6DAE3');
    ew.addColorStop(0.4, '#FFFFFF');
    ew.addColorStop(1, '#EEF0F5');
    ctx.fillStyle = ew;
    ctx.fill();
    ctx.clip();
    const pr = face === 'scared' ? rx * 0.42 : rx * 0.62;
    const irisG = ctx.createRadialGradient(cx, -1, 0.1, cx, -1, pr * 1.2);
    irisG.addColorStop(0, '#6E4426');
    irisG.addColorStop(1, '#1E140F');
    ctx.fillStyle = irisG;
    ctx.beginPath();
    ctx.arc(cx + rig.look.x * rx * 0.45, -1 + rig.look.y * ry * 0.35, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + rig.look.x * rx * 0.45 + pr * 0.35, -1 + rig.look.y * ry * 0.35 - pr * 0.4, pr * 0.32, 0, Math.PI * 2);
    ctx.fill();
    if (lid > 0) {
      ctx.fillStyle = SKIN;
      ctx.fillRect(cx - rx - 1, -1 - ry - 1, rx * 2 + 2, (ry * 2 + 1) * lid + 0.5);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - rx, -1 - ry + (ry * 2) * lid);
      ctx.lineTo(cx + rx, -1 - ry + (ry * 2) * lid);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(cx, -1, rx, ry, 0, 0, Math.PI * 2);
    stroke(ctx, 1);
  };
  const scared = face === 'scared';
  eye(2.4, scared ? 1.9 : 1.6, scared ? 2.4 : 2.1);
  eye(7.2, scared ? 2.5 : 2.2, scared ? 2.9 : 2.6);

  // Eyebrows
  ctx.strokeStyle = HAIR;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (face === 'grin') {
    ctx.moveTo(0.8, -5);
    ctx.lineTo(3.6, -5.4);
    ctx.moveTo(5.4, -5.8);
    ctx.lineTo(9.2, -6.6);
  } else if (scared) {
    ctx.moveTo(0.8, -6.2);
    ctx.lineTo(3.6, -5.6);
    ctx.moveTo(5.4, -5.4);
    ctx.lineTo(9.2, -6.6);
  } else if (face === 'squint') {
    ctx.moveTo(0.8, -4.2);
    ctx.lineTo(3.6, -3.6);
    ctx.moveTo(5.4, -3.4);
    ctx.lineTo(9.2, -4.4);
  } else {
    ctx.moveTo(0.8, -4.9);
    ctx.lineTo(3.6, -5);
    ctx.moveTo(5.4, -5.2);
    ctx.lineTo(9.2, -5.4);
  }
  ctx.stroke();

  // Nose: a small rounded bump on the profile edge.
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.ellipse(10.4, 1.9, 1.7, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10.4, 1.9, 1.6, -1.1, 1.6);
  stroke(ctx, 1);

  // Mouth
  ctx.strokeStyle = '#5A2A24';
  ctx.lineWidth = 1.2;
  if (face === 'grin') {
    ctx.fillStyle = '#5A2A24';
    ctx.beginPath();
    ctx.moveTo(3.4, 5);
    ctx.quadraticCurveTo(6.6, 5.6, 9.4, 4.4);
    ctx.quadraticCurveTo(7, 9.2, 3.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#E86A6A';
    ctx.beginPath();
    ctx.ellipse(6, 6.9, 1.6, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (scared) {
    ctx.fillStyle = '#5A2A24';
    ctx.beginPath();
    ctx.ellipse(6.4, 6, 1.4, 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (face === 'squint') {
    ctx.beginPath();
    ctx.moveTo(4.4, 5.4);
    ctx.lineTo(8.4, 5);
    ctx.stroke();
  } else {
    const smile = 1.2 + Math.min(1.2, tier / 9);
    ctx.beginPath();
    ctx.moveTo(4.2, 5);
    ctx.quadraticCurveTo(6.4, 5 + smile, 8.8, 4.2);
    ctx.stroke();
  }

  // Head-worn items follow the head transform.
  if (o.luxury && !o.suit && !scared) {
    ctx.fillStyle = '#121214';
    rr(ctx, 0, -3.4, 4.8, 3.6, 1.6);
    ctx.fill();
    rr(ctx, 5.2, -3.6, 5.2, 4, 1.6);
    ctx.fill();
    ctx.fillRect(4.6, -2.6, 0.8, 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(6, -3, 2.2, 0.8);
  }
  if (o.cap && !o.suit) drawCapShape(ctx);
  if (o.suit) {
    ctx.strokeStyle = 'rgba(220,235,255,0.95)';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(160,210,255,0.16)';
    ctx.beginPath();
    ctx.arc(0.8, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-2, -3, 9, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
  }
  ctx.restore();
}

/** Cap worn backwards, in the head frame (head center at 0,0): covers the whole top of the head. */
function drawCapShape(ctx: CanvasRenderingContext2D): void {
  // Crown
  ctx.fillStyle = '#C8263C';
  ctx.beginPath();
  ctx.moveTo(-12, -2.6);
  ctx.bezierCurveTo(-13, -16.5, 9.5, -17.5, 11.4, -6.2);
  ctx.quadraticCurveTo(11.6, -5, 10.8, -4.6);
  ctx.quadraticCurveTo(0, -7.8, -12, -2.6);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.beginPath();
  ctx.ellipse(-9, -6, 6, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(3, -13, 5, 2, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-12, -2.6);
  ctx.bezierCurveTo(-13, -16.5, 9.5, -17.5, 11.4, -6.2);
  ctx.quadraticCurveTo(11.6, -5, 10.8, -4.6);
  ctx.quadraticCurveTo(0, -7.8, -12, -2.6);
  ctx.closePath();
  stroke(ctx);
  // Panel seam
  ctx.strokeStyle = 'rgba(80,10,20,0.5)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0.4, -15.4);
  ctx.quadraticCurveTo(-1.5, -10, -1.2, -6.4);
  ctx.stroke();
  // Visor pointing backwards
  ctx.fillStyle = '#9E1B2E';
  ctx.beginPath();
  ctx.moveTo(-11.2, -4.6);
  ctx.quadraticCurveTo(-18.5, -5.2, -19, -1.6);
  ctx.quadraticCurveTo(-15, -0.8, -11.4, -1.4);
  ctx.closePath();
  ctx.fill();
  stroke(ctx);
  // Button on top
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0.6, -15.6, 1.3, 0, Math.PI * 2);
  ctx.fill();
  stroke(ctx, 0.8);
}

/** Draws the torso with its clothing in the torso frame. */
function drawTorso(ctx: CanvasRenderingContext2D, rig: Rig, o: Outfit, t: number): void {
  const len = rig.torsoLen;
  const jacket = o.top === 'jacket' && !o.suit;
  const jacketC = o.luxury ? '#1B1D27' : '#24315C';
  ctx.save();
  ctx.translate(rig.hip.x, rig.hip.y);
  ctx.rotate(rig.lean);
  const color = o.suit ? '#E9EEF5' : jacket ? jacketC : o.top === 'shirt' ? '#CFE3F5' : '#F1ECDF';
  torsoShape(ctx, len);
  ctx.fillStyle = bodyGradient(ctx, color, -9, 9);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // One soft shade on the back side.
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(-8.5, -len / 2, 4.5, len, 0, 0, Math.PI * 2);
  ctx.fill();
  if (o.top === 'tank' && !o.suit) {
    // Skin at the neck scoop and outside the straps.
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.moveTo(-3.6, -len - 2);
    ctx.quadraticCurveTo(0.4, -len + 6.5, 4.2, -len - 2);
    ctx.fill();
    ctx.fillRect(-10, -len - 2, 4, 6);
    ctx.fillRect(6.6, -len - 2, 4, 6);
    ctx.strokeStyle = 'rgba(42,30,34,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3.4, -len - 0.5);
    ctx.quadraticCurveTo(0.4, -len + 6, 4, -len - 0.5);
    ctx.stroke();
  }
  if (o.top === 'shirt' && !o.suit) {
    ctx.fillStyle = 'rgba(40,60,90,0.5)';
    for (let i = 0; i < 3; i++) ctx.fillRect(0.2, -len + 6 + i * 4.2, 1.1, 1.1);
    ctx.strokeStyle = 'rgba(40,60,90,0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0.8, -len + 3);
    ctx.lineTo(0.8, 0);
    ctx.stroke();
  }
  if (jacket) {
    ctx.fillStyle = '#F7F7F7';
    ctx.beginPath();
    ctx.moveTo(-3.4, -len - 1);
    ctx.lineTo(0.8, -len + 10.5);
    ctx.lineTo(4.8, -len - 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = o.luxury ? '#E8C060' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-4.2, -len - 0.5);
    ctx.lineTo(0.4, -len + 11);
    ctx.lineTo(-1.8, -1);
    ctx.moveTo(5.6, -len - 0.5);
    ctx.lineTo(1.2, -len + 11);
    ctx.stroke();
    ctx.fillStyle = o.luxury ? '#E8C060' : '#C9CED8';
    ctx.beginPath();
    ctx.arc(2.4, -len + 13.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.suit) {
    ctx.fillStyle = '#F08A24';
    rr(ctx, -6, -len + 8, 4.6, 2.8, 1);
    ctx.fill();
    ctx.fillStyle = '#5AA8FF';
    rr(ctx, 2.6, -len + 6, 3.8, 3.8, 1);
    ctx.fill();
  }
  ctx.restore();
  torsoShape(ctx, len);
  stroke(ctx);

  // Collar (shirt and jacket) sits on top of the outline.
  if ((o.top === 'shirt' || jacket) && !o.suit) {
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0.8, -len + 4);
      ctx.lineTo(0.8 + side * 4.4, -len - 0.8);
      ctx.lineTo(0.8 + side * 1.4, -len - 1.2);
      ctx.closePath();
      ctx.fill();
      stroke(ctx, 0.9);
    }
  }
  if (o.tie && !o.suit) {
    const sway = Math.sin(t * 6) * 0.05 + rig.look.y * -0.06;
    ctx.save();
    ctx.translate(0.8, -len + 2.6);
    ctx.rotate(sway);
    ctx.fillStyle = o.luxury ? '#E8C060' : '#C8263C';
    ctx.beginPath();
    ctx.moveTo(-1.5, 0);
    ctx.lineTo(1.5, 0);
    ctx.lineTo(2.3, 10);
    ctx.lineTo(0, 12.8);
    ctx.lineTo(-2.3, 10);
    ctx.closePath();
    ctx.fill();
    stroke(ctx, 0.9);
    ctx.restore();
  }
  // Coat tails flare a little on the way down.
  if (jacket) {
    const flare = 1 + rig.look.y * 1.6;
    ctx.fillStyle = jacketC;
    ctx.beginPath();
    ctx.moveTo(-6.4, -1);
    ctx.lineTo(-7.6 - flare, 3.6);
    ctx.lineTo(-1.6, 1.4);
    ctx.closePath();
    ctx.fill();
    stroke(ctx);
  }
  ctx.restore();
}

/** Pants on both legs and the waistband that hides the hip joints. */
function legColors(o: Outfit): { thigh: string; shin: string } {
  const pants = o.suit ? '#E9EEF5' : o.legs === 'trousers' ? (o.luxury ? '#17181F' : '#2D3242') : o.legs === 'sweats' ? '#6E7685' : '#4A6694';
  return { thigh: pants, shin: o.legs === 'shorts' && !o.suit ? SKIN : pants };
}

function drawLeg(ctx: CanvasRenderingContext2D, l: Limb3, o: Outfit, back: boolean): void {
  const { thigh, shin } = legColors(o);
  const k = back ? 0.12 : 0;
  drawLimb(ctx, l, [7.6, 6.2, 5.2], shade(thigh, k), shade(shin, k));
  if (o.legs === 'shorts' && !o.suit) {
    // Shorts end just above the knee with a hem.
    const hx = l[0].x + (l[1].x - l[0].x) * 0.82;
    const hy = l[0].y + (l[1].y - l[0].y) * 0.82;
    ctx.fillStyle = shade(thigh, k);
    capsule(ctx, l[0], { x: hx, y: hy }, 8.4, 8);
    ctx.fill();
    stroke(ctx, 1);
  } else if (o.legs === 'sweats' && !o.suit) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l[0].x - 2.4, l[0].y + 1);
    ctx.lineTo(l[1].x - 2, l[1].y);
    ctx.lineTo(l[2].x - 1.6, l[2].y - 1.5);
    ctx.stroke();
  } else if (o.legs === 'trousers' && !o.suit) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(l[0].x + 1, l[0].y + 2);
    ctx.lineTo(l[1].x + 1, l[1].y);
    ctx.lineTo(l[2].x + 1, l[2].y - 1.5);
    ctx.stroke();
  }
}

function drawArm(ctx: CanvasRenderingContext2D, l: Limb3, o: Outfit, back: boolean): void {
  const jacket = o.top === 'jacket' && !o.suit;
  const sleeve = o.suit ? '#E9EEF5' : jacket ? (o.luxury ? '#1B1D27' : '#24315C') : o.top === 'shirt' ? '#BCD5EE' : SKIN;
  const k = back ? 0.14 : 0;
  drawLimb(ctx, l, [5.8, 4.8, 4.1], shade(sleeve, k), shade(sleeve, k));
  if (jacket || o.top === 'shirt') {
    // Cuff at the wrist.
    const a = Math.atan2(l[2].y - l[1].y, l[2].x - l[1].x);
    ctx.fillStyle = jacket ? '#F4F4F4' : shade('#A9C6E6', k);
    capsule(ctx, { x: l[2].x - Math.cos(a) * 1.8, y: l[2].y - Math.sin(a) * 1.8 }, l[2], 4.4, 4.2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Main draw: fixed z-order.
//  1 back arm (when it hangs/swings)  2 back leg  3 torso + clothes  4 front leg
//  5 waistband  6 chest-level gesture arm  7 head + face + head items
//  8 head-level gesture arm  9 front arm  10 held flashlight + gripping hand
// ---------------------------------------------------------------------------

export function drawHeroBody(ctx: CanvasRenderingContext2D, pose: HeroPose, given?: Rig): Rig {
  const o: Outfit = { ...(pose.outfit ?? outfitFor(pose.tier)), ...(pose.extra ?? {}) };
  const rig = given ?? heroRig(pose);
  const skin = o.suit ? '#E9EEF5' : SKIN;
  const t = pose.time;

  if (!pose.noBeam) {
    ctx.save();
    ctx.translate(rig.torchTip.x, rig.torchTip.y);
    ctx.rotate(rig.torchAngle);
    ctx.globalAlpha = pose.neutral ? 0.16 : 0.4;
    const beam = ctx.createLinearGradient(0, 0, 60, 0);
    beam.addColorStop(0, `rgba(${pose.light},0.95)`);
    beam.addColorStop(1, `rgba(${pose.light},0)`);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(62, -24);
    ctx.lineTo(62, 24);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const otherLayer = rig.gesture === 'scratch' ? 'head' : rig.gesture === 'tie' ? 'chest' : 'behind';
  const drawBackArm = (): void => {
    drawArm(ctx, rig.backArm, o, otherLayer === 'behind');
    if (rig.gesture === 'pocket') return;
    if (o.phone && rig.gesture === 'none') {
      ctx.save();
      ctx.translate(rig.backHeld.x, rig.backHeld.y);
      ctx.rotate(rig.backHeld.rot + Math.PI / 2);
      ctx.fillStyle = '#17191F';
      rr(ctx, -3, -2, 6, 10.5, 1.6);
      ctx.fill();
      stroke(ctx);
      ctx.fillStyle = 'rgba(140,200,255,0.95)';
      ctx.fillRect(-2, -0.6, 4, 7.4);
      ctx.restore();
      ctx.save();
      ctx.translate(rig.backHeld.x, rig.backHeld.y);
      ctx.rotate(rig.backHeld.rot);
      drawGrip(ctx, shade(skin, 0.1));
      ctx.restore();
    } else {
      drawOpenHand(ctx, rig.backArm, otherLayer === 'behind' ? shade(skin, 0.1) : skin);
    }
  };

  if (otherLayer === 'behind') drawBackArm();
  drawLeg(ctx, rig.backLeg, o, true);
  drawFoot(ctx, rig.backLeg[2], rig.backFootRot, o, true);
  drawTorso(ctx, rig, o, t);
  drawLeg(ctx, rig.frontLeg, o, false);
  drawFoot(ctx, rig.frontLeg[2], rig.frontFootRot, o, false);

  // Waistband over both hip joints.
  {
    const { thigh } = legColors(o);
    ctx.save();
    ctx.translate(rig.hip.x, rig.hip.y);
    ctx.rotate(rig.lean);
    ctx.fillStyle = o.suit ? '#E9EEF5' : o.top === 'jacket' ? (o.luxury ? '#1B1D27' : '#24315C') : thigh;
    ctx.beginPath();
    ctx.moveTo(-6.8, -3.2);
    ctx.quadraticCurveTo(0, -4.4, 7, -3.2);
    ctx.lineTo(7.2, 2.4);
    ctx.quadraticCurveTo(0, 4.2, -6.9, 2.4);
    ctx.closePath();
    ctx.fill();
    stroke(ctx);
    if (o.legs === 'trousers' && o.top !== 'jacket' && !o.suit) {
      ctx.fillStyle = '#5A3E2A';
      ctx.fillRect(-6.6, -3, 13.6, 1.6);
    }
    ctx.restore();
  }

  if (otherLayer === 'chest') drawBackArm();

  // Neck
  ctx.fillStyle = skin;
  const nk = rig.points.neck;
  capsule(ctx, { x: nk.x - 0.4, y: nk.y + 3 }, { x: rig.head.x - 1.4, y: rig.head.y + 7 }, 5.2, 4.8);
  ctx.fill();
  stroke(ctx, 1);

  drawHead(ctx, rig, o, pose.tier);
  if (otherLayer === 'head') drawBackArm();

  // Front arm, then the flashlight in the hand, then the fingers over it.
  drawArm(ctx, rig.frontArm, o, false);
  if (o.watch) {
    const w = rig.points.wrist;
    const a = Math.atan2(rig.frontArm[2].y - rig.frontArm[1].y, rig.frontArm[2].x - rig.frontArm[1].x);
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(a);
    ctx.fillStyle = '#E8C060';
    rr(ctx, -1.3, -2.8, 2.6, 5.6, 1);
    ctx.fill();
    stroke(ctx, 0.9);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(rig.held.x, rig.held.y);
  ctx.rotate(rig.held.rot);
  drawTorch(ctx, o, pose.light);
  drawGrip(ctx, skin);
  ctx.restore();
  void t;
  return rig;
}

/** Fallback torch lens position for the idle pose (the renderer uses rig.torchTip). */
export const TORCH_TIP: [number, number] = [28, -22];

// ---------- Suit-up items (fly in and snap onto the hero) ----------

export type Item =
  | 'cap'
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
      for (const dx of [-6.5, 6.5]) {
        ctx.save();
        ctx.translate(dx - 2.5, 1);
        ctx.fillStyle = '#2F6FD8';
        rr(ctx, -4, -0.2, 13.2, 2.6, 1.3);
        ctx.fill();
        stroke(ctx);
        ctx.fillStyle = '#4A8EF2';
        ctx.beginPath();
        ctx.moveTo(-3.6, 0);
        ctx.lineTo(-3.6, -2.8);
        ctx.quadraticCurveTo(-3.2, -4, 0, -4);
        ctx.lineTo(4.6, -4);
        ctx.quadraticCurveTo(9.4, -3.8, 9.4, 0);
        ctx.closePath();
        ctx.fill();
        stroke(ctx);
        ctx.restore();
      }
      break;
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
    case 'cap':
      ctx.save();
      ctx.translate(0, 9);
      ctx.scale(0.85, 0.85);
      drawCapShape(ctx);
      ctx.restore();
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
