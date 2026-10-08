// Objects that stand near the hero on the main screen, plus screen frames and effects.
// Objects are drawn in "hero units" with the origin at the middle of their base on the floor
// (y grows downward, so the object is above it). Light comes from the top-left.

import { bodyGradient, edge, sphere, spec } from './shade3d';

type Ctx = CanvasRenderingContext2D;

export const PROP_IDS = [
  'prop_football',
  'prop_basketball',
  'prop_lamp',
  'prop_bat',
  'prop_cup',
  'prop_sword',
  'prop_tv',
] as const;

/** The TV screen in prop units (relative to the base): the last run is shown here. */
export const TV_SCREEN = { x: -7.6, y: -13.8, w: 10.8, h: 10.4 };

function shadow(g: Ctx, rx: number): void {
  const s = g.createRadialGradient(0, 0.4, 0.5, 0, 0.4, rx);
  s.addColorStop(0, 'rgba(0,0,0,0.4)');
  s.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = s;
  g.beginPath();
  g.ellipse(0, 0.4, rx, rx * 0.26, 0, 0, Math.PI * 2);
  g.fill();
}

function glowAt(g: Ctx, x: number, y: number, r: number, color: string, a: number): void {
  g.save();
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = a;
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

/**
 * Draws one object. `tv` paints the screen of the TV (it receives the context already
 * clipped and translated to the screen rectangle).
 */
export interface PropState {
  /** The lamp (and other switches) are on; default true. */
  on?: boolean;
  /** Seconds since the player tapped the object (undefined = not touched lately). */
  touch?: number;
}

/** A little hop of a ball after a tap: damped bounces. */
function hop(touch: number | undefined, height: number): number {
  if (touch === undefined || touch > 1.4) return 0;
  return Math.abs(Math.sin(touch * 7.5)) * height * Math.exp(-touch * 2.6);
}

export function drawProp(g: Ctx, id: string, t: number, tv?: (g: Ctx, w: number, h: number) => void, state: PropState = {}): void {
  switch (id) {
    case 'prop_football': {
      shadow(g, 5);
      g.save();
      g.translate(0, -4.2 - hop(state.touch, 11));
      if (state.touch !== undefined && state.touch < 1.4) g.rotate(state.touch * 6);
      g.rotate(0.3);
      sphere(g, 0, 0, 4.2, 4.2, '#F6F6F4');
      g.fillStyle = '#23252B';
      for (const [x, y] of [[0, 0], [-2.8, -1.9], [2.8, -1.9], [-1.8, 2.7], [1.8, 2.7]] as [number, number][]) {
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const px = x + Math.cos(a) * 1.25;
          const py = y + Math.sin(a) * 1.25;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
      }
      g.restore();
      spec(g, -1.4, -6, 1.6, 0.9, 0.7);
      break;
    }
    case 'prop_basketball': {
      shadow(g, 5.8);
      g.save();
      g.translate(0, -4.9 - hop(state.touch, 14));
      if (state.touch !== undefined && state.touch < 1.4) g.rotate(state.touch * 5);
      sphere(g, 0, 0, 4.9, 4.9, '#E8782B');
      g.strokeStyle = '#4A2410';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(-4.9, 0);
      g.lineTo(4.9, 0);
      g.moveTo(0, -4.9);
      g.lineTo(0, 4.9);
      g.stroke();
      g.beginPath();
      g.arc(-4.4, 0, 3.9, -1.1, 1.1);
      g.stroke();
      g.beginPath();
      g.arc(4.4, 0, 3.9, Math.PI - 1.1, Math.PI + 1.1);
      g.stroke();
      g.restore();
      spec(g, -1.6, -6.9, 1.8, 1, 0.55);
      break;
    }
    case 'prop_lamp': {
      shadow(g, 5);
      g.fillStyle = '#2A2C36';
      g.beginPath();
      g.ellipse(0, -0.8, 4, 1.3, 0, 0, Math.PI * 2);
      g.fill();
      edge(g, '#2A2C36', 0.6);
      g.fillStyle = '#3A3D4A';
      g.fillRect(-0.5, -26, 1, 25);
      // Shade.
      g.beginPath();
      g.moveTo(-4.4, -25);
      g.lineTo(4.4, -25);
      g.lineTo(2.6, -30);
      g.lineTo(-2.6, -30);
      g.closePath();
      g.fillStyle = bodyGradient(g, '#F4C26A', -4.4, 4.4);
      g.fill();
      edge(g, '#F4C26A', 0.6);
      const on = state.on !== false;
      const flick = 0.85 + 0.15 * Math.sin(t * 5);
      if (on) glowAt(g, 0, -24, 22, 'rgba(255,200,110,1)', 0.6 * flick);
      else {
        // Switched off: the shade is just cloth.
        g.fillStyle = 'rgba(30,24,16,0.45)';
        g.beginPath();
        g.moveTo(-4.4, -25);
        g.lineTo(4.4, -25);
        g.lineTo(2.6, -30);
        g.lineTo(-2.6, -30);
        g.closePath();
        g.fill();
      }
      g.fillStyle = on ? 'rgba(255,240,200,0.95)' : 'rgba(120,110,95,0.9)';
      g.beginPath();
      g.ellipse(0, -25, 2.4, 0.8, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'prop_bat': {
      shadow(g, 4);
      g.save();
      g.translate(0, -0.4);
      g.rotate(0.2);
      // A wooden bat leaning on the wall, handle at the bottom.
      g.beginPath();
      g.moveTo(-0.8, 0);
      g.lineTo(0.8, 0);
      g.lineTo(1, -11);
      g.quadraticCurveTo(2.6, -20, 2.5, -27);
      g.quadraticCurveTo(0, -29, -2.5, -27);
      g.quadraticCurveTo(-2.6, -20, -1, -11);
      g.closePath();
      const wood = g.createLinearGradient(-2.6, 0, 2.6, 0);
      wood.addColorStop(0, '#E8B878');
      wood.addColorStop(0.5, '#C98A4A');
      wood.addColorStop(1, '#7A4A22');
      g.fillStyle = wood;
      g.fill();
      edge(g, '#9A6A32', 0.7);
      g.fillStyle = '#23252B';
      g.fillRect(-1, -9, 2, 9);
      g.fillStyle = 'rgba(255,255,255,0.2)';
      for (let y = -1; y > -9; y -= 2) g.fillRect(-1, y, 2, 0.5);
      g.restore();
      break;
    }
    case 'prop_cup': {
      shadow(g, 6.4);
      // Plinth.
      g.fillStyle = bodyGradient(g, '#3A2E5A', -5.4, 5.4);
      g.fillRect(-5.4, -4.2, 10.8, 4.2);
      g.fillStyle = '#E6B83A';
      g.fillRect(-4, -3.2, 8, 1.2);
      // Stem and cup.
      g.fillStyle = bodyGradient(g, '#E6B83A', -2, 2);
      g.fillRect(-1.1, -9.2, 2.2, 5.2);
      g.beginPath();
      g.ellipse(0, -9, 3.4, 1, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(-5.6, -22);
      g.lineTo(5.6, -22);
      g.quadraticCurveTo(5.4, -10.4, 0, -9.4);
      g.quadraticCurveTo(-5.4, -10.4, -5.6, -22);
      g.closePath();
      g.fillStyle = bodyGradient(g, '#F2C94C', -5.6, 5.6);
      g.fill();
      edge(g, '#E6B83A', 0.7);
      // Handles.
      g.strokeStyle = '#E6B83A';
      g.lineWidth = 1;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 5.4, -20.6);
        g.bezierCurveTo(s * 9.6, -20.6, s * 9.6, -13.4, s * 4, -13);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.ellipse(-2.4, -17, 0.9, 3.6, 0.1, 0, Math.PI * 2);
      g.fill();
      const sp = 0.5 + 0.5 * Math.sin(t * 2.4);
      glowAt(g, 3, -19, 5, 'rgba(255,245,200,1)', 0.35 * sp);
      if (state.touch !== undefined && state.touch < 1.2) {
        // A tap on the cup: a burst of sparkles.
        const k = state.touch / 1.2;
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const r = 4 + k * 14;
          glowAt(g, Math.cos(a) * r, -14 + Math.sin(a) * r, 3, 'rgba(255,240,170,1)', 0.9 * (1 - k));
        }
        g.restore();
      }
      break;
    }
    case 'prop_sword': {
      shadow(g, 4.4);
      // A small stand and an upright energy blade.
      g.fillStyle = '#2A2C36';
      g.beginPath();
      g.ellipse(0, -0.8, 3.4, 1.1, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = bodyGradient(g, '#A9B0BE', -1.4, 1.4);
      g.fillRect(-1.4, -9, 2.8, 8);
      g.fillStyle = '#23252B';
      for (const y of [-7, -5, -3]) g.fillRect(-1.4, y, 2.8, 0.7);
      g.fillStyle = '#E8392F';
      g.fillRect(-1.8, -10, 3.6, 1.2);
      const pulse = 0.85 + 0.15 * Math.sin(t * 6);
      glowAt(g, 0, -22, 20, 'rgba(90,200,255,1)', 0.55 * pulse);
      g.save();
      g.beginPath();
      g.roundRect(-1.3, -34, 2.6, 24.4, 1.3);
      g.fillStyle = 'rgba(120,215,255,0.55)';
      g.fill();
      g.beginPath();
      g.roundRect(-0.7, -33.4, 1.4, 23.2, 0.7);
      g.fillStyle = '#EAFBFF';
      g.fill();
      g.restore();
      break;
    }
    case 'prop_tv': {
      // An old square TV with a wooden cabinet, a round screen window, knobs and rabbit-ear antennas.
      shadow(g, 9);
      g.fillStyle = '#2A2018';
      g.fillRect(-7.4, -1.8, 3, 1.8);
      g.fillRect(4.4, -1.8, 3, 1.8);
      // Antennas: a V of two rods on a little round base.
      g.strokeStyle = '#C9CED8';
      g.lineWidth = 0.7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-0.6, -15.8);
      g.lineTo(-8.4, -26);
      g.moveTo(0.6, -15.8);
      g.lineTo(6.6, -24.6);
      g.stroke();
      g.fillStyle = '#E7EAF0';
      for (const [x, y] of [[-8.4, -26], [6.6, -24.6]] as [number, number][]) {
        g.beginPath();
        g.arc(x, y, 0.8, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#3A3D4A';
      g.beginPath();
      g.ellipse(0, -15.6, 2.6, 1, 0, 0, Math.PI * 2);
      g.fill();
      // Cabinet.
      g.beginPath();
      g.roundRect(-9.4, -16, 18.8, 14.6, 2);
      g.fillStyle = bodyGradient(g, '#8A5E3A', -9.4, 9.4);
      g.fill();
      edge(g, '#8A5E3A', 0.7);
      g.strokeStyle = 'rgba(40,24,12,0.25)';
      g.lineWidth = 0.4;
      for (let y = -14.6; y < -2; y += 1.8) {
        g.beginPath();
        g.moveTo(-9, y);
        g.lineTo(9, y + 0.3);
        g.stroke();
      }
      // Screen window.
      const s = TV_SCREEN;
      g.beginPath();
      g.roundRect(s.x - 1, s.y - 1, s.w + 2, s.h + 2, 3);
      g.fillStyle = '#1E160F';
      g.fill();
      g.save();
      g.beginPath();
      g.roundRect(s.x, s.y, s.w, s.h, 2.4);
      g.clip();
      g.translate(s.x, s.y);
      g.fillStyle = '#05060A';
      g.fillRect(0, 0, s.w, s.h);
      if (tv) tv(g, s.w, s.h);
      // Curved glass: dark corners and a shine.
      const vg = g.createRadialGradient(s.w / 2, s.h / 2, s.h * 0.3, s.w / 2, s.h / 2, s.w * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = vg;
      g.fillRect(0, 0, s.w, s.h);
      const sh = g.createLinearGradient(0, 0, s.w, s.h);
      sh.addColorStop(0, 'rgba(255,255,255,0.2)');
      sh.addColorStop(0.35, 'rgba(255,255,255,0)');
      g.fillStyle = sh;
      g.fillRect(0, 0, s.w, s.h);
      g.restore();
      // Control panel: speaker grille and two knobs.
      g.strokeStyle = '#2A2018';
      g.lineWidth = 0.5;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(4.8, -13.6 + i * 1.3);
        g.lineTo(8.2, -13.6 + i * 1.3);
        g.stroke();
      }
      for (const [y, c] of [[-6.4, '#D9C27A'], [-3.7, '#C9CED8']] as [number, string][]) {
        sphere(g, 6.5, y, 1.35, 1.35, c);
      }
      glowAt(g, s.x + s.w / 2, s.y + s.h / 2, 13, 'rgba(120,180,255,1)', 0.16);
      g.fillStyle = '#7DFF6B';
      g.beginPath();
      g.arc(7.6, -2.6, 0.35, 0, Math.PI * 2);
      g.fill();
      break;
    }
    default:
      break;
  }
}

/** Half of the width of an object in hero units. */
export function propHalfWidth(id: string): number {
  switch (id) {
    case 'prop_football':
      return 4.2;
    case 'prop_basketball':
      return 4.9;
    case 'prop_lamp':
      return 5;
    case 'prop_bat':
      return 3;
    case 'prop_cup':
      return 6;
    case 'prop_sword':
      return 4;
    case 'prop_tv':
      return 9.4;
    default:
      return 5;
  }
}

/** Approximate height of an object in hero units (to place a wall shelf under it). */
export function propHeight(id: string): number {
  switch (id) {
    case 'prop_football':
      return 8.4;
    case 'prop_basketball':
      return 9.8;
    case 'prop_bat':
      return 29;
    case 'prop_lamp':
      return 30;
    case 'prop_cup':
      return 22;
    case 'prop_sword':
      return 34;
    case 'prop_tv':
      return 26;
    default:
      return 10;
  }
}

// ===========================================================================
// Frames (drawn over the whole stage) and effects
// ===========================================================================

export const FRAME_IDS = ['frame_gold', 'frame_neon'] as const;
export const FX_IDS = ['fx_sparks', 'fx_snow'] as const;

export function drawFrame(g: Ctx, id: string, w: number, h: number, t: number): void {
  if (id === 'frame_gold') {
    const b = Math.max(5, Math.min(w, h) * 0.028);
    g.save();
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#FFE48A');
    gr.addColorStop(0.35, '#C99A2E');
    gr.addColorStop(0.65, '#F6D26A');
    gr.addColorStop(1, '#9A6E18');
    g.fillStyle = gr;
    g.beginPath();
    g.rect(0, 0, w, h);
    g.rect(b, b, w - b * 2, h - b * 2);
    g.fill('evenodd');
    g.strokeStyle = 'rgba(70,40,0,0.7)';
    g.lineWidth = 1;
    g.strokeRect(b + 0.5, b + 0.5, w - b * 2 - 1, h - b * 2 - 1);
    g.strokeStyle = 'rgba(255,250,210,0.8)';
    g.strokeRect(0.5, 0.5, w - 1, h - 1);
    // Corner ornaments.
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as [number, number, number, number][]) {
      g.save();
      g.translate(x, y);
      g.scale(sx, sy);
      g.fillStyle = '#F6D26A';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(b * 4.2, 0);
      g.quadraticCurveTo(b * 2.2, b * 0.9, b * 1.2, b * 2.2);
      g.quadraticCurveTo(b * 0.9, b * 3, 0, b * 4.2);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(70,40,0,0.7)';
      g.stroke();
      g.restore();
    }
    // A glint that sweeps along the top edge.
    const k = ((t * 0.25) % 1) * (w + 60) - 30;
    const gl = g.createLinearGradient(k - 20, 0, k + 20, 0);
    gl.addColorStop(0, 'rgba(255,255,255,0)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, w, b);
    g.restore();
  } else if (id === 'frame_neon') {
    g.save();
    const hue = (t * 40) % 360;
    const c1 = `hsl(${(hue + 300) % 360},100%,62%)`;
    const c2 = `hsl(${(hue + 180) % 360},100%,62%)`;
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    g.strokeStyle = gr;
    g.lineJoin = 'round';
    g.globalAlpha = 0.25;
    g.lineWidth = 9;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.globalAlpha = 0.5;
    g.lineWidth = 4;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.globalAlpha = 1;
    g.lineWidth = 1.6;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.strokeStyle = '#fff';
    g.globalAlpha = 0.7;
    g.lineWidth = 0.7;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.restore();
  }
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Stateless particle effects: positions come from the time, so nothing needs to be stored. */
export function drawFx(g: Ctx, id: string, w: number, h: number, t: number, cx: number, feet: number): void {
  if (id === 'fx_sparks') {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const life = 2.2 + hash(i) * 1.6;
      const k = ((t + hash(i + 40) * life) % life) / life;
      const x = cx + (hash(i + 7) - 0.5) * w * 0.5 + Math.sin(t * 2 + i) * 6 * k;
      const y = feet - k * h * 0.7;
      const a = Math.sin(k * Math.PI);
      const r = 1 + hash(i + 90) * 2;
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 3);
      gr.addColorStop(0, `rgba(255,220,120,${0.9 * a})`);
      gr.addColorStop(1, 'rgba(255,160,40,0)');
      g.fillStyle = gr;
      g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    g.restore();
  } else if (id === 'fx_snow') {
    for (let i = 0; i < 44; i++) {
      const sp = 14 + hash(i) * 26;
      const x = (((hash(i + 3) * w + Math.sin(t * 0.7 + i) * 8) % w) + w) % w;
      const y = (hash(i + 9) * h + t * sp) % (h + 8) - 4;
      g.fillStyle = `rgba(255,255,255,${0.5 + hash(i + 5) * 0.45})`;
      g.beginPath();
      g.arc(x, y, 0.8 + hash(i + 11) * 1.4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

