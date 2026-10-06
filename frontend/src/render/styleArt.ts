// Art of the style parts. The same functions draw the side hero (in the game) and the front
// hero (menu, styles screen), because they work in the frame of the body part they belong to:
//   head   - origin at the head center
//   torso  - origin at the hip center, the chest is up (negative y), `len` is the torso height
//   arms / legs - the three joint points of the limb
//   foot   - origin at the ankle, the toe points to +x (side) or the shoe is seen from the front
// Light comes from the top-left; outlines are a dark shade of the part's own color.

import { bodyGradient, edge, limb3d, sphere, spec, tone, type P } from './shade3d';
import type { StyleDef } from './styles';

export type View = 'side' | 'front';
type Limb3 = [P, P, P];

const SKIN = '#F0BE94';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fillEdge(ctx: CanvasRenderingContext2D, color: string, w = 0.85): void {
  ctx.fillStyle = color;
  ctx.fill();
  edge(ctx, color, w);
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 0.8): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Eye centers in the head frame. */
function eyes(view: View): { x: number; r: number }[] {
  return view === 'side' ? [{ x: 2.4, r: 1.7 }, { x: 7.2, r: 2.3 }] : [{ x: -4.5, r: 2.7 }, { x: 4.5, r: 2.7 }];
}

// ===========================================================================
// Skin override (the green set tints the head, arms, chest and shins)
// ===========================================================================

export function skinFor(d: StyleDef | undefined, base: string, shade: string): { skin: string; shade: string } {
  if (d?.palette.skin) return { skin: d.palette.skin, shade: d.palette.skinShade ?? shade };
  return { skin: base, shade };
}

// ===========================================================================
// HEAD
// ===========================================================================

export function drawStyleHead(ctx: CanvasRenderingContext2D, d: StyleDef, view: View, t: number): void {
  const p = d.palette;
  const side = view === 'side';
  const cx = side ? 1 : 0;
  const rx = side ? 9.8 : 10.8;
  switch (d.kind) {
    case 'beanie': {
      // Knitted cap with a folded band and a pompom.
      ctx.beginPath();
      ctx.moveTo(cx - rx - 0.9, -2.4);
      ctx.bezierCurveTo(cx - rx - 1.6, -15.5, cx + rx + 1.8, -15.5, cx + rx + 1, -2.4);
      ctx.quadraticCurveTo(cx, -5.4, cx - rx - 0.9, -2.4);
      ctx.closePath();
      const g = ctx.createRadialGradient(cx - 3, -11, 1, cx, -6, 15);
      g.addColorStop(0, tone(p.sub, 0.3));
      g.addColorStop(0.5, p.sub);
      g.addColorStop(1, tone(p.sub, -0.35));
      ctx.fillStyle = g;
      ctx.fill();
      edge(ctx, p.sub);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 0.7;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 2.8, -14);
        ctx.quadraticCurveTo(cx + i * 3.2, -9, cx + i * 3.6, -5.4);
        ctx.stroke();
      }
      rr(ctx, cx - rx - 1.2, -6.2, rx * 2 + 2.4, 4.4, 2.1);
      const bg = ctx.createLinearGradient(0, -6.2, 0, -1.8);
      bg.addColorStop(0, '#F4F8FD');
      bg.addColorStop(1, '#BFCCDD');
      ctx.fillStyle = bg;
      ctx.fill();
      edge(ctx, '#BFCCDD');
      ctx.strokeStyle = 'rgba(70,90,120,0.45)';
      ctx.lineWidth = 0.6;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 2.4, -6);
        ctx.lineTo(cx + i * 2.4, -2.2);
        ctx.stroke();
      }
      sphere(ctx, cx, -15.4, 2.9, 2.6, p.accent);
      break;
    }
    case 'helmet': {
      // Red shell with a gold faceplate and a glowing visor slit.
      ctx.beginPath();
      ctx.ellipse(cx - (side ? 0.8 : 0), -0.4, rx + 2.1, 12.2, 0, 0, Math.PI * 2);
      const sg = ctx.createRadialGradient(cx - 4, -7, 1, cx, 0, 16);
      sg.addColorStop(0, tone(p.main, 0.3));
      sg.addColorStop(0.5, p.main);
      sg.addColorStop(1, tone(p.main, -0.4));
      ctx.fillStyle = sg;
      ctx.fill();
      edge(ctx, p.main, 1);
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx - 1, -12.4);
      ctx.quadraticCurveTo(cx + (side ? 4 : 0), -6, cx + (side ? 3 : 0), 0);
      ctx.stroke();
      // Gold faceplate.
      ctx.beginPath();
      if (side) {
        ctx.moveTo(cx - 0.5, -6.8);
        ctx.quadraticCurveTo(cx + rx + 2.4, -7.4, cx + rx + 2.4, -1);
        ctx.quadraticCurveTo(cx + rx + 2, 6.6, cx + 3.2, 11);
        ctx.quadraticCurveTo(cx - 2.6, 9, cx - 1, 2);
      } else {
        ctx.moveTo(-8.6, -6.6);
        ctx.quadraticCurveTo(0, -9.6, 8.6, -6.6);
        ctx.quadraticCurveTo(10, 3, 5, 10.6);
        ctx.quadraticCurveTo(0, 12.6, -5, 10.6);
        ctx.quadraticCurveTo(-10, 3, -8.6, -6.6);
      }
      ctx.closePath();
      const fg = ctx.createLinearGradient(cx - rx, -8, cx + rx, 10);
      fg.addColorStop(0, tone(p.sub, 0.3));
      fg.addColorStop(0.5, p.sub);
      fg.addColorStop(1, tone(p.sub, -0.35));
      ctx.fillStyle = fg;
      ctx.fill();
      edge(ctx, p.sub, 0.9);
      // Visor slits.
      ctx.fillStyle = p.glow ?? '#9CE8FF';
      if (side) {
        ctx.beginPath();
        ctx.moveTo(cx + 1.4, -3);
        ctx.lineTo(cx + rx + 1.6, -3.6);
        ctx.lineTo(cx + rx + 1.6, -0.6);
        ctx.lineTo(cx + 1.4, -1);
        ctx.closePath();
        ctx.fill();
        glowDot(ctx, cx + rx * 0.7, -2, 7, p.glow ?? '#9CE8FF', 0.55);
      } else {
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * 1.3, -1);
          ctx.lineTo(s * 7.4, -3.4);
          ctx.lineTo(s * 7.4, -0.6);
          ctx.lineTo(s * 1.5, 0.4);
          ctx.closePath();
          ctx.fill();
          glowDot(ctx, s * 4.4, -1.6, 6, p.glow ?? '#9CE8FF', 0.5);
        }
      }
      ctx.strokeStyle = tone(p.sub, -0.5);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      if (side) {
        ctx.moveTo(cx + 3, 6.2);
        ctx.lineTo(cx + rx, 6);
      } else {
        ctx.moveTo(-3.6, 6.4);
        ctx.lineTo(3.6, 6.4);
      }
      ctx.stroke();
      spec(ctx, cx - 3, -9, 4, 2, 0.5);
      break;
    }
    case 'cowl': {
      // Dark hood with a face window, a dark eye band and white lens slits.
      const shell = (): void => {
        ctx.ellipse(cx - (side ? 1.2 : 0), -0.6, rx + 2, 12.4, 0, 0, Math.PI * 2);
      };
      ctx.beginPath();
      shell();
      // The window is cut out of the hood with the even-odd rule.
      if (side) {
        ctx.moveTo(cx + 0.2, -5.2);
        ctx.quadraticCurveTo(cx + rx + 2.2, -6.4, cx + rx + 2.6, -1);
        ctx.quadraticCurveTo(cx + rx + 3, 6, cx + 4, 11.6);
        ctx.quadraticCurveTo(cx - 1.4, 9, cx + 0.2, 2);
        ctx.closePath();
      } else {
        ctx.moveTo(-8.8, -5.4);
        ctx.quadraticCurveTo(0, -7.6, 8.8, -5.4);
        ctx.quadraticCurveTo(10.2, 4, 5.6, 10.8);
        ctx.quadraticCurveTo(0, 13, -5.6, 10.8);
        ctx.quadraticCurveTo(-10.2, 4, -8.8, -5.4);
        ctx.closePath();
      }
      const g = ctx.createRadialGradient(cx - 4, -8, 1, cx, 0, 16);
      g.addColorStop(0, tone(p.main, 0.3));
      g.addColorStop(0.5, p.main);
      g.addColorStop(1, tone(p.dark, 0.05));
      ctx.fillStyle = g;
      ctx.fill('evenodd');
      edge(ctx, p.main, 0.95);
      // Soft peak of the hood.
      ctx.beginPath();
      ctx.moveTo(cx - 5, -11);
      ctx.quadraticCurveTo(cx - 6.4, -16.4 - Math.sin(t * 2) * 0.4, cx - 1.2, -13);
      ctx.closePath();
      fillEdge(ctx, p.main);
      // Eye band across the window.
      ctx.beginPath();
      if (side) {
        ctx.moveTo(cx + 0.4, -4.4);
        ctx.lineTo(cx + rx + 2.4, -4.8);
        ctx.lineTo(cx + rx + 2.6, 1.4);
        ctx.lineTo(cx + 0.4, 1.8);
      } else {
        ctx.moveTo(-9, -4.6);
        ctx.quadraticCurveTo(0, -6.6, 9, -4.6);
        ctx.lineTo(9.2, 1.6);
        ctx.quadraticCurveTo(0, 3, -9.2, 1.6);
      }
      ctx.closePath();
      ctx.fillStyle = p.dark;
      ctx.fill();
      ctx.fillStyle = p.glow ?? '#EAF3FF';
      for (const e of eyes(view)) {
        ctx.beginPath();
        ctx.moveTo(e.x - e.r - 0.6, -2.4);
        ctx.lineTo(e.x + e.r + 0.8, -3.2);
        ctx.lineTo(e.x + e.r + 0.2, 0);
        ctx.lineTo(e.x - e.r, 0.2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      if (side) {
        ctx.moveTo(cx + 0.2, -5.2);
        ctx.quadraticCurveTo(cx + rx + 2.2, -6.4, cx + rx + 2.6, -1);
      } else {
        ctx.moveTo(-8.8, -5.4);
        ctx.quadraticCurveTo(0, -7.6, 8.8, -5.4);
      }
      ctx.stroke();
      break;
    }
    case 'glow': {
      // Glowing red eyes that throw a thin beam forward.
      for (const e of eyes(view)) {
        const y = -1;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(e.x, y, e.r + 0.3, e.r * 1.12 + 0.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#B80F14';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(e.x, y, e.r * 0.8, e.r * 0.9, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#FF4A3E';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(e.x + 0.2, y - 0.2, e.r * 0.4, e.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#FFF2D8';
        ctx.fill();
        ctx.restore();
        glowDot(ctx, e.x, y, e.r * 3.4, p.glow ?? '#FF3B3B', 0.85);
        if (side) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const lg = ctx.createLinearGradient(e.x, y, e.x + 22, y);
          lg.addColorStop(0, 'rgba(255,70,60,0.55)');
          lg.addColorStop(1, 'rgba(255,70,60,0)');
          ctx.fillStyle = lg;
          ctx.beginPath();
          ctx.moveTo(e.x, y - 0.8);
          ctx.lineTo(e.x + 22, y - 1.6);
          ctx.lineTo(e.x + 22, y + 1.6);
          ctx.lineTo(e.x, y + 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      // A serious brow.
      ctx.strokeStyle = '#2A1E1A';
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const e of eyes(view)) {
        ctx.moveTo(e.x - e.r - 0.6, -4.6 + (view === 'front' && e.x < 0 ? -0.6 : 0));
        ctx.lineTo(e.x + e.r + 0.8, -3.8 + (view === 'front' && e.x > 0 ? -0.6 : 0));
      }
      ctx.stroke();
      break;
    }
    case 'headband': {
      // Face wrap over the mouth and an orange headband with tails.
      ctx.beginPath();
      if (side) {
        ctx.moveTo(cx - rx + 1.4, 1.2);
        ctx.quadraticCurveTo(cx + rx * 0.6, 0.4, cx + rx + 1.4, 2.2);
        ctx.quadraticCurveTo(cx + rx + 0.6, 8.4, cx + 4, 10.8);
        ctx.quadraticCurveTo(cx - rx + 2, 9.2, cx - rx + 1.4, 1.2);
      } else {
        ctx.moveTo(-10.4, 1.4);
        ctx.quadraticCurveTo(0, 0, 10.4, 1.4);
        ctx.quadraticCurveTo(10.2, 7.4, 5.6, 10.8);
        ctx.quadraticCurveTo(0, 12.4, -5.6, 10.8);
        ctx.quadraticCurveTo(-10.2, 7.4, -10.4, 1.4);
      }
      ctx.closePath();
      const mg = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
      mg.addColorStop(0, tone(p.main, 0.2));
      mg.addColorStop(1, tone(p.main, -0.3));
      ctx.fillStyle = mg;
      ctx.fill();
      edge(ctx, p.main);
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - rx + 2, 5);
      ctx.lineTo(cx + rx, 4.2);
      ctx.moveTo(cx - rx + 3, 8);
      ctx.lineTo(cx + rx - 3, 8.6);
      ctx.stroke();
      // Headband.
      rr(ctx, cx - rx - 0.9, -7.6, rx * 2 + 1.8, 4.2, 1.8);
      const hb = ctx.createLinearGradient(0, -7.6, 0, -3.4);
      hb.addColorStop(0, tone(p.accent, 0.25));
      hb.addColorStop(1, tone(p.accent, -0.3));
      ctx.fillStyle = hb;
      ctx.fill();
      edge(ctx, p.accent);
      // Knot and tails sway behind.
      const kx = cx - rx - 0.9;
      const sway = Math.sin(t * 5) * 1.6;
      for (const k of [0, 1]) {
        ctx.beginPath();
        ctx.moveTo(kx, -5.6);
        ctx.quadraticCurveTo(kx - 6, -5 + k * 3 + sway, kx - 12 - k * 2, -2.4 + k * 7 + sway * 1.4);
        ctx.lineTo(kx - 10 - k * 2, -0.2 + k * 7 + sway * 1.4);
        ctx.quadraticCurveTo(kx - 5, -3 + k * 3, kx, -3.6);
        ctx.closePath();
        fillEdge(ctx, p.accent, 0.7);
      }
      sphere(ctx, kx, -5.6, 1.9, 1.9, p.accent);
      break;
    }
    case 'mask': {
      // Full mask with a web pattern and two big white lenses.
      ctx.beginPath();
      ctx.ellipse(cx - (side ? 0.8 : 0), -0.2, rx + 1.6, 12, 0, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(cx - 4, -7, 1, cx, 0, 15);
      g.addColorStop(0, tone(p.main, 0.35));
      g.addColorStop(0.5, p.main);
      g.addColorStop(1, tone(p.main, -0.4));
      ctx.fillStyle = g;
      ctx.fill();
      edge(ctx, p.main, 1);
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = p.sub;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 0.55;
      const ox = cx + (side ? 2 : 0);
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(ox, -13);
        ctx.lineTo(ox + i * 6, 14);
        ctx.stroke();
      }
      for (const r of [4, 8, 12, 16]) {
        ctx.beginPath();
        ctx.arc(ox, -13, r, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      for (const e of eyes(view)) {
        const lw = e.r + 1.5;
        ctx.beginPath();
        ctx.moveTo(e.x - lw, -3.6);
        ctx.quadraticCurveTo(e.x, -5.2, e.x + lw + 0.6, -3.2);
        ctx.quadraticCurveTo(e.x + lw + 0.2, 1.8, e.x, 2.4);
        ctx.quadraticCurveTo(e.x - lw - 0.4, 1.4, e.x - lw, -3.6);
        ctx.closePath();
        ctx.fillStyle = p.glow ?? '#F5FBFF';
        ctx.fill();
        edge(ctx, p.dark, 1);
        ctx.fillStyle = 'rgba(60,70,100,0.35)';
        ctx.fillRect(e.x - lw * 0.9, 0.2, lw * 2, 1.4);
      }
      break;
    }
    case 'brute': {
      // Messy dark hair, heavy angry brows and clenched teeth (the skin is tinted by the caller).
      ctx.fillStyle = '#2B2A22';
      ctx.beginPath();
      ctx.moveTo(cx - rx - 0.4, -3);
      for (let i = 0; i <= 6; i++) {
        const x = cx - rx - 0.4 + (i / 6) * (rx * 2 + 0.8);
        ctx.lineTo(x + 0.4, -10.6 - (i % 2 === 0 ? 4.6 : 1.4));
        ctx.lineTo(x + (rx * 2) / 12, -8);
      }
      ctx.lineTo(cx + rx + 0.4, -3);
      ctx.quadraticCurveTo(cx, -7.4, cx - rx - 0.4, -3);
      ctx.closePath();
      fillEdge(ctx, '#2B2A22', 0.9);
      ctx.fillStyle = '#1E2A1A';
      for (const e of eyes(view)) {
        ctx.beginPath();
        ctx.moveTo(e.x - e.r - 1.4, -5.8 - (e.x < cx ? 0 : -1.2));
        ctx.lineTo(e.x + e.r + 1.6, -3.2 + (e.x < cx ? -1.2 : 0.6));
        ctx.lineTo(e.x + e.r + 1.2, -1.9 + (e.x < cx ? -1.2 : 0.4));
        ctx.lineTo(e.x - e.r - 1, -3.8);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
}

// ===========================================================================
// TORSO
// ===========================================================================

export function torsoColor(d: StyleDef): string {
  switch (d.kind) {
    case 'hoodie':
    case 'armor':
    case 'tunic':
    case 'suit':
    case 'wraps':
    case 'web':
      return d.kind === 'hoodie' ? d.palette.main : d.palette.main;
    case 'bare':
      return d.palette.skin ?? SKIN;
    default:
      return d.palette.main;
  }
}

/** Drawn before the torso: capes and the shell. Frame: hip at 0,0. */
export function drawStyleBack(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, hw: number, view: View, t: number): void {
  const p = d.palette;
  const wave = Math.sin(t * 3.2) * 1.4;
  if (d.kind === 'tunic' || d.kind === 'suit') {
    const outer = d.kind === 'suit' ? p.accent : p.main;
    const inner = d.kind === 'suit' ? '#B5481A' : p.accent;
    ctx.beginPath();
    if (view === 'side') {
      ctx.moveTo(-hw * 0.7, -len + 1);
      ctx.quadraticCurveTo(-hw - 9 - wave, -len * 0.4, -hw - 14 - wave * 1.5, 17);
      ctx.quadraticCurveTo(-hw - 6, 21 + wave, -3, 15);
      ctx.lineTo(-1, -len + 3);
    } else {
      ctx.moveTo(-hw * 0.9, -len + 1);
      ctx.quadraticCurveTo(-hw - 8, -len * 0.3, -hw - 11, 17 + wave * 0.5);
      ctx.quadraticCurveTo(0, 22 + wave, hw + 11, 17 - wave * 0.5);
      ctx.quadraticCurveTo(hw + 8, -len * 0.3, hw * 0.9, -len + 1);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(-hw - 14, 0, hw, 0);
    g.addColorStop(0, tone(outer, -0.25));
    g.addColorStop(0.6, outer);
    g.addColorStop(1, tone(outer, 0.1));
    ctx.fillStyle = g;
    ctx.fill();
    edge(ctx, outer, 0.9);
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = inner;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (view === 'side') {
      ctx.moveTo(-hw - 2, -len * 0.5);
      ctx.quadraticCurveTo(-hw - 8 - wave, 2, -hw - 11 - wave, 14);
    } else {
      ctx.moveTo(0, -len * 0.4);
      ctx.lineTo(0, 20);
    }
    ctx.stroke();
    ctx.restore();
  } else if (d.kind === 'wraps') {
    // The shell on the back.
    ctx.save();
    if (view === 'side') ctx.translate(-hw - 1.6, -len * 0.5);
    else ctx.translate(0, -len * 0.5);
    const rx = view === 'side' ? 6.4 : hw + 5.2;
    const ry = len * 0.62;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, 1, 0, 0, ry * 1.2);
    g.addColorStop(0, tone(p.sub, 0.3));
    g.addColorStop(0.55, p.sub);
    g.addColorStop(1, tone(p.sub, -0.4));
    ctx.fillStyle = g;
    ctx.fill();
    edge(ctx, p.sub, 1);
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = tone(p.sub, -0.5);
    ctx.lineWidth = 0.8;
    for (let y = -ry; y <= ry; y += ry / 2.4) {
      ctx.beginPath();
      ctx.moveTo(-rx, y);
      ctx.lineTo(rx, y);
      ctx.stroke();
    }
    for (let x = -rx; x <= rx; x += rx / 1.6) {
      ctx.beginPath();
      ctx.moveTo(x, -ry);
      ctx.lineTo(x, ry);
      ctx.stroke();
    }
    ctx.restore();
    spec(ctx, -rx * 0.35, -ry * 0.45, rx * 0.5, ry * 0.25, 0.4);
    ctx.restore();
  }
}

/** Decor on the torso. Called inside the torso clip. Frame: hip at 0,0. */
export function drawStyleTorso(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, hw: number, view: View): void {
  const p = d.palette;
  const mid = view === 'side' ? 0.8 : 0;
  switch (d.kind) {
    case 'hoodie': {
      rr(ctx, mid - hw * 0.62, -len * 0.34, hw * 1.24, len * 0.26, 3);
      ctx.fillStyle = p.dark;
      ctx.globalAlpha = 0.45;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = tone(p.main, -0.45);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.strokeStyle = tone(p.main, 0.5);
      ctx.lineWidth = 0.9;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(mid + s * 2.2, -len + 3);
        ctx.lineTo(mid + s * 2.4, -len + 12);
        ctx.stroke();
      }
      // Hood collar and ribbed hem.
      ctx.beginPath();
      ctx.ellipse(mid, -len + 0.4, hw * 0.62, 3.4, 0, 0, Math.PI);
      ctx.fillStyle = tone(p.main, -0.2);
      ctx.fill();
      ctx.fillStyle = tone(p.main, -0.28);
      ctx.fillRect(-hw - 1, -3.6, hw * 2 + 2, 4);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-hw, -3.6);
      ctx.lineTo(hw, -3.6);
      ctx.stroke();
      break;
    }
    case 'armor': {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(mid + s * 0.8, -len + 3.4);
        ctx.lineTo(mid + s * (hw - 0.8), -len + 2);
        ctx.lineTo(mid + s * (hw - 1.4), -len * 0.52);
        ctx.lineTo(mid + s * 0.8, -len * 0.46);
        ctx.closePath();
        ctx.fillStyle = tone(p.main, 0.16);
        ctx.fill();
        ctx.strokeStyle = p.sub;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mid, -len + 1);
      ctx.lineTo(mid, -4);
      ctx.stroke();
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) {
        const y = -len * 0.4 + i * (len * 0.1);
        ctx.beginPath();
        ctx.moveTo(mid - hw * 0.6, y);
        ctx.lineTo(mid + hw * 0.6, y);
        ctx.stroke();
      }
      rr(ctx, -hw - 1, -5.4, hw * 2 + 2, 5.4, 1.4);
      ctx.fillStyle = p.sub;
      ctx.fill();
      edge(ctx, p.sub, 0.8);
      glowDot(ctx, mid, -len * 0.62, 5.4, p.glow ?? '#9CE8FF', 0.6);
      ctx.fillStyle = p.glow ?? '#9CE8FF';
      ctx.fillRect(mid - 0.7, -len * 0.7, 1.4, 5.4);
      break;
    }
    case 'tunic': {
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.7, -len + 1);
      ctx.lineTo(hw * 0.8, -5);
      ctx.stroke();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(mid - hw * 0.5, -len * 0.5 + i * 3.6);
        ctx.lineTo(mid, -len * 0.4 + i * 3.6);
        ctx.lineTo(mid + hw * 0.5, -len * 0.5 + i * 3.6);
        ctx.stroke();
      }
      ctx.fillStyle = p.dark;
      ctx.fillRect(-hw - 1, -5.8, hw * 2 + 2, 5.8);
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-hw - 1, -5.8, hw * 2 + 2, 5.8);
      for (const x of [-hw * 0.55, 0, hw * 0.55]) {
        rr(ctx, mid + x - 1.7, -5, 3.4, 4, 0.9);
        ctx.fillStyle = tone(p.dark, 0.25);
        ctx.fill();
        ctx.strokeStyle = p.sub;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      break;
    }
    case 'suit': {
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(mid - hw * 0.55, -len * 0.46 + i * 3.2);
        ctx.lineTo(mid, -len * 0.62 + i * 3.2);
        ctx.lineTo(mid + hw * 0.55, -len * 0.46 + i * 3.2);
        ctx.stroke();
      }
      ctx.strokeStyle = '#F2C94C';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(mid - hw * 0.4, -len * 0.38);
      ctx.lineTo(mid, -len * 0.54);
      ctx.lineTo(mid + hw * 0.4, -len * 0.38);
      ctx.stroke();
      rr(ctx, -hw - 1, -5.2, hw * 2 + 2, 5.2, 1.2);
      ctx.fillStyle = p.sub;
      ctx.fill();
      edge(ctx, p.sub, 0.7);
      rr(ctx, mid - 2, -5.2, 4, 5.2, 1);
      ctx.fillStyle = '#F2C94C';
      ctx.fill();
      break;
    }
    case 'wraps': {
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(mid + i * 3 - 6, -len + 1);
        ctx.lineTo(mid + i * 3 + 6, -2);
        ctx.moveTo(mid + i * 3 + 6, -len + 1);
        ctx.lineTo(mid + i * 3 - 6, -2);
        ctx.stroke();
      }
      rr(ctx, -hw - 1, -5.6, hw * 2 + 2, 4.6, 1.2);
      const g = ctx.createLinearGradient(0, -5.6, 0, -1);
      g.addColorStop(0, tone(p.accent, 0.2));
      g.addColorStop(1, tone(p.accent, -0.3));
      ctx.fillStyle = g;
      ctx.fill();
      edge(ctx, p.accent, 0.7);
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.8, -len + 0.4);
      ctx.lineTo(hw * 0.7, -4);
      ctx.stroke();
      break;
    }
    case 'web': {
      ctx.strokeStyle = p.sub;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 0.7;
      const cy = -len * 0.6;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(mid, cy);
        ctx.lineTo(mid + i * hw * 0.55, i === 0 ? -2 : cy + len * 0.5);
        ctx.stroke();
      }
      for (const r of [4, 7.6, 11.4]) {
        ctx.beginPath();
        ctx.arc(mid, cy, r, 0.12 * Math.PI, 0.88 * Math.PI);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.sub;
      ctx.fillRect(mid - 0.9, -len + 1, 1.8, len * 0.3);
      rr(ctx, -hw - 1, -4.8, hw * 2 + 2, 4.8, 1.2);
      ctx.fillStyle = p.dark;
      ctx.fill();
      break;
    }
    case 'bare': {
      ctx.strokeStyle = tone(p.skin ?? SKIN, -0.3);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(mid, -len + 3);
      ctx.lineTo(mid, -len * 0.4);
      ctx.moveTo(mid - hw * 0.7, -len * 0.55);
      ctx.quadraticCurveTo(mid - hw * 0.25, -len * 0.42, mid, -len * 0.5);
      ctx.moveTo(mid + hw * 0.7, -len * 0.55);
      ctx.quadraticCurveTo(mid + hw * 0.25, -len * 0.42, mid, -len * 0.5);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(mid - 3, -len * 0.34 + i * 3.4);
        ctx.lineTo(mid + 3, -len * 0.34 + i * 3.4);
      }
      ctx.stroke();
      // Ragged scraps of the vest.
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(mid + s * 0.5, -len + 2);
        ctx.lineTo(mid + s * (hw + 1), -len + 1);
        ctx.lineTo(mid + s * (hw + 1), -len * 0.62);
        ctx.lineTo(mid + s * (hw * 0.55), -len * 0.7);
        ctx.lineTo(mid + s * (hw * 0.3), -len * 0.55);
        ctx.lineTo(mid + s * 0.5, -len * 0.66);
        ctx.closePath();
        ctx.fillStyle = p.main;
        ctx.fill();
        ctx.strokeStyle = p.dark;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

// ===========================================================================
// ARMS
// ===========================================================================

export function armColor(d: StyleDef): string {
  return d.kind === 'big' ? d.palette.skin ?? SKIN : d.palette.main;
}

export function armScale(d: StyleDef | undefined): number {
  return d?.kind === 'big' ? 1.34 : 1;
}

export function handColor(d: StyleDef | undefined, skin: string): string {
  if (!d) return skin;
  switch (d.kind) {
    case 'gauntlet':
      return d.palette.sub;
    case 'bracer':
      return d.palette.dark;
    case 'glove':
      return d.palette.sub;
    case 'webglove':
      return d.palette.sub;
    case 'big':
      return d.palette.skin ?? skin;
    default:
      return skin;
  }
}

export function drawStyleArm(ctx: CanvasRenderingContext2D, d: StyleDef, l: Limb3, back: boolean): void {
  const p = d.palette;
  const k = back ? -0.14 : 0;
  const el = l[1];
  const wr = l[2];
  const lerp = (a: P, b: P, u: number): P => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const sc = armScale(d);
  switch (d.kind) {
    case 'gauntlet':
      limb3d(ctx, lerp(el, wr, 0.2), lerp(el, wr, 0.6), wr, [5.4 * sc, 5.2 * sc, 4.6 * sc], tone(p.sub, k), 1);
      limb3d(ctx, lerp(el, wr, 0.45), lerp(el, wr, 0.7), lerp(el, wr, 0.9), [5.8, 5.6, 5.2], tone(p.main, k), 1);
      break;
    case 'bracer':
      limb3d(ctx, lerp(el, wr, 0.3), lerp(el, wr, 0.65), wr, [5.2, 5, 4.6], tone(p.sub, k), 1);
      break;
    case 'glove':
      limb3d(ctx, lerp(el, wr, 0.66), lerp(el, wr, 0.8), wr, [5.2, 5, 4.6], tone(p.accent, k), 1);
      break;
    case 'wrap':
      for (let i = 0; i < 4; i++) {
        const a = lerp(el, wr, 0.3 + i * 0.16);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 2.9, 0, Math.PI * 2);
        ctx.strokeStyle = tone(p.dark, k);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      limb3d(ctx, lerp(el, wr, 0.12), lerp(el, wr, 0.26), lerp(el, wr, 0.4), [5.6, 5.5, 5.4], tone(p.sub, k), 1);
      break;
    case 'webglove':
      ctx.strokeStyle = tone(p.accent, k);
      ctx.lineWidth = 0.6;
      for (let i = 0; i < 3; i++) {
        const a = lerp(el, wr, 0.5 + i * 0.16);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 'big': {
      // Ragged teal cuff at the elbow.
      const e = lerp(el, wr, 0.1);
      ctx.beginPath();
      ctx.moveTo(e.x - 3, e.y - 2);
      ctx.lineTo(e.x + 3.4, e.y - 2.6);
      ctx.lineTo(e.x + 4, e.y + 2.8);
      ctx.lineTo(e.x + 1.4, e.y + 1.4);
      ctx.lineTo(e.x - 0.6, e.y + 3.4);
      ctx.lineTo(e.x - 3, e.y + 1.2);
      ctx.closePath();
      fillEdge(ctx, tone(p.main, k), 0.7);
      break;
    }
    default:
      break;
  }
}

// ===========================================================================
// LEGS and FEET
// ===========================================================================

export function legColors(d: StyleDef): { thigh: string; shin: string } {
  const p = d.palette;
  switch (d.kind) {
    case 'jeans':
      return { thigh: '#3A5A92', shin: '#3A5A92' };
    case 'torn':
      return { thigh: p.main, shin: p.skin ?? SKIN };
    default:
      return { thigh: p.main, shin: p.main };
  }
}

export function drawStyleLeg(ctx: CanvasRenderingContext2D, d: StyleDef, l: Limb3, back: boolean): void {
  const p = d.palette;
  const k = back ? -0.14 : 0;
  const lerp = (a: P, b: P, u: number): P => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const [hip, knee, ank] = l;
  switch (d.kind) {
    case 'jeans':
      ctx.strokeStyle = tone('#E8D9A8', k);
      ctx.lineWidth = 0.6;
      ctx.setLineDash([1.6, 1.2]);
      ctx.beginPath();
      ctx.moveTo(hip.x + 2.6, hip.y + 2);
      ctx.lineTo(knee.x + 2.4, knee.y);
      ctx.lineTo(ank.x + 2, ank.y - 2);
      ctx.stroke();
      ctx.setLineDash([]);
      limb3d(ctx, lerp(knee, ank, 0.72), lerp(knee, ank, 0.86), ank, [5.8, 5.8, 5.8], tone('#5B7DB8', k), 1);
      break;
    case 'plates':
      limb3d(ctx, lerp(knee, ank, 0.12), lerp(knee, ank, 0.5), lerp(knee, ank, 0.92), [6, 6, 5.2], tone(p.sub, k), 1);
      sphere(ctx, knee.x, knee.y, 3.6, 3.6, tone(p.sub, k));
      limb3d(ctx, lerp(hip, knee, 0.3), lerp(hip, knee, 0.55), lerp(hip, knee, 0.8), [8, 8, 7.2], tone(p.main, k + 0.1), 1);
      break;
    case 'trousers':
      ctx.strokeStyle = tone(p.sub, k);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(hip.x + 2.4, hip.y + 2);
      ctx.lineTo(knee.x + 2.2, knee.y);
      ctx.lineTo(ank.x + 1.8, ank.y - 2);
      ctx.stroke();
      ctx.strokeStyle = tone(p.accent, k);
      ctx.beginPath();
      ctx.moveTo(knee.x - 3, knee.y);
      ctx.lineTo(knee.x + 3, knee.y);
      ctx.stroke();
      break;
    case 'bodysuit':
      ctx.strokeStyle = tone(p.sub, k);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(hip.x - 2.6, hip.y + 1);
      ctx.lineTo(knee.x - 2.4, knee.y);
      ctx.lineTo(ank.x - 2, ank.y - 2);
      ctx.stroke();
      break;
    case 'wraplegs':
      sphere(ctx, knee.x, knee.y, 3.4, 3.2, tone(p.sub, k));
      ctx.strokeStyle = tone(p.dark, k);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const a = lerp(knee, ank, 0.3 + i * 0.16);
        ctx.beginPath();
        ctx.moveTo(a.x - 3, a.y);
        ctx.lineTo(a.x + 3, a.y + 0.6);
        ctx.stroke();
      }
      break;
    case 'weblegs':
      ctx.strokeStyle = tone(p.sub, k);
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 0.6;
      for (const u of [0.25, 0.55, 0.85]) {
        const a = lerp(hip, knee, u);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3.2, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y + 1);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(ank.x, ank.y - 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    case 'torn': {
      // Torn teal trousers end in a jagged hem above the knee.
      const a = lerp(hip, knee, 0.88);
      const dx = knee.x - hip.x;
      const dy = knee.y - hip.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        const t = i / 2;
        const px = a.x + nx * t * 4.4;
        const py = a.y + ny * t * 4.4;
        const jag = i % 2 === 0 ? 2.6 : -0.6;
        ctx.lineTo(px + (dx / len) * jag, py + (dy / len) * jag);
      }
      ctx.lineTo(hip.x + nx * 4.6, hip.y + ny * 4.6);
      ctx.lineTo(hip.x - nx * 4.6, hip.y - ny * 4.6);
      ctx.closePath();
      ctx.fillStyle = tone(p.main, k);
      ctx.fill();
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/** The foot in the frame used by hero.ts / heroFront.ts. */
export function drawStyleFoot(ctx: CanvasRenderingContext2D, d: StyleDef, view: View, back: boolean): void {
  const p = d.palette;
  const k = back ? -0.12 : 0;
  const upper = d.kind === 'sneaker' ? '#F2F4F8' : d.kind === 'barefoot' || d.kind === 'torn' ? p.skin ?? SKIN : p.main;
  const sole = d.kind === 'sneaker' ? '#C5CCD8' : d.kind === 'torn' ? p.skinShade ?? tone(p.skin ?? SKIN, -0.3) : p.dark;
  const trim = d.kind === 'sneaker' ? '#D94A4A' : d.kind === 'captainboot' ? '#fff' : p.sub;
  const boot = ['plates', 'trousers', 'bodysuit', 'wraplegs', 'weblegs'].includes(d.kind);
  const col = tone(upper, k);
  if (view === 'side') {
    // Sole
    rr(ctx, -4.2, -0.2, 13.6, 2.6, 1.3);
    fillEdge(ctx, tone(sole, k), 0.7);
    // Upper
    ctx.beginPath();
    ctx.moveTo(-3.6, 0);
    ctx.lineTo(-3.6, boot ? -7.6 : -3.4);
    ctx.lineTo(1.6, boot ? -7.6 : -3.6);
    ctx.lineTo(3.4, -3.8);
    ctx.quadraticCurveTo(9.8, -3.4, 9.8, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -8, 0, 1);
    g.addColorStop(0, tone(col, 0.25));
    g.addColorStop(0.6, col);
    g.addColorStop(1, tone(col, -0.3));
    ctx.fillStyle = g;
    ctx.fill();
    edge(ctx, col, 0.85);
    // Trim
    ctx.fillStyle = tone(trim, k);
    if (boot) {
      rr(ctx, -3.8, -8.6, 5.6, 2.4, 1);
      fillEdge(ctx, tone(trim, k), 0.7);
    } else if (d.kind === 'sneaker') {
      ctx.beginPath();
      ctx.moveTo(-1, -3.4);
      ctx.lineTo(5.4, -3.8);
      ctx.lineTo(5.8, -2.2);
      ctx.lineTo(-1, -1.8);
      ctx.closePath();
      ctx.fill();
      rr(ctx, 6.4, -3.2, 3.2, 3, 1.4);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    if (d.kind === 'trousers') {
      rr(ctx, -3.2, -6, 3.2, 1.4, 0.6);
      ctx.fillStyle = p.sub;
      ctx.fill();
    }
    spec(ctx, 4.6, -2.4, 2.4, 0.8, d.kind === 'sneaker' ? 0.5 : 0.65);
  } else {
    // Front view: a rounded toe seen from the front.
    ctx.beginPath();
    ctx.ellipse(0, 1.2, 5, 1.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = tone(sole, k);
    ctx.fill();
    sphere(ctx, 0, -0.4, 4.8, 2.9, col);
    if (d.kind === 'sneaker') {
      ctx.fillStyle = '#D94A4A';
      ctx.fillRect(-3.4, -1.6, 6.8, 0.9);
    } else if (boot) {
      rr(ctx, -4.4, -4.2, 8.8, 2.2, 1);
      fillEdge(ctx, tone(trim, k), 0.6);
    }
    spec(ctx, -1.8, -1.9, 1.6, 0.7, 0.6);
  }
}

// ===========================================================================
// ICONS (cards in the styles screen, pickups on platforms)
// ===========================================================================

/** Draws one part alone, centered at 0,0, about 36 units across. */
export function drawStyleIcon(ctx: CanvasRenderingContext2D, d: StyleDef): void {
  ctx.save();
  switch (d.slot) {
    case 'head': {
      ctx.translate(0, 2);
      ctx.scale(1.35, 1.35);
      const skin = skinFor(d, SKIN, '#D79C72').skin;
      sphere(ctx, 0, 0, 10.6, 10.8, skin);
      ctx.beginPath();
      ctx.ellipse(0, -3, 10.6, 8, 0, Math.PI, 0);
      ctx.fillStyle = '#3E2C22';
      ctx.fill();
      drawStyleHead(ctx, d, 'front', 0.4);
      break;
    }
    case 'torso': {
      ctx.translate(0, 14);
      ctx.scale(1.25, 1.25);
      const len = 21;
      const hw = 9.4;
      drawStyleBack(ctx, d, len, hw, 'front', 0.6);
      ctx.beginPath();
      ctx.moveTo(-hw, -len + 3);
      ctx.quadraticCurveTo(-hw, -len - 0.6, -5, -len - 0.6);
      ctx.lineTo(5, -len - 0.6);
      ctx.quadraticCurveTo(hw, -len - 0.6, hw, -len + 3);
      ctx.lineTo(hw - 1.6, 0.5);
      ctx.quadraticCurveTo(0, 2, -hw + 1.6, 0.5);
      ctx.closePath();
      ctx.fillStyle = bodyGradient(ctx, torsoColor(d), -hw, hw);
      ctx.fill();
      ctx.save();
      ctx.clip();
      drawStyleTorso(ctx, d, len, hw, 'front');
      ctx.restore();
      edge(ctx, torsoColor(d), 0.9);
      break;
    }
    case 'arms': {
      ctx.scale(1.3, 1.3);
      const l: Limb3 = [{ x: -7, y: -12 }, { x: 0, y: -1 }, { x: 7, y: 11 }];
      const w = armScale(d);
      limb3d(ctx, l[0], l[1], l[2], [6 * w, 5 * w, 4.3 * w], armColor(d), 1);
      drawStyleArm(ctx, d, l, false);
      sphere(ctx, l[2].x + 1, l[2].y + 1.4, 3.6, 3.2, handColor(d, SKIN));
      break;
    }
    case 'legs': {
      ctx.translate(0, 2);
      ctx.scale(1.22, 1.22);
      const c = legColors(d);
      for (const s of [-1, 1]) {
        const l: Limb3 = [{ x: s * 4.6, y: -15 }, { x: s * 4.9, y: -5.6 }, { x: s * 5, y: 3 }];
        limb3d(ctx, l[0], l[1], l[2], [7.8, 6.6, 5.4], c.thigh, s < 0 ? 1 : -1, c.shin);
        drawStyleLeg(ctx, d, l, false);
        ctx.save();
        ctx.translate(s * 5.2, 4.4);
        if (d.set !== 'starter') drawStyleFoot(ctx, d, 'front', false);
        ctx.restore();
      }
      break;
    }
    case 'feet': {
      ctx.translate(0, 4);
      ctx.scale(2.3, 2.3);
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * 5.2, 0);
        drawStyleFoot(ctx, d, 'front', false);
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
}
