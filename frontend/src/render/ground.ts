// The main-screen stage: the back wall of a brick alley and an asphalt street from edge to edge.
// The hero stands on the asphalt a little in front of the wall. Everything here is drawn once
// into a cached bitmap, then reused every frame.
//
// To add props later: put a draw function into `PROPS` (it receives the context, the stage
// size and the layout). Coordinates are in pixels; `u` is the size of one hero unit.

export interface StageLayout {
  /** Where the wall meets the asphalt. */
  wallBase: number;
  /** The line the hero's soles stand on. */
  feet: number;
  /** Pixels per hero unit when the hero is as tall as the free space above `feet`. */
  height: number;
}

/** Wall on the upper part, a wide street below it. */
export function stageLayout(h: number): StageLayout {
  const wallBase = h * 0.55;
  const feet = wallBase + (h - wallBase) * 0.52;
  return { wallBase, feet, height: h };
}

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

type Ctx = CanvasRenderingContext2D;
export type Prop = (g: Ctx, w: number, h: number, L: StageLayout, u: number) => void;

// ---------- Wall ----------

function brickWall(g: Ctx, w: number, L: StageLayout, u: number): void {
  const r = rng(77);
  const bw = Math.max(12, 10 * u);
  const bh = Math.max(5, 3.8 * u);
  const palette = ['#7B3B2D', '#6C3226', '#86442F', '#5E2C23', '#8C4B35', '#72372A'];
  g.fillStyle = '#2E2220'; // mortar
  g.fillRect(0, 0, w, L.wallBase);
  let row = 0;
  for (let y = 0; y < L.wallBase; y += bh, row++) {
    const off = row % 2 ? -bw / 2 : 0;
    for (let x = off; x < w; x += bw) {
      g.fillStyle = palette[Math.floor(r() * palette.length)];
      g.fillRect(x + 0.7, y + 0.7, bw - 1.4, bh - 1.4);
      // A lighter top edge and a darker bottom edge make every brick slightly raised.
      g.fillStyle = 'rgba(255,200,170,0.10)';
      g.fillRect(x + 0.7, y + 0.7, bw - 1.4, Math.max(1, bh * 0.14));
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(x + 0.7, y + bh - 0.7 - Math.max(1, bh * 0.16), bw - 1.4, Math.max(1, bh * 0.16));
      if (r() < 0.08) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(x + 0.7, y + 0.7, bw - 1.4, bh - 1.4);
      }
    }
  }
}

function wallLight(g: Ctx, w: number, L: StageLayout): void {
  // Dark at the top and at the sides.
  const top = g.createLinearGradient(0, 0, 0, L.wallBase);
  top.addColorStop(0, 'rgba(8,6,10,0.7)');
  top.addColorStop(0.55, 'rgba(8,6,10,0.18)');
  top.addColorStop(1, 'rgba(8,6,10,0.0)');
  g.fillStyle = top;
  g.fillRect(0, 0, w, L.wallBase);
  const sides = g.createLinearGradient(0, 0, w, 0);
  sides.addColorStop(0, 'rgba(8,6,10,0.4)');
  sides.addColorStop(0.2, 'rgba(8,6,10,0)');
  sides.addColorStop(0.8, 'rgba(8,6,10,0)');
  sides.addColorStop(1, 'rgba(8,6,10,0.45)');
  g.fillStyle = sides;
  g.fillRect(0, 0, w, L.wallBase);
}

// ---------- Props ----------

const door: Prop = (g, w, _h, L, u) => {
  const x = w * 0.035;
  const dw = Math.min(w * 0.15, 15 * u);
  const dh = 36 * u;
  const y = L.wallBase - dh;
  g.fillStyle = '#1B1614'; // frame
  g.fillRect(x - 2, y - 3, dw + 4, dh + 3);
  const gr = g.createLinearGradient(x, y, x + dw, y);
  gr.addColorStop(0, '#2F5A55');
  gr.addColorStop(1, '#24433F');
  g.fillStyle = gr; // steel door
  g.fillRect(x, y, dw, dh);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x + dw * 0.12, y + dh * 0.1, dw * 0.76, dh * 0.34);
  g.fillRect(x + dw * 0.12, y + dh * 0.52, dw * 0.76, dh * 0.38);
  g.fillStyle = '#C9A24A'; // handle
  g.beginPath();
  g.arc(x + dw * 0.8, y + dh * 0.55, Math.max(1.5, u * 0.7), 0, Math.PI * 2);
  g.fill();
  // A concrete step.
  g.fillStyle = '#5B6070';
  g.fillRect(x - 5, L.wallBase - 2, dw + 10, 3);
};

const lamp: Prop = (g, w, _h, L, u) => {
  const x = w * 0.115;
  const y = L.wallBase - 48 * u;
  // Bracket and shade.
  g.fillStyle = '#15110F';
  g.fillRect(x - 1, y - 2 * u, 2, 5 * u);
  g.beginPath();
  g.moveTo(x - 4 * u, y + 3 * u);
  g.lineTo(x + 4 * u, y + 3 * u);
  g.lineTo(x + 2.5 * u, y - 1 * u);
  g.lineTo(x - 2.5 * u, y - 1 * u);
  g.closePath();
  g.fill();
  // Warm light on the wall and the street.
  g.save();
  g.globalCompositeOperation = 'lighter';
  const cone = g.createRadialGradient(x, y + 4 * u, 1, x, y + 4 * u, 52 * u);
  cone.addColorStop(0, 'rgba(255,196,110,0.5)');
  cone.addColorStop(0.5, 'rgba(255,170,80,0.16)');
  cone.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = cone;
  g.fillRect(x - 56 * u, y - 20 * u, 112 * u, 90 * u);
  g.fillStyle = 'rgba(255,230,170,0.95)';
  g.beginPath();
  g.ellipse(x, y + 3.2 * u, 2.6 * u, 1 * u, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
};

const pipe: Prop = (g, w, _h, L, u) => {
  const x = w * 0.935;
  g.fillStyle = '#2A2C33';
  g.fillRect(x - u, 0, 2 * u, L.wallBase);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x - u, 0, 0.6 * u, L.wallBase);
  g.fillStyle = '#1B1C21';
  for (let y = 10 * u; y < L.wallBase; y += 34 * u) g.fillRect(x - 1.6 * u, y, 3.2 * u, 2.2 * u);
};

const crates: Prop = (g, w, _h, L, u) => {
  const x = w * 0.19;
  const box = (bx: number, by: number, bw: number, bh: number, c: string): void => {
    g.fillStyle = c;
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(bx, by + bh * 0.42, bw, 1.2);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(bx, by, bw, 1.4);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(bx + bw - 1.4, by, 1.4, bh);
  };
  box(x, L.wallBase - 9 * u, 10 * u, 9 * u, '#A47C4C');
  box(x + 10.6 * u, L.wallBase - 6.5 * u, 8 * u, 6.5 * u, '#946B3F');
  box(x + 2 * u, L.wallBase - 16 * u, 7 * u, 7 * u, '#B38A58');
};

const trashCan: Prop = (g, w, _h, L, u) => {
  const x = w * 0.8;
  const cw = 8.5 * u;
  const ch = 13 * u;
  const y = L.wallBase - ch;
  const gr = g.createLinearGradient(x, 0, x + cw, 0);
  gr.addColorStop(0, '#6D7480');
  gr.addColorStop(0.5, '#8C93A0');
  gr.addColorStop(1, '#575D68');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x + 0.5 * u, y);
  g.lineTo(x + cw - 0.5 * u, y);
  g.lineTo(x + cw, y + ch);
  g.lineTo(x, y + ch);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 1; i < 5; i++) g.fillRect(x + 0.2 * u, y + i * ch * 0.18, cw - 0.4 * u, 0.7);
  g.fillStyle = '#4C525D'; // lid
  g.fillRect(x - 0.6 * u, y - 1.4 * u, cw + 1.2 * u, 1.8 * u);
};

const manhole: Prop = (g, w, h, L, u) => {
  const cx = w * 0.64;
  const cy = L.feet + (h - L.feet) * 0.55;
  const rx = 10 * u;
  const ry = 3.4 * u;
  g.fillStyle = '#1C1F26';
  g.beginPath();
  g.ellipse(cx, cy, rx + 1.2, ry + 0.6, 0, 0, Math.PI * 2);
  g.fill();
  const gr = g.createLinearGradient(cx, cy - ry, cx, cy + ry);
  gr.addColorStop(0, '#4A505C');
  gr.addColorStop(1, '#343944');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(cx + i * rx * 0.24 - rx * 0.1, cy - ry * 0.8);
    g.lineTo(cx + i * rx * 0.24 + rx * 0.1, cy + ry * 0.8);
    g.stroke();
  }
};

const puddle: Prop = (g, w, h, L, u) => {
  const cx = w * 0.27;
  const cy = L.feet + (h - L.feet) * 0.62;
  const rx = 13 * u;
  const ry = 3 * u;
  const gr = g.createRadialGradient(cx, cy, 1, cx, cy, rx);
  gr.addColorStop(0, 'rgba(255,200,120,0.5)');
  gr.addColorStop(0.45, 'rgba(120,150,190,0.28)');
  gr.addColorStop(1, 'rgba(20,26,40,0.5)');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(cx, cy, rx * 0.8, ry * 0.7, 0, Math.PI * 1.05, Math.PI * 1.7);
  g.stroke();
};

const cone: Prop = (g, w, h, L, u) => {
  const x = w * 0.87;
  const by = L.feet + (h - L.feet) * 0.78;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(x, by, 5.2 * u, 1.4 * u, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2B2E36';
  g.fillRect(x - 4.6 * u, by - 1.4 * u, 9.2 * u, 1.8 * u);
  g.fillStyle = '#FF7A2B';
  g.beginPath();
  g.moveTo(x - 3.6 * u, by - 1.2 * u);
  g.lineTo(x - 0.9 * u, by - 11 * u);
  g.lineTo(x + 0.9 * u, by - 11 * u);
  g.lineTo(x + 3.6 * u, by - 1.2 * u);
  g.closePath();
  g.fill();
  g.fillStyle = '#F3EFE3';
  g.beginPath();
  g.moveTo(x - 2.6 * u, by - 5.2 * u);
  g.lineTo(x - 1.7 * u, by - 8.2 * u);
  g.lineTo(x + 1.7 * u, by - 8.2 * u);
  g.lineTo(x + 2.6 * u, by - 5.2 * u);
  g.closePath();
  g.fill();
};

const paper: Prop = (g, w, h, L, u) => {
  const x = w * 0.46;
  const y = L.feet + (h - L.feet) * 0.8;
  g.fillStyle = '#E6E1D2';
  g.beginPath();
  g.moveTo(x - 3 * u, y);
  g.lineTo(x - 1 * u, y - 2.4 * u);
  g.lineTo(x + 2.4 * u, y - 1.6 * u);
  g.lineTo(x + 3.2 * u, y + 0.6 * u);
  g.lineTo(x, y + 1.6 * u);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(x - 1 * u, y - 2.4 * u);
  g.lineTo(x + 0.4 * u, y + 0.2 * u);
  g.lineTo(x + 3.2 * u, y + 0.6 * u);
  g.stroke();
};

/** Add new street props here; they are drawn in this order, after the wall and the asphalt. */
export const PROPS: Prop[] = [door, lamp, pipe, crates, trashCan, puddle, manhole, paper, cone];

// ---------- Asphalt ----------

function asphalt(g: Ctx, w: number, h: number, L: StageLayout, u: number): void {
  const top = L.wallBase;
  // A concrete skirting at the foot of the wall.
  g.fillStyle = '#54586A';
  g.fillRect(0, top - 2, w, 3.5);
  const body = g.createLinearGradient(0, top + 1.5, 0, h);
  body.addColorStop(0, '#3F4450');
  body.addColorStop(1, '#262A33');
  g.fillStyle = body;
  g.fillRect(0, top + 1.5, w, h - top - 1.5);
  // Shadow where the wall meets the street.
  const sh = g.createLinearGradient(0, top, 0, top + 7 * u);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(0, top + 1.5, w, 7 * u);

  // Grain; specks grow towards the viewer.
  const r = rng(4242);
  const n = Math.round((w * (h - top)) / 90);
  for (let i = 0; i < n; i++) {
    const t = r();
    const y = top + 4 + t * (h - top - 4);
    const k = 0.35 + (y - top) / (h - top);
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.2)';
    g.fillRect(r() * w, y, Math.max(1, u * 0.7 * k), Math.max(1, u * 0.35 * k));
  }
  // Cracks.
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = Math.max(1, u * 0.28);
  const crack = (x0: number, y0: number, pts: [number, number][]): void => {
    g.beginPath();
    g.moveTo(x0, y0);
    for (const [dx, dy] of pts) g.lineTo(x0 + dx * u, y0 + dy * u);
    g.stroke();
  };
  crack(w * 0.1, top + (h - top) * 0.7, [[6, 2], [11, -1], [17, 3], [22, 1]]);
  crack(w * 0.72, top + (h - top) * 0.3, [[-5, 3], [-8, 7], [-14, 8]]);
  // Warm pool of light from the lamp.
  g.save();
  g.globalCompositeOperation = 'lighter';
  const pool = g.createRadialGradient(w * 0.2, L.feet, 2, w * 0.2, L.feet, w * 0.5);
  pool.addColorStop(0, 'rgba(255,190,110,0.2)');
  pool.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = pool;
  g.fillRect(0, top, w, h - top);
  g.restore();
}

// ---------- Public ----------

const cache = new Map<string, HTMLCanvasElement>();

/** Draws the wall, the asphalt and the props (from a cache). `u` is the hero scale. */
export function drawStageBackdrop(g: Ctx, w: number, h: number, L: StageLayout, u: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const key = `${Math.round(w)}x${Math.round(h)}@${dpr}:${u.toFixed(2)}`;
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 6) cache.clear();
    c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const b = c.getContext('2d');
    if (b) {
      b.scale(dpr, dpr);
      brickWall(b, w, L, u);
      wallLight(b, w, L);
      asphalt(b, w, h, L, u);
      for (const p of PROPS) p(b, w, h, L, u);
    }
    cache.set(key, c);
  }
  g.drawImage(c, 0, 0, w, h);
}
