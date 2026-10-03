// Connects the 3D hero to the 2D game canvas. If WebGL or the model is not available,
// every function here falls back to the flat hero, so the game still plays.
import { drawHeroBody, type HeroPose, type Outfit, type Rig } from './hero';
import { Hero3D, DRAW_RECT, type Frame } from './hero3d/hero3d';
import { axisRot } from './hero3d/rig';
import type { M4 } from './hero3d/mat';

let hero: Hero3D | null = null;
let failed = false;
const frames = new WeakMap<Rig, Frame>();
const NO_OUTFIT: Outfit = { feet: 'bare', legs: 'shorts', top: 'tank', watch: false, newTorch: false, tie: false, phone: false, luxury: false, suit: false, cap: false };

/** Camera turn: the hero faces right and a little toward the player. */
const RUN_YAW = 0.9;
const JUMP_IMPULSE = 760;

export function hero3dReady(): boolean { return hero !== null; }

/** Loads the model once; resolves false (and keeps the flat hero) when anything goes wrong. */
export async function loadHero3D(url: string): Promise<boolean> {
  if (hero) return true;
  if (failed) return false;
  try {
    hero = await Hero3D.load(url, 256);
    return true;
  } catch (e) {
    failed = true;
    console.warn('3D hero unavailable, using the flat one', e);
    return false;
  }
}

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const pxFor = (pxPerUnit: number): number => clamp(Math.ceil((DRAW_RECT.w * pxPerUnit) / 64) * 64, 128, 512);

/** Clip times that make up the jump: crouch, launch, apex, fall. rise: +1 launching fast, 0 apex, -1 falling fast. */
function jumpPose(sinceLand: number, rise: number): { a: number; b: number; k: number } {
  const CROUCH = 2.0, LAUNCH = 1.15, APEX = 1.6, FALL = 1.9;
  if (sinceLand < 0.16) {
    const u = sinceLand / 0.16;
    return { a: CROUCH, b: LAUNCH, k: u * u * (3 - 2 * u) };
  }
  const r = clamp(rise, -1, 1);
  const t = r >= 0 ? APEX + (LAUNCH + 0.05 - APEX) * r : APEX + (FALL - APEX) * -r;
  return { a: t, b: t, k: 0 };
}

function armsDown(amount: number): Record<string, M4> {
  return { LeftArm: axisRot(2, -amount), RightArm: axisRot(2, amount) };
}

/**
 * Renders the 3D hero for this frame and returns a rig whose attachment points and flashlight tip
 * follow the 3D body (the other fields still come from the flat rig).
 */
export function prepareHero(pose: HeroPose, rig2d: Rig, pxPerUnit: number): Rig {
  if (!hero) return rig2d;
  hero.look(pose.outfit ?? NO_OUTFIT, pose.face ?? 'normal');
  const clip = jumpPose(pose.sinceLand, pose.dead ? -1 : -pose.vy / JUMP_IMPULSE);
  const frame = hero.render({
    yaw: RUN_YAW,
    size: pxFor(pxPerUnit),
    clip,
    rotations: armsDown(0.55),
    torchAim: rig2d.torchAngle,
  });
  const rig: Rig = { ...rig2d, points: frame.points, torchTip: frame.torchTip };
  frames.set(rig, frame);
  return rig;
}

/** Draws the body in hero coordinates (feet at 0,0). Used for the hero and for the shield silhouette. */
export function drawBody(ctx: CanvasRenderingContext2D, pose: HeroPose, rig: Rig): void {
  const f = frames.get(rig);
  if (!f) { drawHeroBody(ctx, pose, rig); return; }
  ctx.save();
  // A light lean into the run direction.
  ctx.rotate(clamp((pose.vx ?? 0) / 2600, -0.1, 0.1));
  ctx.drawImage(f.canvas, DRAW_RECT.x, DRAW_RECT.y, DRAW_RECT.w, DRAW_RECT.h);
  ctx.restore();
}

// ---- portraits (menu stage, wardrobe, share card, magazine cover) ----

export type FrontPose = 'idle' | 'wave' | 'hips';

/** Draws the front-facing hero at the feet origin. Returns false when the flat one should be used instead. */
export function drawFront3D(ctx: CanvasRenderingContext2D, o: Outfit, t: number, pose: FrontPose, face: string): boolean {
  if (!hero) return false;
  const px = Math.abs(ctx.getTransform().a);
  const breathe = Math.sin(t * 2.4) * 0.03;
  let rot: Record<string, M4>;
  if (pose === 'wave') {
    const w = Math.sin(t * 7) * 0.22;
    rot = { LeftArm: axisRot(2, -(1.3 + breathe)), RightArm: axisRot(2, -(1.15 + w)), RightForeArm: axisRot(2, -0.5 + w * 1.6) };
  } else if (pose === 'hips') {
    rot = { LeftArm: axisRot(2, -(0.75 + breathe)), RightArm: axisRot(2, 0.75 + breathe), LeftForeArm: axisRot(2, 1.9), RightForeArm: axisRot(2, -1.9) };
  } else {
    rot = armsDown(1.3 + breathe);
  }
  // Soft contact shadow.
  const sh = ctx.createRadialGradient(0, 0, 1, 0, 0, 18);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(0, 0.6, 18, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  hero.look(o, face);
  const frame = hero.render({ yaw: 0.12, size: pxFor(px), rotations: rot });
  ctx.drawImage(frame.canvas, DRAW_RECT.x, DRAW_RECT.y, DRAW_RECT.w, DRAW_RECT.h);
  return true;
}
