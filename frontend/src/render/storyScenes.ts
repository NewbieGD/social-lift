// The story of the career told by the backgrounds of a run, stage by stage. Prototype: the first
// three stages.
//   0  the yard by the bins        (where it all begins)
//   1  the basement of the office  (an intern: pipes, boxes, a copier, a swinging bulb)
//   2  the car showroom            (the first car: glass, spotlights, a turntable, balloons)
// Everything static is drawn once into cached tiles (see scenes.ts and Renderer); the small living
// details are drawn on top each frame by drawStoryDecor, each with a slow period (no flicker), and
// are simply left out on weak phones. No brands or logos (rule 2.1.4): signs are generic words.
import { bins, car, rect, rng, rr, type G } from './scenes';

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

function yardTile(g: G, W: number, H: number): void {
  const r = rng(1000);
  for (const side of ['left', 'right'] as const) {
    const x = side === 'left' ? 0 : W - WALL;
    rect(g, x, 0, WALL, H, '#3C3331');
    g.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 0; y < H; y += 8) for (let bx = (y / 8) % 2 ? 0 : 7; bx < WALL; bx += 14) g.fillRect(x + bx, y, 12, 1);
    // The shade next to the open yard.
    const sg = g.createLinearGradient(side === 'left' ? WALL - 14 : x, 0, side === 'left' ? WALL : x + 14, 0);
    sg.addColorStop(side === 'left' ? 0 : 1, 'rgba(0,0,0,0)');
    sg.addColorStop(side === 'left' ? 1 : 0, 'rgba(0,0,0,0.35)');
    g.fillStyle = sg;
    g.fillRect(side === 'left' ? WALL - 14 : x, 0, 14, H);
    // A drainpipe along the inner edge.
    rect(g, side === 'left' ? WALL - 5 : x, 0, 5, H, '#59606A');
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(side === 'left' ? WALL - 4 : x + 1, 0, 1.4, H);
    for (let y = 40; y < H; y += 110) rect(g, side === 'left' ? WALL - 7 : x - 2, y, 9, 4, '#3A4048');
    // Splashes of paint on the bricks.
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = 0.45;
      g.fillStyle = ['#C0397A', '#3AA0C0', '#D8B030'][i];
      rr(g, x + 6 + r() * 20, 30 + i * (H / 3) + r() * 60, 14 + r() * 14, 8 + r() * 6, 4, g.fillStyle as string);
      g.globalAlpha = 1;
    }
  }
  // Windows with bars and fire escapes, bins and lamps.
  for (let y = 110; y < H; y += 260) {
    rect(g, 14, y, 22, 28, '#1A1E24');
    g.fillStyle = 'rgba(255,214,140,0.28)';
    g.fillRect(16, y + 2, 18, 24);
    g.fillStyle = '#6A7078';
    for (let bx = 18; bx < 34; bx += 5) g.fillRect(bx, y + 1, 1.6, 26);
    // A fire escape on the right wall: a landing, a rail and a ladder.
    const fx = W - WALL + 4;
    rect(g, fx, y + 70, 46, 3, '#4A5058');
    g.strokeStyle = '#5A6068';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(fx, y + 56);
    g.lineTo(fx + 46, y + 56);
    g.stroke();
    for (let bx = fx + 6; bx < fx + 46; bx += 9) {
      g.beginPath();
      g.moveTo(bx, y + 56);
      g.lineTo(bx, y + 70);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(fx + 4, y + 73);
    g.lineTo(fx + 4, y + 120);
    g.moveTo(fx + 14, y + 73);
    g.lineTo(fx + 14, y + 120);
    g.stroke();
    for (let ry = y + 78; ry < y + 120; ry += 7) {
      g.beginPath();
      g.moveTo(fx + 4, ry);
      g.lineTo(fx + 14, ry);
      g.stroke();
    }
  }
  for (let y = 150; y < H; y += 220) {
    bins(g, 4, y, '#2F4F6F');
    bins(g, W - 54, y + 110, '#3F5F3F');
  }
  for (let y = 60; y < H; y += 260) {
    rect(g, WALL, y, 14, 3, '#555');
    rect(g, WALL + 12, y - 2, 3, 8, '#555');
    g.fillStyle = 'rgba(255,224,150,0.95)';
    g.beginPath();
    g.arc(WALL + 14, y + 8, 4, 0, Math.PI * 2);
    g.fill();
  }
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
  if (layer !== 0) return;
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
  if (tier === 0) yardDecor(ctx, W, H, at, t, low);
  else if (tier === 1) basementDecor(ctx, W, H, at, t, low);
  else showroomDecor(ctx, W, H, at, t, low);
  ctx.restore();
}

function yardDecor(ctx: CanvasRenderingContext2D, W: number, H: number, at: (y: number) => number[], t: number, low: boolean): void {
  // A cat on the bins, tail swishing.
  for (let y = 150; y < H; y += 220) {
    for (const sy of at(y - 22)) {
      ctx.fillStyle = 'rgba(15,15,20,0.92)';
      ctx.beginPath();
      ctx.ellipse(14, sy - 5, 7, 5, 0, 0, Math.PI * 2);
      ctx.arc(20, sy - 11, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(18, sy - 14);
      ctx.lineTo(19, sy - 18);
      ctx.lineTo(21, sy - 14);
      ctx.moveTo(21, sy - 14);
      ctx.lineTo(23, sy - 18);
      ctx.lineTo(24, sy - 13);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,15,20,0.92)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, sy - 4);
      ctx.quadraticCurveTo(2, sy - 10 + Math.sin(t * 2.2) * 4, 4 + Math.sin(t * 2.2) * 3, sy - 16);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,120,0.9)';
      ctx.fillRect(21, sy - 12, 1.5, 1.5);
    }
  }
  // Lamps breathe, and a moth circles the light.
  for (let y = 60; y < H; y += 260) {
    for (const sy of at(y + 8)) {
      ctx.globalAlpha = 0.2 + 0.08 * Math.sin(t * 1.3 + y);
      ctx.fillStyle = '#FFDC8C';
      ctx.beginPath();
      ctx.arc(72, sy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!low) {
        ctx.fillStyle = 'rgba(255,240,200,0.9)';
        ctx.fillRect(72 + Math.cos(t * 2.6 + y) * 11, sy - 4 + Math.sin(t * 3.4 + y) * 7, 1.5, 1.5);
      }
    }
  }
  // Washing on a line between the wall and the drainpipe sways in the wind.
  for (let y = 110; y < H; y += 260) {
    for (const sy of at(y + 40)) {
      ctx.strokeStyle = 'rgba(200,200,210,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W - 58, sy);
      ctx.lineTo(W - 118, sy + 6);
      ctx.stroke();
      const colors = ['#D84A5A', '#E8E0C8', '#4A8AD8'];
      for (let i = 0; i < 3; i++) {
        const px = W - 66 - i * 17;
        const py = sy + 1 + (i * 2) / 1;
        const sw = Math.sin(t * 1.8 + i * 1.2 + y) * (low ? 1 : 2.6);
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + 10, py);
        ctx.lineTo(px + 10 + sw, py + 15);
        ctx.lineTo(px + sw * 0.5, py + 15);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  if (low) return;
  // A crow sits on the fire escape and every few seconds shifts its wings.
  for (let y = 110; y < H; y += 260) {
    for (const sy of at(y + 52)) {
      const flap = Math.sin(t * 0.7 + y) > 0.93 ? Math.sin(t * 26) * 3 : 0;
      const cx = W - 36;
      ctx.fillStyle = '#0E1014';
      ctx.beginPath();
      ctx.ellipse(cx, sy, 6, 4, -0.2, 0, Math.PI * 2);
      ctx.arc(cx - 6, sy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 8.5, sy - 3);
      ctx.lineTo(cx - 12, sy - 2);
      ctx.lineTo(cx - 8.5, sy - 1);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 2, sy - 1);
      ctx.lineTo(cx + 5, sy - 5 - flap);
      ctx.lineTo(cx + 8, sy);
      ctx.fill();
    }
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
