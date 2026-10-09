// The story of the career told by the backgrounds of a run, stage by stage. Prototype: the first
// three stages.
//   0  the yard by the bins        (where it all begins)
//   1  the basement of the office  (an intern: pipes, boxes, a copier, a swinging bulb)
//   2  the car showroom            (the first car: glass, spotlights, a turntable, balloons)
// Everything static is drawn once into cached tiles (see scenes.ts and Renderer); the small living
// details are drawn on top each frame by drawStoryDecor, each with a slow period (no flicker), and
// are simply left out on weak phones. No brands or logos (rule 2.1.4): signs are generic words.
import { car, rect, rng, rr, type G } from './scenes';

export const STORY_TIERS = 3;

const WALL = 58;

// ------------------------------------------------------------------ the sky behind everything
export function paintStorySky(g: G, tier: number, W: number, H: number): void {
  const r = rng(900 + tier);
  if (tier === 0) {
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#18212C');
    s.addColorStop(1, '#3A4A50');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    // A few windows far away and the glow of the city.
    g.fillStyle = 'rgba(255,200,120,0.5)';
    for (let i = 0; i < 18; i++) g.fillRect(WALL + r() * (W - WALL * 2 - 4), r() * H, 3, 4);
  } else if (tier === 1) {
    // The back wall of a basement: dark concrete blocks with stains and a faint light from above.
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#2A2420');
    s.addColorStop(1, '#3C332D');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 1;
    for (let y = 0; y < H; y += 30) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      for (let x = (y / 30) % 2 ? 0 : 36; x < W; x += 72) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 30);
        g.stroke();
      }
    }
    for (let i = 0; i < 9; i++) {
      const sg = g.createRadialGradient(r() * W, r() * H, 2, r() * W, r() * H, 60);
      sg.addColorStop(0, 'rgba(0,0,0,0.16)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sg;
      g.fillRect(0, 0, W, H);
    }
  } else {
    // A glass wall of a showroom with the night city behind it.
    const s = g.createLinearGradient(0, 0, 0, H);
    s.addColorStop(0, '#0B1830');
    s.addColorStop(0.6, '#1E4472');
    s.addColorStop(1, '#3E7AAE');
    g.fillStyle = s;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 46; i++) {
      const x = r() * W;
      const y = H * 0.25 + r() * H * 0.75;
      const gl = g.createRadialGradient(x, y, 0, x, y, 6 + r() * 8);
      const warm = r() < 0.6;
      gl.addColorStop(0, warm ? 'rgba(255,214,140,0.8)' : 'rgba(150,220,255,0.7)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl;
      g.fillRect(x - 14, y - 14, 28, 28);
    }
    // Diagonal reflections on the glass.
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (const x of [W * 0.15, W * 0.5, W * 0.8]) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 26, 0);
      g.lineTo(x + 26 - H * 0.35, H);
      g.lineTo(x - H * 0.35, H);
      g.closePath();
      g.fill();
    }
  }
}

// ------------------------------------------------------------------ the scrolling tile (edges and props)
export function paintStoryTile(g: G, tier: number, W: number, H: number): void {
  if (tier === 0) return yardTile(g, W, H);
  if (tier === 1) return basementTile(g, W, H);
  return showroomTile(g, W, H);
}

/** Where the props of the yard stand on one storey of the wall (fractions of the tile height). */
const YARD = {
  winA: { x: 40, y: 0.1, w: 54, h: 70 },
  winB: { x: 292, y: 0.58, w: 50, h: 66 },
  lamp: { x: 262, y: 0.33 },
  box: { x: 98, y: 0.76 },
  poster: { x: 214, y: 0.14 },
  pipeX: 14,
};

function yardWindow(g: G, x: number, y: number, w: number, h: number, lit: boolean, bars: boolean): void {
  // A dark frame, a stone sill and a deep glass.
  g.fillStyle = '#1B1614';
  g.fillRect(x - 4, y - 4, w + 8, h + 8);
  const gl = g.createLinearGradient(x, y, x, y + h);
  if (lit) {
    gl.addColorStop(0, '#F2B866');
    gl.addColorStop(1, '#C97F32');
  } else {
    gl.addColorStop(0, '#26323F');
    gl.addColorStop(1, '#141B24');
  }
  g.fillStyle = gl;
  g.fillRect(x, y, w, h);
  // The mullions and a reflection.
  g.fillStyle = '#1B1614';
  g.fillRect(x + w / 2 - 1.2, y, 2.4, h);
  g.fillRect(x, y + h * 0.42, w, 2.4);
  g.fillStyle = lit ? 'rgba(255,240,200,0.28)' : 'rgba(180,210,255,0.12)';
  g.beginPath();
  g.moveTo(x + 3, y + 3);
  g.lineTo(x + w * 0.4, y + 3);
  g.lineTo(x + 3, y + h * 0.4);
  g.closePath();
  g.fill();
  if (bars) {
    g.fillStyle = '#6A7078';
    for (let bx = x + 6; bx < x + w - 2; bx += 8) g.fillRect(bx, y - 2, 2, h + 4);
  }
  // The sill, with a shadow under it on the wall.
  g.fillStyle = '#A8A39A';
  g.fillRect(x - 7, y + h + 4, w + 14, 5);
  g.fillStyle = '#D0CBC0';
  g.fillRect(x - 7, y + h + 4, w + 14, 1.6);
  const sh = g.createLinearGradient(0, y + h + 9, 0, y + h + 30);
  sh.addColorStop(0, 'rgba(0,0,0,0.38)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(x - 6, y + h + 9, w + 12, 22);
}

function flowerPot(g: G, x: number, y: number): void {
  g.fillStyle = '#B5562E';
  g.beginPath();
  g.moveTo(x - 7, y - 10);
  g.lineTo(x + 7, y - 10);
  g.lineTo(x + 5, y);
  g.lineTo(x - 5, y);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x - 5, y - 4, 10, 2);
  g.fillStyle = '#3F7A3C';
  for (const [dx, dy, rx] of [[-5, -15, 5], [0, -18, 5.5], [5, -14, 5]] as [number, number, number][]) {
    g.beginPath();
    g.ellipse(x + dx, y + dy, rx, 3.6, dx * 0.1, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#E8445A';
  for (const [dx, dy] of [[-4, -19], [3, -21], [6, -16]]) {
    g.beginPath();
    g.arc(x + dx, y + dy, 1.8, 0, Math.PI * 2);
    g.fill();
  }
}

function yardTile(g: G, W: number, H: number): void {
  const r = rng(77);
  // The brick wall of the main screen: a mortar bed, bricks of several reds with a lighter top edge,
  // a darker bottom edge and now and then a sooty one. The rows are fitted so that the tile repeats.
  const bw = 10;
  const rows = Math.max(2, 2 * Math.round(H / (2 * 3.8)));
  const bh = H / rows;
  const palette = ['#7B3B2D', '#6C3226', '#86442F', '#5E2C23', '#8C4B35', '#72372A'];
  g.fillStyle = '#2E2220';
  g.fillRect(0, 0, W, H);
  for (let row = 0; row < rows; row++) {
    const y = row * bh;
    const off = row % 2 ? -bw / 2 : 0;
    for (let x = off; x < W; x += bw) {
      g.fillStyle = palette[Math.floor(r() * palette.length)];
      g.fillRect(x + 0.7, y + 0.7, bw - 1.4, bh - 1.4);
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
  // Damp streaks and a patch of moss: the wall is old.
  for (let i = 0; i < 7; i++) {
    const x = 20 + r() * (W - 40);
    const y = r() * H;
    const sg = g.createLinearGradient(0, y, 0, y + 90);
    sg.addColorStop(0, 'rgba(10,8,8,0.28)');
    sg.addColorStop(1, 'rgba(10,8,8,0)');
    g.fillStyle = sg;
    g.fillRect(x, y, 6 + r() * 10, 90);
  }
  g.fillStyle = 'rgba(70,110,60,0.22)';
  for (const [mx, my] of [[0.5, 0.92], [0.18, 0.5], [0.8, 0.28]] as [number, number][]) {
    g.beginPath();
    g.ellipse(W * mx, H * my, 18, 7, 0, 0, Math.PI * 2);
    g.fill();
  }

  // A stone band at the top of every storey with its shadow.
  g.fillStyle = '#8C877C';
  g.fillRect(0, 0, W, 7);
  g.fillStyle = '#B6B1A4';
  g.fillRect(0, 0, W, 2);
  const cs = g.createLinearGradient(0, 7, 0, 30);
  cs.addColorStop(0, 'rgba(0,0,0,0.5)');
  cs.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = cs;
  g.fillRect(0, 7, W, 23);

  // The light of the main screen: the walls darken towards the sides, the middle stays light.
  const sides = g.createLinearGradient(0, 0, W, 0);
  sides.addColorStop(0, 'rgba(8,6,10,0.5)');
  sides.addColorStop(0.24, 'rgba(8,6,10,0)');
  sides.addColorStop(0.76, 'rgba(8,6,10,0)');
  sides.addColorStop(1, 'rgba(8,6,10,0.55)');
  g.fillStyle = sides;
  g.fillRect(0, 0, W, H);

  // Windows with their sills, a flower pot and bars.
  const a = YARD.winA;
  yardWindow(g, a.x, H * a.y, a.w, a.h, true, true);
  flowerPot(g, a.x + 14, H * a.y + a.h + 4);
  const b2 = YARD.winB;
  yardWindow(g, b2.x, H * b2.y, b2.w, b2.h, false, false);
  // Shutters on the second window.
  g.fillStyle = '#3F5F58';
  g.fillRect(b2.x - 14, H * b2.y - 2, 11, b2.h + 4);
  g.fillRect(b2.x + b2.w + 4, H * b2.y - 2, 11, b2.h + 4);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let sy = H * b2.y + 2; sy < H * b2.y + b2.h; sy += 6) {
    g.fillRect(b2.x - 14, sy, 11, 1.4);
    g.fillRect(b2.x + b2.w + 4, sy, 11, 1.4);
  }

  // A drainpipe along the left side with brackets and joints, and one more by the right edge.
  for (const px of [YARD.pipeX, W - 12]) {
    const pg = g.createLinearGradient(px, 0, px + 7, 0);
    pg.addColorStop(0, '#454C56');
    pg.addColorStop(0.45, '#8A929E');
    pg.addColorStop(1, '#3A4048');
    g.fillStyle = pg;
    g.fillRect(px, 0, 7, H);
    for (let y = 26; y < H; y += 72) {
      g.fillStyle = '#2A2F36';
      g.fillRect(px - 2, y, 11, 3);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(px + 7, y, 3, 3);
    }
    g.fillStyle = '#2F353D';
    g.fillRect(px - 1.5, H * 0.48, 10, 6);
  }

  // A wall lamp with a pool of warm light on the bricks.
  const lx = YARD.lamp.x;
  const ly = H * YARD.lamp.y;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const lg = g.createRadialGradient(lx, ly + 6, 0, lx, ly + 6, 84);
  lg.addColorStop(0, 'rgba(255,196,110,0.5)');
  lg.addColorStop(0.5, 'rgba(255,150,70,0.16)');
  lg.addColorStop(1, 'rgba(255,150,70,0)');
  g.fillStyle = lg;
  g.fillRect(lx - 84, ly - 78, 168, 168);
  g.restore();
  g.fillStyle = '#15110F';
  g.fillRect(lx - 1.2, ly - 12, 2.4, 12);
  g.fillRect(lx - 9, ly - 14, 18, 3);
  g.beginPath();
  g.moveTo(lx - 8, ly);
  g.quadraticCurveTo(lx, ly - 12, lx + 8, ly);
  g.closePath();
  g.fill();
  g.fillStyle = '#FFE9A8';
  g.beginPath();
  g.ellipse(lx, ly + 1.4, 4.2, 2.2, 0, 0, Math.PI * 2);
  g.fill();

  // A steel electrical box with a warning sign.
  const bx = YARD.box.x;
  const by = H * YARD.box.y;
  const eg = g.createLinearGradient(bx, by, bx + 32, by);
  eg.addColorStop(0, '#6A727C');
  eg.addColorStop(1, '#4A515A');
  g.fillStyle = '#15110F';
  g.fillRect(bx - 2, by - 2, 36, 52);
  g.fillStyle = eg;
  g.fillRect(bx, by, 32, 48);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(bx + 15, by, 1.6, 48);
  g.fillStyle = '#E8C030';
  g.beginPath();
  g.moveTo(bx + 16, by + 8);
  g.lineTo(bx + 26, by + 26);
  g.lineTo(bx + 6, by + 26);
  g.closePath();
  g.fill();
  g.fillStyle = '#15110F';
  g.fillRect(bx + 15, by + 13, 2, 6);
  g.fillRect(bx + 15, by + 21, 2, 2);
  g.fillStyle = '#C9A24A';
  g.fillRect(bx + 26, by + 30, 3, 5);
  // A conduit runs up from the box to the top of the tile.
  g.fillStyle = '#3A3F46';
  g.fillRect(bx + 4, 0, 3, by);

  // A torn poster held with tape, and scribbles of paint.
  g.save();
  g.translate(YARD.poster.x, H * YARD.poster.y);
  g.rotate(-0.05);
  g.fillStyle = '#E8E0C8';
  g.fillRect(0, 0, 38, 50);
  g.fillStyle = '#C0397A';
  g.fillRect(4, 4, 30, 12);
  g.fillStyle = 'rgba(40,40,60,0.55)';
  for (let ly2 = 22; ly2 < 44; ly2 += 5) g.fillRect(5, ly2, 24 + (ly2 % 3) * 2, 1.6);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(-3, -2, 9, 5);
  g.fillRect(32, -2, 9, 5);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.moveTo(30, 50);
  g.lineTo(38, 38);
  g.lineTo(38, 50);
  g.closePath();
  g.fill();
  g.restore();
  g.globalAlpha = 0.5;
  for (const [cx, cy, c] of [[0.62, 0.22, '#3AA0C0'], [0.7, 0.9, '#D8B030']] as [number, number, string][]) {
    rr(g, W * cx, H * cy, 22, 9, 4, c);
  }
  g.globalAlpha = 1;

  // Wires sag between the pipe, the box and the lamp.
  g.strokeStyle = 'rgba(12,10,10,0.85)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(YARD.pipeX + 7, H * 0.3);
  g.quadraticCurveTo(W * 0.3, H * 0.3 + 22, W * 0.52, H * 0.27);
  g.quadraticCurveTo(W * 0.66, H * 0.25 + 10, lx - 9, ly - 10);
  g.stroke();
  g.beginPath();
  g.moveTo(bx + 5, by - 2);
  g.quadraticCurveTo(W * 0.4, by - 28, W * 0.62, by - 4);
  g.stroke();
}

function basementTile(g: G, W: number, H: number): void {
  for (const side of ['left', 'right'] as const) {
    const x = side === 'left' ? 0 : W - WALL;
    const dir = side === 'left' ? 1 : -1;
    const inner = side === 'left' ? WALL : W - WALL;
    rect(g, x, 0, WALL, H, '#2C2724');
    g.fillStyle = 'rgba(0,0,0,0.26)';
    for (let y = 0; y < H; y += 26) g.fillRect(x, y, WALL, 1.5);
    // Three pipes run along the inner edge, with flanges and now and then a valve.
    const pipes: [number, string, number][] = [[7, '#B87333', 5], [15, '#6E7A84', 6], [24, '#3F6E9A', 5]];
    for (const [d, c, w] of pipes) {
      const px = inner - dir * d - (side === 'left' ? w : 0);
      rect(g, px, 0, w, H, c);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(px + 1, 0, 1.3, H);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(px + w - 1.5, 0, 1.5, H);
      for (let y = 20; y < H; y += 90) rect(g, px - 2, y, w + 4, 4, 'rgba(0,0,0,0.45)');
    }
    // A cable tray with cables.
    for (let y = 70; y < H; y += 180) {
      rect(g, x, y, WALL - 22, 5, '#3A3F46');
      g.fillStyle = '#1A1D22';
      g.fillRect(x, y + 5, WALL - 22, 2);
    }
  }
  // Shelves with boxes (left) and servers with lights (right); a copier by the wall.
  for (let y = 120; y < H; y += 220) {
    const bx = [6, 22, 12];
    const colors = ['#9A7440', '#B08850', '#8A6A3A'];
    rect(g, 2, y, 44, 4, '#5A4A38');
    for (let i = 0; i < 3; i++) {
      const bw = 14 + (i % 2) * 4;
      const bh = 12 + ((i * 5) % 8);
      rect(g, bx[i], y - bh, bw, bh, colors[i]);
      rect(g, bx[i] + bw / 2 - 1, y - bh, 2, bh, 'rgba(255,255,255,0.35)');
    }
    rect(g, 2, y + 40, 44, 4, '#5A4A38');
    rect(g, 6, y + 24, 16, 16, colors[0]);
    rect(g, 24, y + 28, 18, 12, colors[1]);
    // The plate on the door of the archive.
    rr(g, 4, y + 60, 40, 11, 2, '#CBB98A');
    g.fillStyle = '#4A3A22';
    g.font = '700 8px sans-serif';
    g.textAlign = 'center';
    g.fillText('АРХИВ', 24, y + 69);
    g.textAlign = 'left';
  }
  for (let y = 60; y < H; y += 300) {
    const sx = W - 48;
    rr(g, sx, y, 40, 84, 3, '#14181E');
    for (let i = 0; i < 6; i++) {
      rect(g, sx + 4, y + 6 + i * 13, 32, 9, '#222A33');
      rect(g, sx + 6, y + 8 + i * 13, 10, 2, '#0A0D12');
    }
  }
  for (let y = 250; y < H; y += 440) {
    // A copier.
    rr(g, 4, y, 46, 30, 3, '#A8AEB4');
    rect(g, 4, y, 46, 7, '#7A8088');
    rect(g, 10, y + 10, 18, 5, '#2A3036');
    rect(g, 32, y + 10, 12, 8, '#3A4048');
    rect(g, 6, y + 30, 6, 6, '#6A7078');
    rect(g, 42, y + 30, 6, 6, '#6A7078');
  }
}

function showroomTile(g: G, W: number, H: number): void {
  const r = rng(1200);
  for (const side of ['left', 'right'] as const) {
    const x = side === 'left' ? 0 : W - WALL;
    // A glass partition with frames.
    g.fillStyle = 'rgba(170,215,255,0.13)';
    g.fillRect(x, 0, WALL, H);
    g.strokeStyle = 'rgba(210,235,255,0.5)';
    g.lineWidth = 1.5;
    for (let vx = x; vx <= x + WALL; vx += WALL / 3) {
      g.beginPath();
      g.moveTo(vx, 0);
      g.lineTo(vx, H);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.1)';
    g.fillRect(x + 5, 0, 5, H);
    rect(g, side === 'left' ? WALL - 4 : x, 0, 4, H, '#3A4A62');
  }
  for (let y = 110; y < H; y += 300) {
    // A podium and a car on each side, in different colors.
    for (const [px, colorA, flip] of [[3, '#D8322C', 1], [W - WALL + 3, '#2C6BD8', 1]] as [number, string, number][]) {
      void flip;
      rr(g, px, y + 2, 52, 9, 4, '#E6EAF0');
      rr(g, px + 2, y + 9, 48, 3, 1.5, '#9AA4B0');
      car(g, px + 4, y - 1, 1.15, colorA, true);
      // The windscreen and the shine on the roof.
      g.fillStyle = 'rgba(190,225,255,0.55)';
      g.beginPath();
      g.moveTo(px + 4 + 15 * 1.15, y - 10 * 1.15 + 1);
      g.lineTo(px + 4 + 24 * 1.15, y - 10 * 1.15 + 1);
      g.lineTo(px + 4 + 31 * 1.15, y - 5 * 1.15);
      g.lineTo(px + 4 + 15 * 1.15, y - 5 * 1.15);
      g.closePath();
      g.fill();
    }
    // A banner on a stand between the cars.
    const bx = WALL + 4 + r() * 6;
    rect(g, bx, y - 36, 2, 36, '#7A8294');
    rr(g, bx - 10, y - 66, 22, 30, 3, '#C8242E');
    g.fillStyle = '#FFE08A';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? 3.2 : 7;
      g.lineTo(bx + 1 + Math.cos(a) * rad, y - 51 + Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
  }
  // A track with spotlights along the ceiling of every section.
  for (let y = 40; y < H; y += 300) {
    for (const x of [0, W - WALL]) {
      rect(g, x, y, WALL, 4, '#8A93A3');
      for (const sx of [x + 12, x + 38]) {
        rr(g, sx - 4, y + 4, 8, 7, 2, '#2A3040');
        g.fillStyle = 'rgba(255,245,200,0.9)';
        g.beginPath();
        g.arc(sx, y + 11, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

// ------------------------------------------------------------------ far layer of the parallax
export function paintStoryParallax(g: G, tier: number, W: number, H: number, layer: 0 | 1 | 2): void {
  if (layer !== 0 || tier === 0) return; // the yard wall is opaque: nothing shows behind it
  const r = rng(7700 + tier);
  if (tier === 0) {
    // Far roofs of the neighbourhood with a few lit windows.
    g.globalAlpha = 0.5;
    let x = -10;
    while (x < W) {
      const w = 24 + r() * 40;
      const h = 60 + r() * 130;
      rect(g, x, H - h - 6, w, h, '#2A3844');
      g.fillStyle = 'rgba(255,205,130,0.8)';
      for (let wy = H - h + 4; wy < H - 14; wy += 12) for (let wx = x + 4; wx < x + w - 5; wx += 9) if (r() < 0.25) g.fillRect(wx, wy, 3, 4);
      x += w + 2 + r() * 8;
    }
    g.globalAlpha = 1;
  } else if (tier === 1) {
    // Deep in the basement: far shelves and the dark arch of a corridor.
    g.globalAlpha = 0.5;
    for (let i = 0; i < 4; i++) {
      const y = (i + 0.5) * (H / 4);
      rect(g, W * 0.3, y, W * 0.4, 3, '#14100E');
      for (let k = 0; k < 5; k++) rect(g, W * 0.32 + k * 20, y - 10 - r() * 6, 14, 10 + r() * 6, '#1A1512');
    }
    g.globalAlpha = 1;
  } else {
    // A far row of lit buildings seen through the glass.
    g.globalAlpha = 0.45;
    let x = -6;
    while (x < W) {
      const w = 16 + r() * 28;
      const h = 80 + r() * 160;
      rect(g, x, H - h - 4, w, h, '#16294A');
      g.fillStyle = 'rgba(255,230,160,0.85)';
      for (let wy = H - h + 6; wy < H - 10; wy += 10) for (let wx = x + 3; wx < x + w - 4; wx += 7) if (r() < 0.3) g.fillRect(wx, wy, 2.4, 3.4);
      x += w + 2 + r() * 5;
    }
    g.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ living details (every frame)
/**
 * `off` is the scroll offset of the tile: every position is drawn twice (the tile is drawn twice),
 * like the painting of the tile itself. `low` leaves only the cheapest details.
 */
export function drawStoryDecor(ctx: CanvasRenderingContext2D, tier: number, W: number, H: number, off: number, t: number, low: boolean): void {
  const at = (y: number): number[] => [y + off - H, y + off];
  ctx.save();
  if (tier === 0) yardDecor(ctx, H, at, t, low);
  else if (tier === 1) basementDecor(ctx, W, H, at, t, low);
  else showroomDecor(ctx, W, H, at, t, low);
  ctx.restore();
}

function yardDecor(ctx: CanvasRenderingContext2D, H: number, at: (y: number) => number[], t: number, low: boolean): void {
  const wa = YARD.winA;
  const wb = YARD.winB;
  // The light of the lamp breathes a little, and a moth circles it.
  for (const sy of at(H * YARD.lamp.y)) {
    ctx.globalAlpha = 0.12 + 0.06 * Math.sin(t * 1.3);
    ctx.fillStyle = '#FFD88C';
    ctx.beginPath();
    ctx.arc(YARD.lamp.x, sy + 4, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!low) {
      ctx.fillStyle = 'rgba(255,244,210,0.95)';
      ctx.fillRect(YARD.lamp.x + Math.cos(t * 2.6) * 13, sy + 2 + Math.sin(t * 3.4) * 8, 1.6, 1.6);
    }
  }
  // A curtain in the lit window moves in the draught.
  for (const sy of at(H * wa.y)) {
    const sw = Math.sin(t * 1.1) * (low ? 1.5 : 3.5);
    ctx.fillStyle = 'rgba(230,80,100,0.82)';
    ctx.beginPath();
    ctx.moveTo(wa.x, sy);
    ctx.lineTo(wa.x + 18, sy);
    ctx.quadraticCurveTo(wa.x + 12 + sw, sy + wa.h * 0.5, wa.x + 15 + sw * 1.4, sy + wa.h * 0.9);
    ctx.lineTo(wa.x, sy + wa.h * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(wa.x + wa.w, sy);
    ctx.lineTo(wa.x + wa.w - 18, sy);
    ctx.quadraticCurveTo(wa.x + wa.w - 12 - sw, sy + wa.h * 0.5, wa.x + wa.w - 15 - sw * 1.4, sy + wa.h * 0.9);
    ctx.lineTo(wa.x + wa.w, sy + wa.h * 0.9);
    ctx.closePath();
    ctx.fill();
  }
  // A cat on the sill of the shuttered window, tail swishing.
  for (const sy of at(H * wb.y + wb.h + 4)) {
    const cx = wb.x + 12;
    ctx.fillStyle = 'rgba(15,15,20,0.95)';
    ctx.beginPath();
    ctx.ellipse(cx, sy - 6, 9, 6, 0, 0, Math.PI * 2);
    ctx.arc(cx + 8, sy - 13, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 5, sy - 16);
    ctx.lineTo(cx + 6, sy - 21);
    ctx.lineTo(cx + 9, sy - 16.5);
    ctx.moveTo(cx + 9, sy - 16.5);
    ctx.lineTo(cx + 11.5, sy - 21);
    ctx.lineTo(cx + 12.5, sy - 15);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,15,20,0.95)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, sy - 4);
    ctx.quadraticCurveTo(cx - 15, sy - 11 + Math.sin(t * 2.2) * 5, cx - 12 + Math.sin(t * 2.2) * 4, sy - 19);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,224,120,0.95)';
    ctx.fillRect(cx + 9, sy - 13, 1.6, 1.6);
  }
  if (low) return;
  // A crow on the electrical box: it shifts its wings now and then.
  for (const sy of at(H * YARD.box.y - 2)) {
    const flap = Math.sin(t * 0.7) > 0.93 ? Math.sin(t * 26) * 3.5 : 0;
    const cx = YARD.box.x + 16;
    ctx.fillStyle = '#0E1014';
    ctx.beginPath();
    ctx.ellipse(cx, sy - 5, 7, 4.6, -0.2, 0, Math.PI * 2);
    ctx.arc(cx - 7, sy - 9, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 10, sy - 9);
    ctx.lineTo(cx - 14.5, sy - 8);
    ctx.lineTo(cx - 10, sy - 7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 2, sy - 7);
    ctx.lineTo(cx + 6, sy - 12 - flap);
    ctx.lineTo(cx + 9, sy - 5);
    ctx.fill();
  }
  // A scrap of paper comes loose from the poster corner and flutters.
  for (const sy of at(H * YARD.poster.y + 46)) {
    const k = (t * 0.2) % 1;
    ctx.save();
    ctx.translate(YARD.poster.x + 30 + Math.sin(k * 14) * 8 * k, sy + k * 60);
    ctx.rotate(k * 6);
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#E8E0C8';
    ctx.fillRect(-4, -3, 8, 6);
    ctx.restore();
  }
}

function basementDecor(ctx: CanvasRenderingContext2D, W: number, H: number, at: (y: number) => number[], t: number, low: boolean): void {
  // A bare bulb on a wire swings, and its light moves with it.
  for (let y = 40; y < H; y += 240) {
    for (const sy of at(y)) {
      const a = Math.sin(t * 1.15 + y) * 0.28;
      const bx = 66 + Math.sin(a) * 26;
      const by = sy + Math.cos(a) * 26;
      ctx.strokeStyle = '#15110F';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(66, sy);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const flick = 0.85 + 0.15 * Math.sin(t * 7 + y * 0.3) * (Math.sin(t * 0.4 + y) > 0.9 ? 2 : 0.4);
      if (low) {
        ctx.fillStyle = `rgba(255,210,120,${0.22 * flick})`;
        ctx.beginPath();
        ctx.arc(bx, by, 24, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, 46);
        g.addColorStop(0, `rgba(255,210,120,${0.5 * flick})`);
        g.addColorStop(1, 'rgba(255,170,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(bx - 46, by - 46, 92, 92);
        ctx.restore();
      }
      ctx.fillStyle = '#FFF2C4';
      ctx.beginPath();
      ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2A2420';
      ctx.fillRect(bx - 2, by - 6, 4, 4);
    }
  }
  // Servers blink their lights slowly (green, now and then red).
  for (let y = 60; y < H; y += 300) {
    for (const sy of at(y)) {
      const sx = W - 48;
      for (let i = 0; i < 6; i++) {
        const on = Math.sin(t * (0.9 + (i % 3) * 0.35) + i * 2.3 + y) > -0.2;
        if (!on) continue;
        ctx.fillStyle = (i + Math.floor(t / 4)) % 5 === 0 ? '#FF5A4A' : '#52E07A';
        ctx.fillRect(sx + 28, sy + 10 + i * 13, 3, 3);
        if (i % 2 === 0) ctx.fillRect(sx + 23, sy + 10 + i * 13, 3, 3);
      }
    }
  }
  if (low) return;
  // Steam puffs out of a valve on the pipes.
  for (let y = 130; y < H; y += 180) {
    for (const sy of at(y)) {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i / 3 + y * 0.01) % 1;
        ctx.globalAlpha = 0.34 * Math.sin(ph * Math.PI);
        ctx.fillStyle = '#D8DEE6';
        ctx.beginPath();
        ctx.arc(WALL + 6 + ph * 14 + Math.sin(ph * 6 + i) * 3, sy - ph * 34, 3 + ph * 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  // The copier prints a sheet that slides out and flutters down.
  for (let y = 250; y < H; y += 440) {
    for (const sy of at(y)) {
      const ph = (t / 3.4 + y * 0.003) % 1;
      if (ph > 0.8) continue;
      const k = ph / 0.8;
      const sx = 26 + k * 30;
      const fy = sy + 10 + k * k * 46;
      ctx.save();
      ctx.translate(sx, fy);
      ctx.rotate(0.3 + Math.sin(k * 9) * 0.4 * k);
      ctx.globalAlpha = 1 - Math.max(0, (k - 0.7) / 0.3);
      ctx.fillStyle = '#F4F4EE';
      ctx.fillRect(-6, -4, 12, 8);
      ctx.fillStyle = 'rgba(40,40,60,0.45)';
      ctx.fillRect(-4, -2, 8, 1);
      ctx.fillRect(-4, 0.5, 6, 1);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function showroomDecor(ctx: CanvasRenderingContext2D, W: number, H: number, at: (y: number) => number[], t: number, low: boolean): void {
  // Spotlights sweep a little over the cars.
  for (let y = 40; y < H; y += 300) {
    for (const sy of at(y + 11)) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [sx, dir] of [[12, 1], [38, -1], [W - WALL + 12, 1], [W - WALL + 38, -1]] as [number, number][]) {
        const sw = Math.sin(t * 0.8 + sx * 0.1) * 0.12 * dir;
        // A flat translucent cone: no gradient to build on every frame.
        ctx.fillStyle = 'rgba(255,245,210,0.09)';
        ctx.beginPath();
        ctx.moveTo(sx - 2, sy);
        ctx.lineTo(sx + 2, sy);
        ctx.lineTo(sx + sw * 140 + 22, sy + 100);
        ctx.lineTo(sx + sw * 140 - 22, sy + 100);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
  // The turntable of each car: a ring and a light that runs around it.
  for (let y = 110; y < H; y += 300) {
    for (const sy of at(y)) {
      for (const px of [3, W - WALL + 3]) {
        const cx = px + 26;
        const cy = sy + 6;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 26, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        const a = t * 1.3 + px;
        ctx.fillStyle = '#FFF6C8';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 26, cy + Math.sin(a) * 5, 1.8, 0, Math.PI * 2);
        ctx.fill();
        // Headlights flash now and then.
        if (!low && Math.sin(t * 0.9 + px) > 0.9) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const hx = px + 4 + 38 * 1.15;
          const g = ctx.createRadialGradient(hx, sy - 4, 0, hx, sy - 4, 16);
          g.addColorStop(0, 'rgba(255,250,210,0.9)');
          g.addColorStop(1, 'rgba(255,250,210,0)');
          ctx.fillStyle = g;
          ctx.fillRect(hx - 16, sy - 20, 32, 32);
          ctx.restore();
        }
      }
    }
  }
  if (low) return;
  // Balloons tied to the banner stand, bobbing.
  for (let y = 110; y < H; y += 300) {
    for (const sy of at(y - 40)) {
      for (let i = 0; i < 3; i++) {
        const bx = WALL + 8 + i * 9 + Math.sin(t * 0.9 + i * 1.7) * 3;
        const by = sy - 30 - i * 5 + Math.sin(t * 1.3 + i) * 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(WALL + 5, sy + 4);
        ctx.lineTo(bx, by + 8);
        ctx.stroke();
        ctx.fillStyle = ['#FF6A8A', '#FFD25A', '#6FD6FF'][i];
        ctx.beginPath();
        ctx.ellipse(bx, by, 5, 6.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(bx - 2.4, by - 3.6, 1.6, 2.6);
      }
    }
  }
  // A neon sign blinks on the glass.
  for (let y = 190; y < H; y += 300) {
    for (const sy of at(y)) {
      const on = Math.sin(t * 2.1 + y) > -0.3;
      ctx.fillStyle = on ? 'rgba(255,90,150,0.95)' : 'rgba(255,90,150,0.3)';
      ctx.font = '800 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('АКЦИЯ', W - WALL / 2, sy);
      if (on) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(W - WALL / 2, sy - 3, 0, W - WALL / 2, sy - 3, 22);
        g.addColorStop(0, 'rgba(255,90,150,0.35)');
        g.addColorStop(1, 'rgba(255,90,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(W - WALL / 2 - 22, sy - 25, 44, 44);
        ctx.restore();
      }
      ctx.textAlign = 'left';
    }
  }
}
