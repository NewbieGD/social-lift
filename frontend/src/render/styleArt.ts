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
      // Knitted cap pulled over the whole top of the head: the band sits just above the brows,
      // the dome covers the hair, a pompom on top.
      const yb = side ? -6.6 : -7.2; // bottom of the folded band
      const bh = 4.2;
      const hw = rx + 1.8;
      ctx.beginPath();
      ctx.moveTo(cx - hw + 0.4, yb - bh + 0.4);
      ctx.bezierCurveTo(cx - hw - 0.6, -21, cx + hw + 0.6, -21, cx + hw - 0.4, yb - bh + 0.4);
      ctx.closePath();
      const g = ctx.createRadialGradient(cx - 3.4, -16, 1, cx, -12, 16);
      g.addColorStop(0, tone(p.sub, 0.34));
      g.addColorStop(0.5, p.sub);
      g.addColorStop(1, tone(p.sub, -0.34));
      ctx.fillStyle = g;
      ctx.fill();
      edge(ctx, p.sub);
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 0.7;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 1.5, -20);
        ctx.quadraticCurveTo(cx + i * 3.4, -14, cx + i * 3.2, yb - bh);
        ctx.stroke();
      }
      ctx.restore();
      // Folded band with ribbing.
      rr(ctx, cx - hw - 0.6, yb - bh, hw * 2 + 1.2, bh, 2);
      const bg = ctx.createLinearGradient(0, yb - bh, 0, yb);
      bg.addColorStop(0, '#F4F8FD');
      bg.addColorStop(1, '#BFCCDD');
      ctx.fillStyle = bg;
      ctx.fill();
      edge(ctx, '#BFCCDD');
      ctx.strokeStyle = 'rgba(70,90,120,0.45)';
      ctx.lineWidth = 0.6;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 2.3, yb - bh + 0.4);
        ctx.lineTo(cx + i * 2.3, yb - 0.4);
        ctx.stroke();
      }
      sphere(ctx, cx, -20.4, 2.7, 2.5, p.accent);
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
    case 'seraphHelm': {
      // A pearl helm with a face window, a gold visor over the eyes, little wings at the temples
      // and a halo that floats above.
      ctx.beginPath();
      ctx.ellipse(cx - (side ? 1.2 : 0), -0.8, rx + 2, 12.6, 0, 0, Math.PI * 2);
      if (side) {
        ctx.moveTo(cx + 0.2, -4.4);
        ctx.quadraticCurveTo(cx + rx + 2.2, -5.6, cx + rx + 2.6, -1);
        ctx.quadraticCurveTo(cx + rx + 3, 6, cx + 4, 11.6);
        ctx.quadraticCurveTo(cx - 1.4, 9, cx + 0.2, 2);
        ctx.closePath();
      } else {
        ctx.moveTo(-8.8, -4.6);
        ctx.quadraticCurveTo(0, -6.8, 8.8, -4.6);
        ctx.quadraticCurveTo(10.2, 4, 5.6, 10.8);
        ctx.quadraticCurveTo(0, 13, -5.6, 10.8);
        ctx.quadraticCurveTo(-10.2, 4, -8.8, -4.6);
        ctx.closePath();
      }
      const g = ctx.createRadialGradient(cx - 4, -9, 1, cx, 0, 17);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.5, p.main);
      g.addColorStop(1, tone(p.main, -0.28));
      ctx.fillStyle = g;
      ctx.fill('evenodd');
      edge(ctx, p.main, 0.9);
      // Gold crest line over the top.
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - (side ? 8 : 0), -11.6);
      ctx.quadraticCurveTo(cx + (side ? 2 : 0), -14.6, cx + (side ? 9 : 0), -9);
      ctx.stroke();
      // Gold visor band with glowing cyan slits.
      ctx.beginPath();
      if (side) {
        ctx.moveTo(cx + 0.2, -4.6);
        ctx.lineTo(cx + rx + 2.4, -5.2);
        ctx.lineTo(cx + rx + 2.6, 1.2);
        ctx.lineTo(cx + 0.2, 1.6);
      } else {
        ctx.moveTo(-9, -4.8);
        ctx.quadraticCurveTo(0, -6.8, 9, -4.8);
        ctx.lineTo(9.2, 1.4);
        ctx.quadraticCurveTo(0, 2.8, -9.2, 1.4);
      }
      ctx.closePath();
      const vg = ctx.createLinearGradient(0, -6, 0, 2);
      vg.addColorStop(0, tone(p.sub, 0.35));
      vg.addColorStop(1, tone(p.sub, -0.25));
      ctx.fillStyle = vg;
      ctx.fill();
      edge(ctx, p.sub, 0.8);
      ctx.fillStyle = p.accent;
      for (const e of eyes(view)) {
        ctx.beginPath();
        ctx.moveTo(e.x - e.r - 0.4, -2.2);
        ctx.lineTo(e.x + e.r + 0.8, -3);
        ctx.lineTo(e.x + e.r + 0.2, -0.2);
        ctx.lineTo(e.x - e.r, 0);
        ctx.closePath();
        ctx.fill();
        glowDot(ctx, e.x, -1.4, 5, p.accent, 0.6);
      }
      // Little feathered wings at the temples.
      for (const sd of side ? [-1] : [-1, 1]) {
        ctx.save();
        ctx.translate(side ? cx - rx - 1.2 : sd * (rx + 1.4), -3.4);
        ctx.scale(side ? 1 : -sd, 1);
        for (let i = 0; i < 3; i++) {
          ctx.save();
          ctx.rotate(-0.5 + i * 0.42);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(-3 - i * 0.6, -1.4, -8 + i * 1.2, -1.2 + i * 0.3);
          ctx.quadraticCurveTo(-3, 1.6, 0, 1);
          ctx.closePath();
          ctx.fillStyle = i === 1 ? p.main : tone(p.main, -0.06);
          ctx.fill();
          edge(ctx, p.sub, 0.5);
          ctx.restore();
        }
        ctx.restore();
      }
      // The halo.
      const hy = -19.5 + Math.sin(t * 2) * 0.5;
      glowDot(ctx, cx, hy, 14, p.sub, 0.55);
      ctx.strokeStyle = tone(p.sub, 0.3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, hy, 8.4, 2.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#FFF7D6';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(cx, hy, 8.4, 2.4, 0, Math.PI * 1.05, Math.PI * 1.9);
      ctx.stroke();
      break;
    }
    case 'legionHead': {
      // A chrome skull: a metal cranium, cheek plates, a grille of teeth and glowing red eyes.
      ctx.beginPath();
      ctx.ellipse(cx - (side ? 1 : 0), -0.4, rx + 2.2, 13.4, 0, 0, Math.PI * 2);
      const sg = ctx.createRadialGradient(cx - 4, -9, 1, cx, 0, 18);
      sg.addColorStop(0, '#FFFFFF');
      sg.addColorStop(0.35, p.main);
      sg.addColorStop(1, tone(p.main, -0.42));
      ctx.fillStyle = sg;
      ctx.fill();
      edge(ctx, p.sub, 1);
      // Panel seams on the cranium.
      ctx.strokeStyle = tone(p.main, -0.5);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - (side ? 7 : 9), -9);
      ctx.quadraticCurveTo(cx, -13.4, cx + (side ? 8 : 9), -8);
      ctx.moveTo(cx - 1, -13.2);
      ctx.lineTo(cx + 1, -6);
      ctx.stroke();
      // Face plate: darker steel, from the brow down to the jaw.
      ctx.beginPath();
      if (side) {
        ctx.moveTo(cx + 0.2, -5.2);
        ctx.lineTo(cx + rx + 2.6, -5.4);
        ctx.quadraticCurveTo(cx + rx + 3.4, 4, cx + 4.6, 11.8);
        ctx.quadraticCurveTo(cx - 0.6, 10.4, cx + 0.2, 1);
      } else {
        ctx.moveTo(-8.6, -5.4);
        ctx.quadraticCurveTo(0, -7.6, 8.6, -5.4);
        ctx.quadraticCurveTo(9.6, 5, 4.8, 11.6);
        ctx.quadraticCurveTo(0, 13.2, -4.8, 11.6);
        ctx.quadraticCurveTo(-9.6, 5, -8.6, -5.4);
      }
      ctx.closePath();
      const fg = ctx.createLinearGradient(0, -6, 0, 12);
      fg.addColorStop(0, tone(p.sub, 0.45));
      fg.addColorStop(1, tone(p.sub, -0.25));
      ctx.fillStyle = fg;
      ctx.fill();
      edge(ctx, p.dark, 0.8);
      // Brow ridge and dark eye sockets with a burning red eye.
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      for (const e of eyes(view)) {
        ctx.beginPath();
        ctx.moveTo(e.x - e.r - 1.4, -4.2);
        ctx.lineTo(e.x + e.r + 1.2, -3.2);
        ctx.stroke();
        ctx.fillStyle = '#0A0B0F';
        ctx.beginPath();
        ctx.ellipse(e.x, -0.8, e.r + 1.2, e.r + 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
        glowDot(ctx, e.x, -0.8, 8, p.accent, 0.95);
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(e.x, -0.8, e.r * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFE0D8';
        ctx.beginPath();
        ctx.arc(e.x, -0.8, e.r * 0.26, 0, Math.PI * 2);
        ctx.fill();
      }
      // Nasal cavity.
      ctx.fillStyle = '#0A0B0F';
      ctx.beginPath();
      const nx = side ? cx + rx + 1.2 : 0;
      ctx.moveTo(nx - 1.3, 4);
      ctx.lineTo(nx + 1.3, 4);
      ctx.lineTo(nx, 1.6);
      ctx.closePath();
      ctx.fill();
      // Teeth grille.
      const mx0 = side ? cx + 1.2 : -4.6;
      const mx1 = side ? cx + rx + 2 : 4.6;
      rr(ctx, mx0, 6.4, mx1 - mx0, 3.6, 0.8);
      ctx.fillStyle = '#0A0B0F';
      ctx.fill();
      ctx.strokeStyle = tone(p.main, -0.1);
      ctx.lineWidth = 0.6;
      for (let x = mx0 + 1; x < mx1; x += 1.5) {
        ctx.beginPath();
        ctx.moveTo(x, 6.6);
        ctx.lineTo(x, 9.8);
        ctx.stroke();
      }
      // A small red status light at the temple.
      glowDot(ctx, side ? cx - 3 : -9.2, -3, 4, p.accent, 0.7);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(side ? cx - 3 : -9.2, -3, 0.7, 0, Math.PI * 2);
      ctx.fill();
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
    case 'seraphArmor':
      return d.palette.main;
    case 'legionArmor':
      return d.palette.sub;
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
    case 'seraphArmor': {
      // Blue undersuit at the sides, pearl chest plates with gold ridges, a cyan crystal.
      ctx.fillStyle = p.dark;
      for (const sd of [-1, 1]) {
        ctx.fillRect(mid + sd * (hw - 2.4) - 1.2, -len + 1, 2.4, len - 3);
      }
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(mid + sd * 0.6, -len + 3);
        ctx.quadraticCurveTo(mid + sd * (hw - 0.6), -len + 1.4, mid + sd * (hw - 1.6), -len * 0.5);
        ctx.quadraticCurveTo(mid + sd * (hw * 0.5), -len * 0.36, mid + sd * 0.6, -len * 0.42);
        ctx.closePath();
        ctx.fillStyle = tone(p.main, sd < 0 ? 0.1 : -0.04);
        ctx.fill();
        ctx.strokeStyle = p.sub;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      // Feather ridges on the abdomen.
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) {
        const y = -len * 0.34 + i * 3.4;
        ctx.beginPath();
        ctx.moveTo(mid - hw * 0.62, y + 1.2);
        ctx.quadraticCurveTo(mid, y - 0.8, mid + hw * 0.62, y + 1.2);
        ctx.stroke();
      }
      // The crystal.
      const gy = -len * 0.62;
      glowDot(ctx, mid, gy, 7, p.accent, 0.8);
      ctx.beginPath();
      ctx.moveTo(mid, gy - 3.4);
      ctx.lineTo(mid + 2.2, gy);
      ctx.lineTo(mid, gy + 3.4);
      ctx.lineTo(mid - 2.2, gy);
      ctx.closePath();
      const cg = ctx.createLinearGradient(mid - 2, gy - 3, mid + 2, gy + 3);
      cg.addColorStop(0, '#FFFFFF');
      cg.addColorStop(0.5, p.accent);
      cg.addColorStop(1, '#3FB8E0');
      ctx.fillStyle = cg;
      ctx.fill();
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // Gold collar and a belt with a pair of wing marks.
      ctx.fillStyle = p.sub;
      ctx.fillRect(-hw - 1, -len, hw * 2 + 2, 2);
      rr(ctx, -hw - 1, -5.4, hw * 2 + 2, 5.4, 1.2);
      ctx.fillStyle = bodyGradient(ctx, p.sub, -hw, hw);
      ctx.fill();
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 0.7;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(mid + sd * 0.8, -2.8);
        ctx.quadraticCurveTo(mid + sd * 3.6, -4.8, mid + sd * 5.6, -3.4);
        ctx.stroke();
      }
      break;
    }
    case 'legionArmor': {
      // A ribcage of chrome plates over dark steel, a glowing core, pistons at the sides.
      ctx.fillStyle = p.dark;
      ctx.fillRect(-hw + 1, -len + 1, hw * 2 - 2, len - 2);
      for (let i = 0; i < 4; i++) {
        const y = -len + 5 + i * 3.6;
        for (const sd of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(mid + sd * 1.2, y);
          ctx.quadraticCurveTo(mid + sd * (hw - 0.6), y - 1.4, mid + sd * (hw - 1.4), y + 2.4);
          ctx.lineWidth = 1.9;
          ctx.strokeStyle = tone(p.main, i % 2 ? -0.1 : 0.1);
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.lineWidth = 0.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.moveTo(mid + sd * 2, y - 0.5);
          ctx.quadraticCurveTo(mid + sd * (hw - 1.4), y - 1.8, mid + sd * (hw - 2.4), y + 1.4);
          ctx.stroke();
        }
      }
      // Sternum and the glowing core.
      ctx.fillStyle = tone(p.main, -0.2);
      ctx.fillRect(mid - 1, -len + 2, 2, len * 0.62);
      const gy = -len * 0.5;
      glowDot(ctx, mid, gy, 9, p.accent, 0.9);
      ctx.beginPath();
      ctx.arc(mid, gy, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = '#1B1F26';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mid, gy, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mid, gy, 0.9, 0, Math.PI * 2);
      ctx.fillStyle = '#FFE0D8';
      ctx.fill();
      // Hydraulic pistons along both sides.
      for (const sd of [-1, 1]) {
        ctx.strokeStyle = '#E8ECF2';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(mid + sd * (hw - 1.6), -len + 3);
        ctx.lineTo(mid + sd * (hw - 1.6), -4);
        ctx.stroke();
        ctx.strokeStyle = p.dark;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(mid + sd * (hw - 1.6), -len * 0.6);
        ctx.lineTo(mid + sd * (hw - 1.6), -4);
        ctx.stroke();
      }
      // A warning-striped belt plate.
      rr(ctx, -hw - 1, -5.2, hw * 2 + 2, 5.2, 1);
      ctx.fillStyle = p.dark;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = p.accent;
      for (let x = -hw - 4; x < hw + 4; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x, -0.2);
        ctx.lineTo(x + 2, -5.2);
        ctx.lineTo(x + 3.4, -5.2);
        ctx.lineTo(x + 1.4, -0.2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
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

/** True when this arm style is the premium gauntlet (gold pauldron, cyan rings). */
export function isSeraphArm(d: StyleDef | undefined): boolean {
  return d?.kind === 'seraphGauntlet';
}

export function armScale(d: StyleDef | undefined): number {
  return d?.kind === 'big' ? 1.34 : 1;
}

export function handColor(d: StyleDef | undefined, skin: string): string {
  if (!d) return skin;
  switch (d.kind) {
    case 'gauntlet':
    case 'seraphGauntlet':
    case 'legionArms':
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
    case 'legionArms': {
      // Mechanical arms: a steel shoulder joint, a piston along the forearm, chrome plates and
      // a red light at the elbow and the wrist.
      sphere(ctx, l[0].x, l[0].y + 0.4, 3.9, 3.6, tone(p.sub, k));
      glowDot(ctx, l[0].x, l[0].y + 0.4, 4, p.accent, 0.5);
      limb3d(ctx, lerp(l[0], el, 0.2), lerp(l[0], el, 0.55), lerp(l[0], el, 0.95), [5.4, 5.2, 4.8], tone(p.main, k - 0.05), 1);
      sphere(ctx, el.x, el.y, 3.4, 3.2, tone(p.sub, k));
      glowDot(ctx, el.x, el.y, 5, p.accent, 0.8);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(el.x, el.y, 0.9, 0, Math.PI * 2);
      ctx.fill();
      limb3d(ctx, lerp(el, wr, 0.2), lerp(el, wr, 0.6), lerp(el, wr, 0.95), [5, 4.8, 4.4], tone(p.main, k), 1);
      // The piston: a thin chrome rod beside a dark cylinder.
      ctx.strokeStyle = '#F2F5FA';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(lerp(el, wr, 0.15).x + 2.4, lerp(el, wr, 0.15).y);
      ctx.lineTo(lerp(el, wr, 0.8).x + 2.4, lerp(el, wr, 0.8).y);
      ctx.stroke();
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(lerp(el, wr, 0.4).x + 2.4, lerp(el, wr, 0.4).y);
      ctx.lineTo(lerp(el, wr, 0.8).x + 2.4, lerp(el, wr, 0.8).y);
      ctx.stroke();
      const a = lerp(el, wr, 0.9);
      glowDot(ctx, a.x, a.y, 4, p.accent, 0.6);
      ctx.beginPath();
      ctx.arc(a.x, a.y, 2.9, 0, Math.PI * 2);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      break;
    }
    case 'seraphGauntlet': {
      // A gold pauldron on the shoulder, a long gold bracer and glowing cyan rings.
      sphere(ctx, l[0].x, l[0].y + 0.4, 3.9, 3.4, tone(p.sub, k));
      ctx.strokeStyle = tone(p.main, k);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(l[0].x, l[0].y + 0.4, 2.2, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      limb3d(ctx, lerp(el, wr, 0.3), lerp(el, wr, 0.62), wr, [5.7, 5.5, 5], tone(p.sub, k), 1);
      for (const u of [0.34, 0.8]) {
        const a = lerp(el, wr, u);
        glowDot(ctx, a.x, a.y, 4.4, p.accent, 0.6);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 2.9, 0, Math.PI * 2);
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      break;
    }
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
    case 'seraphGreaves':
      return { thigh: p.main, shin: p.main };
    case 'legionLegs':
      return { thigh: p.sub, shin: p.main };
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
    case 'legionLegs': {
      // Piston legs: a bare hydraulic knee with a glowing red joint and a chrome shin guard
      // that has a red light strip.
      limb3d(ctx, lerp(knee, ank, 0.2), lerp(knee, ank, 0.55), lerp(knee, ank, 0.95), [6, 5.8, 5.2], tone(p.main, k), 1);
      sphere(ctx, knee.x, knee.y, 3.5, 3.5, tone(p.sub, k));
      glowDot(ctx, knee.x, knee.y, 5.4, p.accent, 0.85);
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(knee.x, knee.y, 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#F2F5FA';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(knee.x + 2.8, knee.y - 3.4);
      ctx.lineTo(knee.x + 2.8, knee.y + 1.4);
      ctx.stroke();
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(lerp(knee, ank, 0.3).x, lerp(knee, ank, 0.3).y);
      ctx.lineTo(lerp(knee, ank, 0.8).x, lerp(knee, ank, 0.8).y);
      ctx.stroke();
      break;
    }
    case 'seraphGreaves': {
      // Gold knee guards with a feather fin and long gold greaves.
      limb3d(ctx, lerp(knee, ank, 0.18), lerp(knee, ank, 0.55), lerp(knee, ank, 0.92), [6.2, 6, 5.2], tone(p.sub, k), 1);
      sphere(ctx, knee.x, knee.y, 3.7, 3.7, tone(p.sub, k));
      ctx.beginPath();
      ctx.moveTo(knee.x - 0.8, knee.y - 1);
      ctx.quadraticCurveTo(knee.x - 4.6, knee.y - 3.6, knee.x - 5.6, knee.y - 1.2);
      ctx.quadraticCurveTo(knee.x - 3, knee.y, knee.x - 0.8, knee.y + 1);
      ctx.closePath();
      ctx.fillStyle = tone(p.main, k);
      ctx.fill();
      edge(ctx, p.sub, 0.5);
      glowDot(ctx, knee.x, knee.y, 4.4, p.accent, 0.4);
      ctx.strokeStyle = tone(p.accent, k);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(lerp(knee, ank, 0.3).x, lerp(knee, ank, 0.3).y);
      ctx.lineTo(lerp(knee, ank, 0.8).x, lerp(knee, ank, 0.8).y);
      ctx.stroke();
      break;
    }
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
  const boot = ['plates', 'trousers', 'bodysuit', 'wraplegs', 'weblegs', 'seraphGreaves', 'legionLegs'].includes(d.kind);
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
    if (d.kind === 'legionLegs') {
      // The sole glows red, like heat from the hydraulics.
      glowDot(ctx, 0, -0.6, 7, p.accent, 0.55);
    }
    if (d.kind === 'seraphGreaves') {
      // Winged boots: a feather fan at the ankle pointing back.
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(-3.4, -6.4);
        ctx.rotate(Math.PI + 0.5 - i * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(3, -1.4, 7 - i * 0.8, -0.6);
        ctx.quadraticCurveTo(3.4, 1.4, 0, 1);
        ctx.closePath();
        ctx.fillStyle = i === 1 ? '#FFFFFF' : p.main;
        ctx.fill();
        edge(ctx, p.sub, 0.5);
        ctx.restore();
      }
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
      if (d.kind === 'seraphGreaves') {
        for (const sd of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sd * 4.4, -3.2);
          ctx.quadraticCurveTo(sd * 8, -5.2, sd * 8.6, -2.4);
          ctx.quadraticCurveTo(sd * 6.4, -2.6, sd * 4.4, -2);
          ctx.closePath();
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          edge(ctx, p.sub, 0.4);
        }
      }
    }
    spec(ctx, -1.8, -1.9, 1.6, 0.7, 0.6);
  }
}

// ===========================================================================
// FLASHLIGHT (the premium set has one of its own) and the premium glow and wings
// ===========================================================================

/**
 * The held light of a style (it replaces the flashlight in the hand). Frame like torch3d: the
 * grip is at 0,0 and the light points along +x; `lensTilt` is how wide the lens is seen (0..3.4).
 * Each kind draws its own object: a golden lantern, a plasma lantern, a phone, a wooden torch,
 * a glowing blade, a hand with a fireball, a jar of fireflies.
 */
export function drawStyleTorch(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, lensTilt: number, t: number): void {
  switch (d.kind) {
    case 'legionTorch':
      return legionLantern(ctx, d, len, lensTilt, t);
    case 'phoneTorch':
      return phoneTorch(ctx, d, len, t);
    case 'woodTorch':
      return woodTorch(ctx, d, len, t);
    case 'saberTorch':
      return saberTorch(ctx, d, len, t);
    case 'fireTorch':
      return fireTorch(ctx, d, len, t);
    case 'jarTorch':
      return jarTorch(ctx, d, len, t);
    default:
      return seraphLantern(ctx, d, len, lensTilt, t);
  }
}

function flame(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, t: number, hot = '#FFF3B0', mid = '#FFB02E', out = '#E8420F'): void {
  const sway = Math.sin(t * 11 + x) * h * 0.08;
  glowDot(ctx, x, y - h * 0.4, h * 2.2, '#FF9A2E', 0.55 + 0.12 * Math.sin(t * 17));
  for (const [k, c] of [[1, out], [0.72, mid], [0.4, hot]] as [number, string][]) {
    ctx.beginPath();
    ctx.moveTo(x - h * 0.34 * k, y);
    ctx.quadraticCurveTo(x - h * 0.4 * k, y - h * 0.5 * k, x + sway * k, y - h * k * (1 + 0.1 * Math.sin(t * 13)));
    ctx.quadraticCurveTo(x + h * 0.4 * k, y - h * 0.5 * k, x + h * 0.34 * k, y);
    ctx.quadraticCurveTo(x, y + h * 0.18 * k, x - h * 0.34 * k, y);
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.fill();
  }
}

/** A phone held like a flashlight: a dark slab, a lit screen and a camera with a bright LED. */
function phoneTorch(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, t: number): void {
  const p = d.palette;
  const L = len + 2;
  rr(ctx, -3, -3.4, L, 6.8, 1.6);
  const g = ctx.createLinearGradient(0, -3.4, 0, 3.4);
  g.addColorStop(0, tone(p.main, 0.3));
  g.addColorStop(1, tone(p.main, -0.2));
  ctx.fillStyle = g;
  ctx.fill();
  edge(ctx, p.dark, 0.7);
  // The screen with a flashlight icon.
  rr(ctx, -2.2, -2.6, L - 5.6, 5.2, 1);
  ctx.fillStyle = '#10151E';
  ctx.fill();
  ctx.fillStyle = 'rgba(120,180,255,0.35)';
  ctx.fillRect(-1.4, -2.4, L - 7.4, 1.4);
  ctx.fillStyle = '#EAF3FF';
  ctx.beginPath();
  ctx.moveTo(1, -1);
  ctx.lineTo(3.6, -1.6);
  ctx.lineTo(3.6, 1.6);
  ctx.lineTo(1, 1);
  ctx.closePath();
  ctx.fill();
  // The camera bump and the LED.
  const cx = L - 3.6;
  rr(ctx, cx - 1.6, -2.6, 3.8, 5.2, 1);
  ctx.fillStyle = p.dark;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 0.3, -0.9, 1.1, 0, Math.PI * 2);
  ctx.fillStyle = '#1B2530';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 0.3, 1.2, 0.9, 0, Math.PI * 2);
  ctx.fillStyle = p.accent;
  ctx.fill();
  glowDot(ctx, cx + 0.3, 1.2, 9 + Math.sin(t * 6), '#FFFFFF', 0.85);
}

/** A wooden torch: a stick with a wrapped head and a living flame. */
function woodTorch(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, t: number): void {
  const p = d.palette;
  const L = len + 2;
  const g = ctx.createLinearGradient(0, -1.8, 0, 1.8);
  g.addColorStop(0, p.sub);
  g.addColorStop(0.5, p.main);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-4, -1.6, L - 3, 3.2, 1.4);
  ctx.fill();
  edge(ctx, p.dark, 0.6);
  ctx.strokeStyle = 'rgba(40,24,12,0.5)';
  ctx.lineWidth = 0.4;
  for (let x = -2; x < L - 6; x += 2.6) {
    ctx.beginPath();
    ctx.moveTo(x, -1.4);
    ctx.lineTo(x + 1, 1.4);
    ctx.stroke();
  }
  // The wrapped head, black with pitch.
  ctx.fillStyle = '#2A1B12';
  ctx.beginPath();
  ctx.moveTo(L - 6, -1.8);
  ctx.quadraticCurveTo(L - 1, -4.6, L + 2, -3);
  ctx.lineTo(L + 2, 3);
  ctx.quadraticCurveTo(L - 1, 4.6, L - 6, 1.8);
  ctx.closePath();
  ctx.fill();
  edge(ctx, '#2A1B12', 0.5);
  ctx.strokeStyle = '#C9A06A';
  ctx.lineWidth = 0.6;
  for (const x of [L - 4, L - 1.5]) {
    ctx.beginPath();
    ctx.moveTo(x, -3.4);
    ctx.lineTo(x, 3.4);
    ctx.stroke();
  }
  // The flame points forward along the light (the frame's +x), shown as a fire on the tip.
  ctx.save();
  ctx.translate(L + 1, -0.6);
  ctx.rotate(Math.PI / 4);
  flame(ctx, 0, 0, 8.5, t);
  ctx.restore();
}

/** An energy blade: a metal hilt and a long glowing blade of light. */
function saberTorch(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, t: number): void {
  const p = d.palette;
  const hilt = len * 0.62;
  const g = ctx.createLinearGradient(0, -2, 0, 2);
  g.addColorStop(0, '#F2F5FA');
  g.addColorStop(0.5, p.main);
  g.addColorStop(1, tone(p.main, -0.4));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-4.6, -2, hilt, 4, 1.2);
  ctx.fill();
  edge(ctx, p.sub, 0.6);
  ctx.fillStyle = p.sub;
  for (const x of [-2.6, -0.4, 1.8]) ctx.fillRect(x, -2, 0.9, 4);
  ctx.fillStyle = '#E8392F';
  ctx.fillRect(hilt - 6.6, -2.4, 1.6, 1);
  // The emitter.
  ctx.fillStyle = p.sub;
  ctx.fillRect(hilt - 4.6, -2.6, 2.4, 5.2);
  // The blade.
  const bl = len * 1.25 + 9;
  const x0 = hilt - 2.2;
  const pulse = 0.88 + 0.12 * Math.sin(t * 9);
  glowDot(ctx, x0 + bl * 0.5, 0, bl * 0.75, p.accent, 0.5 * pulse);
  ctx.beginPath();
  ctx.roundRect(x0, -2.1, bl, 4.2, 2.1);
  ctx.fillStyle = `rgba(87,214,255,${0.55 * pulse})`;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x0, -1.1, bl, 2.2, 1.1);
  ctx.fillStyle = '#F2FDFF';
  ctx.fill();
}

/** A hand holding a ball of fire: a leather glove with curled fingers, flames dancing above it. */
function fireTorch(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, t: number): void {
  const p = d.palette;
  const bx = len * 0.8 + 3;
  // The cuff and the back of the hand.
  rr(ctx, -4.6, -2.6, 5, 5.2, 1.4);
  ctx.fillStyle = p.dark;
  ctx.fill();
  const hg = ctx.createLinearGradient(0, -3.4, 0, 3.4);
  hg.addColorStop(0, tone(p.sub, 0.2));
  hg.addColorStop(1, tone(p.main, -0.1));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.quadraticCurveTo(bx * 0.5, -4.4, bx - 1, -2.4);
  ctx.lineTo(bx - 1, 2.4);
  ctx.quadraticCurveTo(bx * 0.5, 4.4, 0, 3);
  ctx.closePath();
  ctx.fill();
  edge(ctx, p.dark, 0.6);
  // Fingers curled around the ball.
  for (let i = 0; i < 4; i++) {
    const y = -2.8 + i * 1.9;
    ctx.beginPath();
    ctx.ellipse(bx - 0.6, y, 2.3, 1, 0, 0, Math.PI * 2);
    ctx.fillStyle = tone(p.sub, i % 2 ? 0 : 0.12);
    ctx.fill();
    edge(ctx, p.dark, 0.4);
  }
  // The ball of fire: a glowing sphere with licks of flame.
  const r = 4.4 + 0.3 * Math.sin(t * 8);
  const cx = bx + 3.2;
  glowDot(ctx, cx, 0, r * 3.4, '#FF8A1F', 0.7);
  const og = ctx.createRadialGradient(cx - 1, -1.2, 0.3, cx, 0, r);
  og.addColorStop(0, '#FFFBE0');
  og.addColorStop(0.35, '#FFC24A');
  og.addColorStop(0.75, '#FF6A1A');
  og.addColorStop(1, '#C8300B');
  ctx.beginPath();
  ctx.arc(cx, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = og;
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + t * 2.4;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
    ctx.rotate(a + Math.PI / 2);
    flame(ctx, 0, 0, 3.4 + Math.sin(t * 9 + i) * 0.8, t + i);
    ctx.restore();
  }
}

/** A jar of fireflies: glass, a wire handle and glowing dots drifting inside. */
function jarTorch(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, t: number): void {
  const p = d.palette;
  const w = 8.4;
  const x0 = len * 0.45;
  // The wire handle to the hand.
  ctx.strokeStyle = p.sub;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-3.6, 0);
  ctx.lineTo(x0, 0);
  ctx.moveTo(x0, -3.4);
  ctx.quadraticCurveTo(x0 - 3, -5.4, x0 - 3.8, 0);
  ctx.quadraticCurveTo(x0 - 3, 5.4, x0, 3.4);
  ctx.stroke();
  glowDot(ctx, x0 + w / 2, 0, 15, p.glow ?? '#F4FFB0', 0.55);
  // The glass body.
  rr(ctx, x0, -4.2, w, 8.4, 2.2);
  const gg = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  gg.addColorStop(0, 'rgba(190,230,245,0.45)');
  gg.addColorStop(0.5, 'rgba(120,170,190,0.2)');
  gg.addColorStop(1, 'rgba(190,230,245,0.45)');
  ctx.fillStyle = gg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,245,255,0.85)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // The lid.
  ctx.fillStyle = p.sub;
  ctx.fillRect(x0 - 0.6, -4.9, 2, 9.8);
  ctx.fillStyle = tone(p.sub, 0.3);
  ctx.fillRect(x0 - 0.6, -4.9, 2, 1.4);
  // Fireflies.
  for (let i = 0; i < 7; i++) {
    const a = t * (0.9 + (i % 3) * 0.35) + i * 1.7;
    const fx = x0 + 3 + (Math.sin(a) * 0.5 + 0.5) * (w - 4);
    const fy = Math.cos(a * 1.3 + i) * 2.8;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i * 2));
    glowDot(ctx, fx, fy, 3.4, p.accent, 0.95 * tw);
    ctx.fillStyle = `rgba(255,255,200,${tw})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A plasma lantern: black-chrome, with cooling fins and a red glowing lens ring. */
function legionLantern(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, lensTilt: number, t: number): void {
  const p = d.palette;
  const g = ctx.createLinearGradient(0, -2.4, 0, 2.4);
  g.addColorStop(0, tone(p.sub, 0.5));
  g.addColorStop(0.5, p.sub);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-4.6, -2.2, len * 0.6, 4.4, 1.2);
  ctx.fill();
  edge(ctx, p.dark, 0.6);
  // Cooling fins.
  ctx.fillStyle = p.main;
  for (let i = 0; i < 3; i++) ctx.fillRect(len * 0.2 + i * 1.8, -3.4, 0.9, 6.8);
  // The chrome head and the lens ring.
  const hx = len * 0.56;
  const hg = ctx.createLinearGradient(0, -3.6, 0, 3.6);
  hg.addColorStop(0, '#FFFFFF');
  hg.addColorStop(0.5, p.main);
  hg.addColorStop(1, tone(p.main, -0.4));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(hx, -2.8);
  ctx.lineTo(len + 2, -4.4);
  ctx.lineTo(len + 2, 4.4);
  ctx.lineTo(hx, 2.8);
  ctx.closePath();
  ctx.fill();
  edge(ctx, p.dark, 0.7);
  const pulse = 0.85 + 0.15 * Math.sin(t * 6);
  ctx.beginPath();
  ctx.ellipse(len + 2.2, 0, Math.max(0.9, lensTilt * 1.1), 3.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#0A0B0F';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(len + 2.3, 0, Math.max(0.6, lensTilt * 0.8), 2.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = p.accent;
  ctx.fill();
  glowDot(ctx, len + 3, 0, 12 * pulse, p.accent, 0.7);
}

/**
 * A golden lantern-torch with a glowing cyan crystal lens. Frame like torch3d: the grip is at
 * 0,0 and the lens points along +x; `lensTilt` is how wide the lens is seen (0..3.4).
 */
function seraphLantern(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, lensTilt: number, t: number): void {
  const p = d.palette;
  // Pearl-wrapped handle.
  const hg = ctx.createLinearGradient(0, -2.2, 0, 2.2);
  hg.addColorStop(0, '#FFFFFF');
  hg.addColorStop(0.5, p.main);
  hg.addColorStop(1, tone(p.main, -0.3));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.roundRect(-4.6, -2, len * 0.55, 4, 2);
  ctx.fill();
  edge(ctx, p.main, 0.6);
  ctx.strokeStyle = tone(p.main, -0.35);
  ctx.lineWidth = 0.5;
  for (let x = -3.6; x < len * 0.5 - 4; x += 1.6) {
    ctx.beginPath();
    ctx.moveTo(x, -2);
    ctx.lineTo(x + 0.9, 2);
    ctx.stroke();
  }
  // Gold body with cyan inlays.
  const bx = len * 0.5;
  const bg = ctx.createLinearGradient(0, -3, 0, 3);
  bg.addColorStop(0, tone(p.sub, 0.4));
  bg.addColorStop(0.5, p.sub);
  bg.addColorStop(1, tone(p.sub, -0.4));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(bx, -2.8, len * 0.4, 5.6, 1.6);
  ctx.fill();
  edge(ctx, p.sub, 0.7);
  ctx.fillStyle = p.accent;
  ctx.fillRect(bx + 1.2, -0.5, len * 0.4 - 2.4, 1);
  // Flared head with four fins and the crystal.
  const hx = len * 0.88;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(hx, -2.8);
  ctx.lineTo(len + 2, -4.4);
  ctx.lineTo(len + 2, 4.4);
  ctx.lineTo(hx, 2.8);
  ctx.closePath();
  ctx.fill();
  edge(ctx, p.sub, 0.7);
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx + 0.4, sd * 2.6);
    ctx.quadraticCurveTo(hx - 2.6, sd * 5.6, hx - 4.6, sd * 4.4);
    ctx.quadraticCurveTo(hx - 2, sd * 3.2, hx + 0.4, sd * 2);
    ctx.closePath();
    ctx.fillStyle = p.main;
    ctx.fill();
    edge(ctx, p.sub, 0.5);
  }
  // The lens crystal: a faceted ellipse that glows.
  const pulse = 0.85 + 0.15 * Math.sin(t * 5);
  ctx.beginPath();
  ctx.ellipse(len + 2.2, 0, Math.max(0.8, lensTilt * 1.05), 3.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#E8FBFF';
  ctx.fill();
  edge(ctx, p.sub, 0.7);
  const lg = ctx.createRadialGradient(len + 1.8, -0.8, 0.2, len + 2.2, 0, 3.4);
  lg.addColorStop(0, '#FFFFFF');
  lg.addColorStop(0.5, p.accent);
  lg.addColorStop(1, '#3FB8E0');
  ctx.beginPath();
  ctx.ellipse(len + 2.3, 0, Math.max(0.5, lensTilt * 0.8), 2.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = lg;
  ctx.fill();
  glowDot(ctx, len + 3, 0, 11 * pulse, p.accent, 0.55);
}

/** A small feather: a soft pointed leaf with a light vein. Drawn at 0,0 pointing up. */
function featherShape(ctx: CanvasRenderingContext2D, len: number, w: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-w, -len * 0.3, -w * 0.9, -len * 0.75, 0, -len);
  ctx.bezierCurveTo(w * 0.9, -len * 0.75, w, -len * 0.3, 0, 0);
  ctx.closePath();
}

/**
 * The glow of the full premium set: a soft light that breathes, slow curved ribbons of light
 * and white-gold feathers that drift up and sway. Light and airy, with no round dots. Hero frame.
 */
export function drawSeraphAura(ctx: CanvasRenderingContext2D, d: StyleDef, t: number, cy = -30): void {
  const p = d.palette;
  const breathe = 0.92 + 0.08 * Math.sin(t * 1.6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // A wide soft halo and a taller, fainter column of light.
  const g = ctx.createRadialGradient(0, cy, 6, 0, cy, 54 * breathe);
  g.addColorStop(0, 'rgba(255,240,190,0.34)');
  g.addColorStop(0.5, 'rgba(160,235,255,0.13)');
  g.addColorStop(1, 'rgba(160,235,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-60, cy - 60, 120, 120);
  const col = ctx.createLinearGradient(0, cy + 44, 0, cy - 52);
  col.addColorStop(0, 'rgba(255,236,170,0)');
  col.addColorStop(0.5, 'rgba(255,244,205,0.12)');
  col.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(0, cy, 22 * breathe, 52, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ribbons: thin curves of light that sway slowly around the hero.
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const sw = Math.sin(t * 0.7 + i * 1.9);
    const x0 = side * (16 + (i >> 1) * 8);
    const rg = ctx.createLinearGradient(0, cy + 34, 0, cy - 38);
    rg.addColorStop(0, 'rgba(255,238,180,0)');
    rg.addColorStop(0.5, `rgba(255,248,215,${0.3 + 0.1 * sw})`);
    rg.addColorStop(1, 'rgba(180,240,255,0)');
    ctx.strokeStyle = rg;
    ctx.lineWidth = 1.6 - (i >> 1) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x0 * 0.6, cy + 34);
    ctx.bezierCurveTo(x0 * 1.7 + sw * 6, cy + 14, x0 * 0.4 - sw * 7, cy - 12, x0 + sw * 4, cy - 38);
    ctx.stroke();
  }
  // Feathers rising and turning gently, fading in and out.
  for (let i = 0; i < 9; i++) {
    const ph = (t * 0.16 + i * 0.113) % 1;
    const x = Math.sin(i * 2.3) * 20 + Math.sin(t * 0.9 + i * 1.4) * 5;
    const y = cy + 30 - ph * 66;
    const a = Math.sin(ph * Math.PI);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 0.8 + i) * 0.6 + (i % 2 ? 0.3 : -0.3));
    featherShape(ctx, 6 + (i % 3) * 1.6, 1.7);
    const fg = ctx.createLinearGradient(0, 0, 0, -9);
    fg.addColorStop(0, `rgba(255,255,255,${0.75 * a})`);
    fg.addColorStop(1, `rgba(255,226,140,${0.55 * a})`);
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  void p;
}

/**
 * The scanner of the full chrome set: a red heat glow with rising embers around the hero, and the
 * red "machine vision": a line sweeping over the body (front view) or a laser from the eye (side view).
 */
export function drawLegionFx(ctx: CanvasRenderingContext2D, d: StyleDef, t: number, cy = -30, eye?: { x: number; y: number }): void {
  const p = d.palette;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.9 + 0.1 * Math.sin(t * 3.1);
  const g = ctx.createRadialGradient(0, cy, 4, 0, cy, 48 * pulse);
  g.addColorStop(0, 'rgba(255,70,40,0.34)');
  g.addColorStop(0.5, 'rgba(255,40,30,0.14)');
  g.addColorStop(1, 'rgba(255,30,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-56, cy - 56, 112, 112);
  // Embers rise from the machine.
  for (let i = 0; i < 14; i++) {
    const ph = (t * 0.5 + i * 0.173) % 1;
    const x = Math.sin(i * 7.1) * 20 + Math.sin(t * 2 + i) * 3;
    const y = cy + 34 - ph * 74;
    const a = Math.sin(ph * Math.PI) * 0.9;
    const sg = ctx.createRadialGradient(x, y, 0, x, y, 2.6);
    sg.addColorStop(0, `rgba(255,170,100,${a})`);
    sg.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x - 2.6, y - 2.6, 5.2, 5.2);
  }
  if (!eye) {
    // A scan line runs down the body again and again.
    const k = (t * 0.55) % 1;
    const y = cy - 34 + k * 70;
    const lg = ctx.createLinearGradient(-26, 0, 26, 0);
    lg.addColorStop(0, 'rgba(255,40,30,0)');
    lg.addColorStop(0.5, `rgba(255,90,70,${0.85 * Math.sin(k * Math.PI)})`);
    lg.addColorStop(1, 'rgba(255,40,30,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-26, y - 0.8, 52, 1.6);
    const bg = ctx.createLinearGradient(0, y - 7, 0, y + 1);
    bg.addColorStop(0, 'rgba(255,40,30,0)');
    bg.addColorStop(1, `rgba(255,60,40,${0.2 * Math.sin(k * Math.PI)})`);
    ctx.fillStyle = bg;
    ctx.fillRect(-26, y - 7, 52, 8);
  } else {
    // A thin laser from the eye, sweeping a little up and down.
    const sweep = Math.sin(t * 1.7) * 0.1;
    const x1 = eye.x + 120;
    const y1 = eye.y + sweep * 120;
    const lg = ctx.createLinearGradient(eye.x, eye.y, x1, y1);
    lg.addColorStop(0, 'rgba(255,90,70,0.9)');
    lg.addColorStop(1, 'rgba(255,40,30,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(eye.x, eye.y);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.lineWidth = 4.4;
    ctx.globalAlpha = 0.25;
    ctx.stroke();
  }
  ctx.restore();
  void p;
}

/**
 * Wings grown from the armor, drawn behind the body in the torso frame (hip at 0,0). `spread`
 * is 0 (folded) to 1 (wide open): they open while the hero jumps up.
 */
export function drawSeraphWings(ctx: CanvasRenderingContext2D, d: StyleDef, len: number, view: View, spread: number, t: number, detach = 0): void {
  const p = d.palette;
  const sh = { x: 0, y: -len + 3.4 };
  const feather = (ang: number, flen: number, dark: boolean): void => {
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-2.6, -flen * 0.3, -3, -flen * 0.8, 0, -flen);
    ctx.bezierCurveTo(3, -flen * 0.8, 2.6, -flen * 0.3, 0, 0);
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, 0, 0, -flen);
    fg.addColorStop(0, dark ? tone(p.main, -0.25) : '#FFFFFF');
    fg.addColorStop(0.6, dark ? tone(p.main, -0.1) : p.main);
    fg.addColorStop(1, p.sub);
    ctx.globalAlpha = dark ? 0.8 : 0.95;
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = tone(p.sub, -0.25);
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
  };
  const flap = Math.sin(t * 9) * 0.06 * spread;
  const fan = (side: number, base: number, dark: boolean, extra: number): void => {
    // Longest feathers at the outer edge first.
    for (let i = 6; i >= 0; i--) {
      const open = (14 + i * 7) * (Math.PI / 180) + spread * (i * 0.2 + 0.25);
      const flen = (14 + i * 2.8) * (0.72 + 0.28 * spread);
      feather(side * (base + open) + flap * side + extra, flen, dark);
    }
  };
  ctx.save();
  if (view === 'front') {
    // One wing on each side of the back. When the hero jumps they come away from the body (a thread
    // of light still joins them to the shoulders) and come back to it as he lands.
    for (const sd of [-1, 1]) {
      ctx.save();
      ctx.globalAlpha = 1 - 0.18 * detach;
      ctx.translate(sd * (4.2 + detach * 10), -detach * 6);
      ctx.rotate(sd * detach * 0.12);
      fan(sd, 0.1, false, 0);
      ctx.restore();
    }
    if (detach > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(190,245,255,${0.5 * detach})`;
      ctx.lineWidth = 0.9;
      ctx.lineCap = 'round';
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 3, -len + 3.4);
        ctx.quadraticCurveTo(sd * (4 + detach * 5), -len + 1 - detach * 4, sd * (4.2 + detach * 10), -len + 3.4 - detach * 6);
        ctx.stroke();
      }
      ctx.restore();
    }
  } else {
    // Seen from the side: both wings sweep back (to the left), the far one slightly higher.
    ctx.save();
    ctx.globalAlpha = 1 - 0.2 * detach;
    ctx.translate(-1.5 - detach * 8, -1.5 - detach * 4);
    ctx.rotate(-detach * 0.1);
    fan(-1, 0.3, true, 0);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 1 - 0.15 * detach;
    ctx.translate(-2 - detach * 12, 1 - detach * 6);
    ctx.rotate(-detach * 0.14);
    fan(-1, 0.22, false, 0);
    ctx.restore();
    if (detach > 0.15) {
      // A thread of light from the shoulder to the wing that came away.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(190,245,255,${0.5 * detach})`;
      ctx.lineWidth = 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -len + 3.4);
      ctx.quadraticCurveTo(-3 - detach * 5, -len + 2 - detach * 3, -2 - detach * 12, -len + 4.4 - detach * 6);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
  // A soft glow at the roots.
  glowDot(ctx, sh.x, sh.y, 9, p.accent, 0.4 * (0.5 + spread * 0.5));
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
    case 'torch': {
      ctx.translate(-12, 2);
      ctx.scale(1.55, 1.55);
      drawStyleTorch(ctx, d, 15, 2, 1.2);
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
