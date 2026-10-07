// Backgrounds for the main screen (and the decoration screen). They are separate from the
// scenes that change during a run. Each one is drawn once into a cached bitmap; the small
// animated details (twinkling lights, snow, blinking consoles) are painted every frame on top.
//
// The default background (the brick alley) lives in ground.ts. Ids match the server catalog.

import { drawStageBackdrop, type StageLayout } from './ground';

type Ctx = CanvasRenderingContext2D;

export const MENU_BACKGROUNDS = ['bg_dusk', 'bg_roof', 'bg_metro', 'bg_neon', 'bg_winter', 'bg_space'] as const;

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function vignette(g: Ctx, w: number, h: number, a = 0.35): void {
  const v = g.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

function glow(g: Ctx, x: number, y: number, r: number, color: string, a: number): void {
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

// ===========================================================================
// Static layers
// ===========================================================================

type Painter = (g: Ctx, w: number, h: number, L: StageLayout, u: number) => void;

/** Rooftop at sunset: skyline, a low parapet and a gravel roof. */
const roof: Painter = (g, w, h, L, u) => {
  const sky = g.createLinearGradient(0, 0, 0, L.wallBase);
  sky.addColorStop(0, '#2A1B55');
  sky.addColorStop(0.5, '#B24C6A');
  sky.addColorStop(0.82, '#F2724A');
  sky.addColorStop(1, '#FFC773');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, L.wallBase + 2);
  // Setting sun.
  glow(g, w * 0.72, L.wallBase - 14 * u, 70 * u, 'rgba(255,214,130,0.9)', 0.55);
  g.fillStyle = '#FFE7A8';
  g.beginPath();
  g.arc(w * 0.72, L.wallBase - 8 * u, 11 * u, Math.PI, 0);
  g.fill();
  // Streaky clouds.
  g.fillStyle = 'rgba(255,150,150,0.28)';
  for (const [x, y, len] of [[0.1, 0.12, 0.5], [0.4, 0.22, 0.4], [0.05, 0.3, 0.35]] as [number, number, number][]) {
    g.beginPath();
    g.roundRect(w * x, L.wallBase * y, w * len, 3 * u, 2 * u);
    g.fill();
  }
  // Two layers of skyline.
  const r = rng(77);
  const layer = (base: number, color: string, hMin: number, hMax: number, lit: number): void => {
    g.fillStyle = color;
    let x = -4;
    while (x < w) {
      const bw = (7 + r() * 11) * u;
      const bh = (hMin + r() * (hMax - hMin)) * u;
      g.fillRect(x, base - bh, bw, bh + 2);
      g.fillStyle = 'rgba(255,214,130,0.85)';
      for (let wy = base - bh + 3 * u; wy < base - 3 * u; wy += 4.4 * u) {
        for (let wx = x + 1.6 * u; wx < x + bw - 2 * u; wx += 3.4 * u) if (r() < lit) g.fillRect(wx, wy, 1.6 * u, 1.9 * u);
      }
      g.fillStyle = color;
      x += bw + r() * 2 * u;
    }
  };
  layer(L.wallBase - 4 * u, '#6B3A62', 10, 24, 0.1);
  layer(L.wallBase - 1 * u, '#2F1F4A', 7, 18, 0.2);
  // Antenna and a chimney on the roof edge.
  g.fillStyle = '#1C1530';
  g.fillRect(w * 0.1, L.wallBase - 34 * u, 1.4 * u, 34 * u);
  g.fillRect(w * 0.1 - 4 * u, L.wallBase - 28 * u, 9 * u, 1 * u);
  g.fillRect(w * 0.1 - 3 * u, L.wallBase - 22 * u, 7 * u, 1 * u);
  g.fillRect(w * 0.86, L.wallBase - 16 * u, 6 * u, 16 * u);
  // Parapet.
  g.fillStyle = '#6E6A7A';
  g.fillRect(0, L.wallBase - 5 * u, w, 5 * u);
  g.fillStyle = '#8E8A9C';
  g.fillRect(0, L.wallBase - 5 * u, w, 1.4 * u);
  // Gravel roof.
  const floor = g.createLinearGradient(0, L.wallBase, 0, h);
  floor.addColorStop(0, '#46404F');
  floor.addColorStop(1, '#25222E');
  g.fillStyle = floor;
  g.fillRect(0, L.wallBase, w, h - L.wallBase);
  for (let i = 0; i < w * (h - L.wallBase) / 70; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.25)';
    g.fillRect(r() * w, L.wallBase + 3 + r() * (h - L.wallBase), Math.max(1, u * 0.5), Math.max(1, u * 0.35));
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = Math.max(1, u * 0.3);
  for (const y of [0.18, 0.5, 0.82]) {
    g.beginPath();
    g.moveTo(0, L.wallBase + (h - L.wallBase) * y);
    g.lineTo(w, L.wallBase + (h - L.wallBase) * y);
    g.stroke();
  }
  glow(g, w * 0.72, L.feet, w * 0.6, 'rgba(255,170,100,0.5)', 0.3);
  vignette(g, w, h, 0.3);
};

/** Metro platform: tiled wall, a train standing behind with an open door, a yellow safety line. */
const metro: Painter = (g, w, h, L, u) => {
  const wall = g.createLinearGradient(0, 0, 0, L.wallBase);
  wall.addColorStop(0, '#DAD6C8');
  wall.addColorStop(1, '#B9B5A6');
  g.fillStyle = wall;
  g.fillRect(0, 0, w, L.wallBase);
  g.strokeStyle = 'rgba(80,76,64,0.35)';
  g.lineWidth = 1;
  const t = 9 * u;
  for (let y = 0; y < L.wallBase; y += t) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (let x = 0; x < w; x += t * 1.6) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, L.wallBase);
    g.stroke();
  }
  // Dark blue tile band.
  g.fillStyle = '#2C4A86';
  g.fillRect(0, L.wallBase * 0.62, w, t * 1.2);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(0, L.wallBase * 0.62, w, 2);
  // Ceiling light bars.
  for (const x of [0.12, 0.52]) {
    g.fillStyle = '#F6F3E6';
    g.fillRect(w * x, 0, w * 0.2, 3.4 * u);
    glow(g, w * (x + 0.1), 3 * u, w * 0.22, 'rgba(255,250,220,0.9)', 0.35);
  }
  // Direction sign (arrows only).
  g.fillStyle = '#1E3C78';
  g.fillRect(w * 0.1, L.wallBase * 0.2, w * 0.4, 8 * u);
  g.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) {
    const x = w * 0.16 + i * w * 0.11;
    g.beginPath();
    g.moveTo(x, L.wallBase * 0.2 + 2 * u);
    g.lineTo(x + 4 * u, L.wallBase * 0.2 + 4 * u);
    g.lineTo(x, L.wallBase * 0.2 + 6 * u);
    g.closePath();
    g.fill();
  }
  // A train stands at the platform behind: windows on the left, an open door on the right,
  // a closed door at the far edge.
  const top = L.wallBase * 0.2;
  const bodyH = L.wallBase - top;
  const body = g.createLinearGradient(0, top, 0, L.wallBase);
  body.addColorStop(0, '#E4E8EF');
  body.addColorStop(0.55, '#B4BCC9');
  body.addColorStop(1, '#8C95A5');
  g.fillStyle = body;
  g.fillRect(-4, top, w + 8, bodyH);
  g.fillStyle = '#2C4A86';
  g.fillRect(-4, top + bodyH * 0.58, w + 8, bodyH * 0.08);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(-4, top, w + 8, 1.4);
  g.fillStyle = '#4A5160';
  g.fillRect(-4, L.wallBase - 3 * u, w + 8, 3 * u);
  // Windows.
  const win = (x: number, ww: number): void => {
    const wy = top + bodyH * 0.1;
    const wh = bodyH * 0.38;
    g.fillStyle = '#2A2F3C';
    g.fillRect(x - 1.2, wy - 1.2, ww + 2.4, wh + 2.4);
    const glass = g.createLinearGradient(0, wy, 0, wy + wh);
    glass.addColorStop(0, '#FFF1C8');
    glass.addColorStop(1, '#F2C97A');
    g.fillStyle = glass;
    g.fillRect(x, wy, ww, wh);
    g.fillStyle = 'rgba(80,60,40,0.55)';
    g.fillRect(x + ww * 0.3, wy, 1.2, wh);
    g.fillRect(x + ww * 0.72, wy, 1.2, wh);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x, wy, ww * 0.12, wh);
  };
  win(w * 0.05, w * 0.2);
  win(w * 0.29, w * 0.2);
  // Open door: the leaves are slid aside and the lit inside is visible.
  const dx = w * 0.56;
  const dw = w * 0.24;
  const dy = top + bodyH * 0.06;
  const dh = L.wallBase - 3 * u - dy;
  g.fillStyle = '#1F232D';
  g.fillRect(dx - 2, dy - 2, dw + 4, dh + 2);
  const inside = g.createLinearGradient(0, dy, 0, dy + dh);
  inside.addColorStop(0, '#FFF3D0');
  inside.addColorStop(1, '#F5CE86');
  g.fillStyle = inside;
  g.fillRect(dx, dy, dw, dh);
  // Seats along the inside back, poles and a handrail.
  g.fillStyle = '#2C4A86';
  g.fillRect(dx, dy + dh * 0.58, dw, dh * 0.2);
  g.fillStyle = '#1E3566';
  g.fillRect(dx, dy + dh * 0.78, dw, dh * 0.06);
  g.fillStyle = 'rgba(120,80,40,0.25)';
  g.fillRect(dx, dy + dh * 0.9, dw, dh * 0.1);
  g.fillStyle = '#C9CED8';
  g.fillRect(dx + dw * 0.3, dy, 1.6, dh);
  g.fillRect(dx + dw * 0.7, dy, 1.6, dh);
  g.fillRect(dx, dy + dh * 0.14, dw, 1.4);
  // Door leaves slid to both sides.
  g.fillStyle = '#C3CAD6';
  g.fillRect(dx - 1, dy, dw * 0.1, dh);
  g.fillRect(dx + dw * 0.9 + 1, dy, dw * 0.1, dh);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(dx + dw * 0.1 - 1, dy, 1.6, dh);
  g.fillRect(dx + dw * 0.9 + 0.2, dy, 1.6, dh);
  // Closed door at the far edge.
  const cx2 = w * 0.84;
  const cw2 = w * 0.18;
  g.fillStyle = '#9AA3B2';
  g.fillRect(cx2, dy, cw2, dh);
  g.fillStyle = '#1F232D';
  g.fillRect(cx2 + cw2 * 0.48, dy, 1.6, dh);
  g.fillStyle = '#F2C97A';
  g.fillRect(cx2 + cw2 * 0.12, dy + dh * 0.1, cw2 * 0.3, dh * 0.32);
  g.fillRect(cx2 + cw2 * 0.58, dy + dh * 0.1, cw2 * 0.3, dh * 0.32);
  // Door signal lamp above the open door.
  g.fillStyle = '#2A2F3C';
  g.fillRect(dx + dw * 0.4, dy - 5 * u, dw * 0.2, 3 * u);
  // Platform floor with the safety line.
  const floor = g.createLinearGradient(0, L.wallBase, 0, h);
  floor.addColorStop(0, '#7C7A82');
  floor.addColorStop(1, '#4A4852');
  g.fillStyle = floor;
  g.fillRect(0, L.wallBase, w, h - L.wallBase);
  g.fillStyle = '#F2C230';
  g.fillRect(0, L.wallBase + (h - L.wallBase) * 0.14, w, 2.4 * u);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, L.wallBase, w, 5 * u);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 14 * u) {
    g.beginPath();
    g.moveTo(x, L.wallBase + 6 * u);
    g.lineTo(x - (w / 2 - x) * 0.25, h);
    g.stroke();
  }
  vignette(g, w, h, 0.3);
};

/** Neon arcade: a dark grid wall, neon tubes, cabinets with glowing screens, a glossy floor. */
const neon: Painter = (g, w, h, L, u) => {
  const wall = g.createLinearGradient(0, 0, 0, L.wallBase);
  wall.addColorStop(0, '#120A2C');
  wall.addColorStop(1, '#2A1250');
  g.fillStyle = wall;
  g.fillRect(0, 0, w, L.wallBase);
  g.strokeStyle = 'rgba(80,200,255,0.16)';
  g.lineWidth = 1;
  for (let y = L.wallBase * 0.1; y < L.wallBase; y += 8 * u) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (let x = 0; x < w; x += 12 * u) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, L.wallBase);
    g.stroke();
  }
  // Neon tubes: magenta and cyan, with a halo.
  const tube = (x0: number, y0: number, x1: number, y1: number, color: string): void => {
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = color;
    g.globalAlpha = 0.25;
    g.lineWidth = 6 * u;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.globalAlpha = 1;
    g.lineWidth = 1.6 * u;
    g.stroke();
    g.strokeStyle = '#fff';
    g.globalAlpha = 0.6;
    g.lineWidth = 0.5 * u;
    g.stroke();
    g.restore();
  };
  tube(w * 0.06, L.wallBase * 0.16, w * 0.94, L.wallBase * 0.16, '#FF3DC8');
  tube(w * 0.06, L.wallBase * 0.26, w * 0.5, L.wallBase * 0.26, '#37E6FF');
  tube(w * 0.5, L.wallBase * 0.26, w * 0.62, L.wallBase * 0.1, '#37E6FF');
  // Cabinets.
  const colors = ['#37E6FF', '#FF3DC8', '#7DFF6B'];
  for (let i = 0; i < 3; i++) {
    const cx = w * (0.1 + i * 0.3);
    const cw = w * 0.22;
    const top = L.wallBase * 0.42;
    g.fillStyle = '#1B1038';
    g.beginPath();
    g.moveTo(cx, L.wallBase);
    g.lineTo(cx, top + 6 * u);
    g.lineTo(cx + cw * 0.2, top);
    g.lineTo(cx + cw * 0.8, top);
    g.lineTo(cx + cw, top + 6 * u);
    g.lineTo(cx + cw, L.wallBase);
    g.closePath();
    g.fill();
    g.strokeStyle = colors[i];
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = '#05060F';
    g.fillRect(cx + cw * 0.14, top + 8 * u, cw * 0.72, L.wallBase * 0.2);
    glow(g, cx + cw / 2, top + 8 * u + L.wallBase * 0.1, cw, colors[i], 0.35);
    g.fillStyle = colors[i];
    g.fillRect(cx + cw * 0.14, top + L.wallBase * 0.2 + 12 * u, cw * 0.72, 1.4 * u);
  }
  // Glossy checker floor.
  const floor = g.createLinearGradient(0, L.wallBase, 0, h);
  floor.addColorStop(0, '#2C1860');
  floor.addColorStop(1, '#0E0722');
  g.fillStyle = floor;
  g.fillRect(0, L.wallBase, w, h - L.wallBase);
  const cell = 14 * u;
  for (let y = 0, row = 0; y < h - L.wallBase; y += cell * 0.5, row++) {
    for (let x = (row % 2) * cell; x < w; x += cell * 2) {
      g.fillStyle = 'rgba(120,70,220,0.18)';
      g.fillRect(x, L.wallBase + y, cell, cell * 0.5);
    }
  }
  glow(g, w * 0.5, L.wallBase + 6 * u, w * 0.7, 'rgba(255,61,200,0.5)', 0.35);
  glow(g, w * 0.5, L.feet, w * 0.5, 'rgba(55,230,255,0.4)', 0.25);
  vignette(g, w, h, 0.4);
};

/** Snowy winter yard at night: moon, houses, pines, a fence and a snowdrift ground. */
const winter: Painter = (g, w, h, L, u) => {
  const sky = g.createLinearGradient(0, 0, 0, L.wallBase);
  sky.addColorStop(0, '#0A1233');
  sky.addColorStop(1, '#2C4A86');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, L.wallBase + 2);
  glow(g, w * 0.78, L.wallBase * 0.2, 40 * u, 'rgba(210,230,255,0.9)', 0.4);
  g.fillStyle = '#F2F6FF';
  g.beginPath();
  g.arc(w * 0.78, L.wallBase * 0.2, 6 * u, 0, Math.PI * 2);
  g.fill();
  const r = rng(31);
  // Houses with snowy roofs and lit windows.
  for (const [x, bw, bh] of [[0.04, 0.3, 22], [0.52, 0.4, 28]] as [number, number, number][]) {
    const px = w * x;
    const pw = w * bw;
    const base = L.wallBase;
    g.fillStyle = '#1B2347';
    g.fillRect(px, base - bh * u, pw, bh * u);
    g.fillStyle = '#F2F6FF';
    g.beginPath();
    g.moveTo(px - 2 * u, base - bh * u);
    g.lineTo(px + pw / 2, base - (bh + 12) * u);
    g.lineTo(px + pw + 2 * u, base - bh * u);
    g.closePath();
    g.fill();
    for (let i = 0; i < 3; i++) {
      const wx = px + pw * (0.14 + i * 0.3);
      g.fillStyle = r() < 0.7 ? '#FFD27A' : '#2A3560';
      g.fillRect(wx, base - (bh - 6) * u, pw * 0.16, 7 * u);
    }
  }
  // Pines.
  for (const [x, s] of [[0.38, 1], [0.93, 1.2], [0.0, 1.1]] as [number, number][]) {
    const px = w * x;
    for (let i = 0; i < 3; i++) {
      g.fillStyle = '#12303A';
      g.beginPath();
      g.moveTo(px - (8 - i * 1.5) * u * s, L.wallBase - i * 8 * u * s);
      g.lineTo(px, L.wallBase - (13 + i * 8) * u * s);
      g.lineTo(px + (8 - i * 1.5) * u * s, L.wallBase - i * 8 * u * s);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(240,246,255,0.9)';
      g.beginPath();
      g.moveTo(px - (5 - i) * u * s, L.wallBase - (i * 8 + 4) * u * s);
      g.lineTo(px, L.wallBase - (13 + i * 8) * u * s);
      g.lineTo(px + (5 - i) * u * s, L.wallBase - (i * 8 + 4) * u * s);
      g.closePath();
      g.fill();
    }
  }
  // A snowy fence.
  g.fillStyle = '#4B3A32';
  for (let x = 0; x < w; x += 7 * u) g.fillRect(x, L.wallBase - 9 * u, 3.2 * u, 9 * u);
  g.fillRect(0, L.wallBase - 7 * u, w, 1.4 * u);
  g.fillStyle = '#F2F6FF';
  for (let x = 0; x < w; x += 7 * u) g.fillRect(x - 0.4 * u, L.wallBase - 10 * u, 4 * u, 1.8 * u);
  // Snow ground.
  const floor = g.createLinearGradient(0, L.wallBase, 0, h);
  floor.addColorStop(0, '#DCE8F8');
  floor.addColorStop(1, '#9FB6D6');
  g.fillStyle = floor;
  g.fillRect(0, L.wallBase, w, h - L.wallBase);
  g.fillStyle = 'rgba(70,100,150,0.25)';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.ellipse(r() * w, L.wallBase + 8 * u + r() * (h - L.wallBase - 10 * u), (10 + r() * 16) * u, 2.2 * u, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 40; i++) g.fillRect(r() * w, L.wallBase + 4 + r() * (h - L.wallBase), Math.max(1, u * 0.4), Math.max(1, u * 0.4));
  vignette(g, w, h, 0.28);
};

/** Window of a space station: steel panels, a round window with Earth, a grated floor. */
const space: Painter = (g, w, h, L, u) => {
  const wall = g.createLinearGradient(0, 0, 0, L.wallBase);
  wall.addColorStop(0, '#2C3242');
  wall.addColorStop(1, '#1C2030');
  g.fillStyle = wall;
  g.fillRect(0, 0, w, L.wallBase);
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 1.2;
  for (let x = 0; x <= w; x += w / 3) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, L.wallBase);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.4)';
  for (let x = 6; x < w; x += w / 3) for (const y of [8, L.wallBase - 8]) {
    g.beginPath();
    g.arc(x, y, Math.max(1.2, u * 0.5), 0, Math.PI * 2);
    g.fill();
  }
  // Light strip.
  g.fillStyle = '#9CE8FF';
  g.fillRect(0, L.wallBase * 0.06, w, 1.6 * u);
  glow(g, w / 2, L.wallBase * 0.06, w * 0.6, 'rgba(156,232,255,0.8)', 0.25);
  // Round window.
  const cx = w * 0.42;
  const cy = L.wallBase * 0.5;
  const R = Math.min(w * 0.32, L.wallBase * 0.4);
  g.fillStyle = '#10131C';
  g.beginPath();
  g.arc(cx, cy, R + 4 * u, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#04050C';
  g.fillRect(cx - R, cy - R, R * 2, R * 2);
  const r = rng(9);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
    g.fillRect(cx - R + r() * R * 2, cy - R + r() * R * 2, Math.max(1, u * 0.35), Math.max(1, u * 0.35));
  }
  // Earth rising at the bottom.
  const eg = g.createRadialGradient(cx - R * 0.2, cy + R * 1.5, R * 0.2, cx, cy + R * 1.6, R * 1.5);
  eg.addColorStop(0, '#6EC1FF');
  eg.addColorStop(0.7, '#1E63C8');
  eg.addColorStop(1, '#0C2A6B');
  g.fillStyle = eg;
  g.beginPath();
  g.arc(cx, cy + R * 1.7, R * 1.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(cx - R * 0.8 + i * R * 0.4, cy + R * 0.5 + (i % 2) * R * 0.12, R * 0.22, R * 0.05, 0, 0, Math.PI * 2);
    g.fill();
  }
  glow(g, cx, cy + R * 0.42, R * 1.2, 'rgba(120,200,255,0.8)', 0.35);
  g.restore();
  g.strokeStyle = '#6C7488';
  g.lineWidth = 3 * u;
  g.beginPath();
  g.arc(cx, cy, R + 2 * u, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, R - 1, Math.PI * 1.1, Math.PI * 1.6);
  g.stroke();
  // Console on the right.
  g.fillStyle = '#242A3A';
  g.fillRect(w * 0.76, L.wallBase * 0.42, w * 0.22, L.wallBase * 0.58);
  g.fillStyle = '#0B0F18';
  g.fillRect(w * 0.79, L.wallBase * 0.48, w * 0.16, L.wallBase * 0.2);
  // Floor: grating with hazard stripes at the wall.
  const floor = g.createLinearGradient(0, L.wallBase, 0, h);
  floor.addColorStop(0, '#3C4254');
  floor.addColorStop(1, '#1C2030');
  g.fillStyle = floor;
  g.fillRect(0, L.wallBase, w, h - L.wallBase);
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 1;
  for (let y = L.wallBase + 6 * u; y < h; y += 8 * u * (1 + (y - L.wallBase) / h)) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (let x = 0; x < w; x += 10 * u) {
    g.beginPath();
    g.moveTo(x, L.wallBase);
    g.lineTo(x - (w / 2 - x) * 0.3, h);
    g.stroke();
  }
  g.save();
  g.beginPath();
  g.rect(0, L.wallBase, w, 4 * u);
  g.clip();
  g.fillStyle = '#F2C230';
  g.fillRect(0, L.wallBase, w, 4 * u);
  g.fillStyle = '#15161C';
  for (let x = -8 * u; x < w; x += 8 * u) {
    g.beginPath();
    g.moveTo(x, L.wallBase + 4 * u);
    g.lineTo(x + 4 * u, L.wallBase);
    g.lineTo(x + 8 * u, L.wallBase);
    g.lineTo(x + 4 * u, L.wallBase + 4 * u);
    g.closePath();
    g.fill();
  }
  g.restore();
  glow(g, cx, L.feet, w * 0.6, 'rgba(120,200,255,0.5)', 0.18);
  vignette(g, w, h, 0.35);
};

const PAINTERS: Record<string, Painter> = { bg_roof: roof, bg_metro: metro, bg_neon: neon, bg_winter: winter, bg_space: space };

// ===========================================================================
// Animated details
// ===========================================================================

function animate(g: Ctx, id: string, w: number, h: number, L: StageLayout, u: number, t: number): void {
  switch (id) {
    case 'bg_dusk': {
      // Garlands across the wall with twinkling bulbs.
      const cols = ['#FFD27A', '#FF8FB1', '#8FE3FF', '#B9FF9C'];
      for (const [y0, sag] of [[0.2, 0.07], [0.4, 0.09]] as [number, number][]) {
        g.strokeStyle = 'rgba(20,16,14,0.8)';
        g.lineWidth = Math.max(1, u * 0.3);
        g.beginPath();
        for (let i = 0; i <= 20; i++) {
          const x = (i / 20) * w;
          const y = L.wallBase * (y0 + Math.sin((i / 20) * Math.PI) * sag);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        for (let i = 1; i < 14; i++) {
          const k = i / 14;
          const x = k * w;
          const y = L.wallBase * (y0 + Math.sin(k * Math.PI) * sag) + 2 * u;
          const a = 0.55 + 0.45 * Math.sin(t * 2.2 + i * 1.7 + y0 * 9);
          glow(g, x, y, 7 * u, cols[i % cols.length], 0.7 * a);
          g.fillStyle = cols[i % cols.length];
          g.globalAlpha = 0.6 + 0.4 * a;
          g.beginPath();
          g.arc(x, y, 0.9 * u, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
        }
      }
      break;
    }
    case 'bg_metro': {
      // The door signal blinks and the lit inside of the car flickers a little.
      const dx = w * 0.56;
      const dw = w * 0.24;
      const top = L.wallBase * 0.2;
      const bodyH = L.wallBase - top;
      const dy = top + bodyH * 0.06;
      const on = Math.sin(t * 5) > 0;
      glow(g, dx + dw / 2, dy - 3.5 * u, 6 * u, on ? '#FF4C5A' : '#7DFF6B', on ? 0.9 : 0.5);
      g.fillStyle = on ? '#FF4C5A' : '#7DFF6B';
      g.fillRect(dx + dw * 0.42, dy - 4.6 * u, dw * 0.16, 1.4 * u);
      glow(g, dx + dw / 2, dy + bodyH * 0.4, dw, 'rgba(255,230,160,1)', 0.12 + 0.04 * Math.sin(t * 3));
      break;
    }
    case 'bg_neon': {
      // Screens change color; a tube flickers.
      const cols = ['#37E6FF', '#FF3DC8', '#7DFF6B'];
      for (let i = 0; i < 3; i++) {
        const cx = w * (0.1 + i * 0.3) + w * 0.11;
        const a = 0.25 + 0.2 * Math.sin(t * 3 + i * 2);
        glow(g, cx, L.wallBase * 0.42 + 8 * u + L.wallBase * 0.1, w * 0.14, cols[(i + Math.floor(t / 2)) % 3], a);
      }
      const flick = Math.sin(t * 17) > 0.92 ? 0.1 : 0.5;
      glow(g, w * 0.5, L.wallBase * 0.16, w * 0.5, '#FF3DC8', flick);
      break;
    }
    case 'bg_winter': {
      // Falling snow in two layers and a few twinkling stars.
      const r = rng(5);
      for (let i = 0; i < 46; i++) {
        const layer = i % 2;
        const sp = layer ? 16 : 28;
        const x = ((r() * w + Math.sin(t * 0.8 + i) * 6 * u) % w + w) % w;
        const y = ((r() * h + t * sp * u * 0.5) % (h + 10)) - 5;
        g.fillStyle = `rgba(255,255,255,${layer ? 0.55 : 0.9})`;
        g.beginPath();
        g.arc(x, y, Math.max(0.8, u * (layer ? 0.35 : 0.55)), 0, Math.PI * 2);
        g.fill();
      }
      const rs = rng(21);
      for (let i = 0; i < 14; i++) {
        const a = 0.4 + 0.6 * Math.max(0, Math.sin(t * 1.5 + i * 2));
        g.fillStyle = `rgba(255,255,255,${0.5 * a})`;
        g.fillRect(rs() * w, rs() * L.wallBase * 0.5, Math.max(1, u * 0.4), Math.max(1, u * 0.4));
      }
      break;
    }
    case 'bg_space': {
      // Blinking console lights and now and then a shooting star in the window.
      const cols = ['#FF4C5A', '#7DFF6B', '#FFD640', '#37E6FF'];
      for (let i = 0; i < 6; i++) {
        const on = Math.sin(t * (1.4 + i * 0.37) + i) > -0.2;
        g.fillStyle = on ? cols[i % 4] : 'rgba(255,255,255,0.12)';
        g.fillRect(w * 0.8 + (i % 3) * w * 0.05, L.wallBase * 0.74 + Math.floor(i / 3) * 3.4 * u, 1.8 * u, 1.8 * u);
        if (on) glow(g, w * 0.8 + (i % 3) * w * 0.05 + u, L.wallBase * 0.74 + Math.floor(i / 3) * 3.4 * u + u, 5 * u, cols[i % 4], 0.5);
      }
      const p = (t % 7) / 7;
      if (p < 0.12) {
        const k = p / 0.12;
        const x = w * 0.2 + k * w * 0.3;
        const y = L.wallBase * 0.25 + k * L.wallBase * 0.2;
        g.strokeStyle = `rgba(255,255,255,${1 - k})`;
        g.lineWidth = Math.max(1, u * 0.4);
        g.beginPath();
        g.moveTo(x - 14 * u, y - 7 * u);
        g.lineTo(x, y);
        g.stroke();
      }
      break;
    }
    default:
      break;
  }
}

// ===========================================================================
// Public
// ===========================================================================

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Draws the chosen main-screen background. `id` is a catalog id, or undefined for the
 * default brick alley. `t` is the time in seconds (for the animated details).
 */
export function drawMenuBackdrop(g: Ctx, id: string | undefined, w: number, h: number, L: StageLayout, u: number, t: number): void {
  const painter = id ? PAINTERS[id] : undefined;
  if (!id || (id !== 'bg_dusk' && !painter)) {
    drawStageBackdrop(g, w, h, L, u);
    return;
  }
  if (id === 'bg_dusk') {
    // The yard, a little nicer: warm light, string lights, a soft vignette.
    drawStageBackdrop(g, w, h, L, u);
    const tint = g.createLinearGradient(0, 0, 0, h);
    tint.addColorStop(0, 'rgba(255,140,80,0.14)');
    tint.addColorStop(1, 'rgba(80,40,120,0.12)');
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    vignette(g, w, h, 0.25);
    animate(g, id, w, h, L, u, t);
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const key = `${id}:${Math.round(w)}x${Math.round(h)}@${dpr}:${u.toFixed(2)}`;
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 8) cache.clear();
    c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const b = c.getContext('2d');
    if (b && painter) {
      b.scale(dpr, dpr);
      painter(b, w, h, L, u);
    }
    cache.set(key, c);
  }
  g.drawImage(c, 0, 0, w, h);
  animate(g, id, w, h, L, u, t);
}
