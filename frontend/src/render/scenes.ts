// Background tiles for each wealth tier. Everything is drawn with paths into an
// offscreen canvas once, then scrolled with parallax. Props are generic silhouettes
// with no brands or logos (rule 2.1.4). The middle of the screen stays calm for gameplay.
import { scenes } from './palette';

type G = CanvasRenderingContext2D;
type Rnd = () => number;

function rng(seed: number): Rnd {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function rect(g: G, x: number, y: number, w: number, h: number, c: string): void {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

function rr(g: G, x: number, y: number, w: number, h: number, r: number, c: string): void {
  const k = Math.min(r, w / 2, h / 2);
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
  g.fill();
}

/** Building facade along one edge with a window grid. */
function facade(
  g: G,
  r: Rnd,
  side: 'left' | 'right',
  W: number,
  H: number,
  o: { width: number; body: string; win: string; lit: number; winW: number; winH: number; gapX: number; gapY: number; balcony?: string; trim?: string },
): void {
  const x = side === 'left' ? 0 : W - o.width;
  rect(g, x, 0, o.width, H, o.body);
  if (o.trim) {
    rect(g, side === 'left' ? o.width - 4 : x, 0, 4, H, o.trim);
  }
  for (let wy = 10; wy < H - 10; wy += o.winH + o.gapY) {
    for (let wx = x + 8; wx < x + o.width - o.winW - 6; wx += o.winW + o.gapX) {
      const lit = r() < o.lit;
      rect(g, wx, wy, o.winW, o.winH, lit ? o.win : 'rgba(0,0,0,0.28)');
      if (lit) rect(g, wx + 1, wy + 1, o.winW - 2, 2, 'rgba(255,255,255,0.18)');
    }
    if (o.balcony && r() < 0.5) {
      rect(g, x + 4, wy + o.winH + 1, o.width - 8, 3, o.balcony);
    }
  }
}

function tree(g: G, x: number, y: number, s: number, leaf: string, trunk: string): void {
  rect(g, x - 2 * s, y - 10 * s, 4 * s, 12 * s, trunk);
  g.fillStyle = leaf;
  g.beginPath();
  g.arc(x, y - 16 * s, 10 * s, 0, Math.PI * 2);
  g.arc(x - 7 * s, y - 11 * s, 7 * s, 0, Math.PI * 2);
  g.arc(x + 7 * s, y - 11 * s, 7 * s, 0, Math.PI * 2);
  g.fill();
}

function palm(g: G, x: number, y: number, s: number, c: string): void {
  g.strokeStyle = c;
  g.lineWidth = 3 * s;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + 6 * s, y - 20 * s, x + 2 * s, y - 40 * s);
  g.stroke();
  g.fillStyle = c;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.7;
    g.beginPath();
    g.ellipse(x + 2 * s + Math.cos(a) * 10 * s, y - 40 * s + Math.sin(a) * 6 * s, 12 * s, 3 * s, a, 0, Math.PI * 2);
    g.fill();
  }
}

/** Generic car silhouette (no brand features). */
function car(g: G, x: number, y: number, s: number, c: string, sport = false): void {
  g.fillStyle = c;
  g.beginPath();
  if (sport) {
    g.moveTo(x, y);
    g.lineTo(x + 4 * s, y - 6 * s);
    g.lineTo(x + 14 * s, y - 9 * s);
    g.lineTo(x + 24 * s, y - 9 * s);
    g.lineTo(x + 34 * s, y - 5 * s);
    g.lineTo(x + 40 * s, y - 4 * s);
    g.lineTo(x + 40 * s, y);
  } else {
    g.moveTo(x, y);
    g.lineTo(x, y - 7 * s);
    g.lineTo(x + 8 * s, y - 8 * s);
    g.lineTo(x + 12 * s, y - 14 * s);
    g.lineTo(x + 26 * s, y - 14 * s);
    g.lineTo(x + 31 * s, y - 8 * s);
    g.lineTo(x + 38 * s, y - 7 * s);
    g.lineTo(x + 38 * s, y);
  }
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.arc(x + 9 * s, y, 3.5 * s, 0, Math.PI * 2);
  g.arc(x + 30 * s, y, 3.5 * s, 0, Math.PI * 2);
  g.fill();
}

function moto(g: G, x: number, y: number, s: number, c: string): void {
  g.strokeStyle = c;
  g.lineWidth = 2 * s;
  g.beginPath();
  g.arc(x, y - 4 * s, 4 * s, 0, Math.PI * 2);
  g.arc(x + 18 * s, y - 4 * s, 4 * s, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(x + 2 * s, y - 6 * s);
  g.lineTo(x + 8 * s, y - 12 * s);
  g.lineTo(x + 16 * s, y - 11 * s);
  g.lineTo(x + 18 * s, y - 5 * s);
  g.closePath();
  g.fill();
}

function column(g: G, x: number, y: number, h: number, w: number, c: string, cap: string): void {
  rect(g, x, y, w, h, c);
  rect(g, x - 3, y, w + 6, 5, cap);
  rect(g, x - 3, y + h - 5, w + 6, 5, cap);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 3; i < w - 2; i += 5) g.fillRect(x + i, y + 6, 1.5, h - 12);
}

function stars(g: G, r: Rnd, W: number, H: number, n: number, c: string): void {
  g.fillStyle = c;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.25 + r() * 0.6;
    g.beginPath();
    g.arc(r() * W, r() * H, 0.6 + r() * 1.3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function bins(g: G, x: number, y: number, c: string): void {
  rr(g, x, y - 22, 26, 22, 3, c);
  rect(g, x - 2, y - 25, 30, 4, 'rgba(0,0,0,0.35)');
  rr(g, x + 30, y - 18, 20, 18, 3, '#4E6B4A');
}

function rocket(g: G, x: number, y: number, s: number): void {
  rr(g, x - 5 * s, y - 60 * s, 10 * s, 50 * s, 4 * s, '#E8EDF3');
  g.fillStyle = '#E8EDF3';
  g.beginPath();
  g.moveTo(x - 5 * s, y - 58 * s);
  g.lineTo(x, y - 72 * s);
  g.lineTo(x + 5 * s, y - 58 * s);
  g.fill();
  g.fillStyle = '#C0283A';
  g.beginPath();
  g.moveTo(x - 5 * s, y - 18 * s);
  g.lineTo(x - 11 * s, y - 8 * s);
  g.lineTo(x - 5 * s, y - 10 * s);
  g.moveTo(x + 5 * s, y - 18 * s);
  g.lineTo(x + 11 * s, y - 8 * s);
  g.lineTo(x + 5 * s, y - 10 * s);
  g.fill();
  rect(g, x - 1.5 * s, y - 50 * s, 3 * s, 3 * s, '#5AA8FF');
}

function tower(g: G, x: number, w: number, H: number, c: string): void {
  g.strokeStyle = c;
  g.lineWidth = 2;
  rect(g, x, 0, 3, H, c);
  rect(g, x + w - 3, 0, 3, H, c);
  g.beginPath();
  for (let y = 0; y < H; y += 24) {
    g.moveTo(x, y);
    g.lineTo(x + w, y + 24);
    g.moveTo(x + w, y);
    g.lineTo(x, y + 24);
  }
  g.stroke();
}

/** Static layer: sky and horizon (does not scroll). */
export function paintSky(g: G, tier: number, W: number, H: number): void {
  const sc = scenes[Math.min(tier, scenes.length - 1)];
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, sc.skyTop);
  sky.addColorStop(1, sc.skyBottom);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const r = rng(500 + tier);
  if (tier === 10 || tier === 11) {
    // Sea on the horizon with the sun (terrace) or a yacht (island).
    const top = H * 0.7;
    rect(g, 0, top, W, H - top, tier === 11 ? '#0F8FA8' : 'rgba(40,70,120,0.75)');
    g.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 12; i++) g.fillRect(r() * W, top + 6 + r() * (H - top - 10), 12 + r() * 18, 2);
    if (tier === 10) {
      g.fillStyle = 'rgba(255,200,120,0.6)';
      g.beginPath();
      g.arc(W / 2, top, 36, Math.PI, 0);
      g.fill();
    } else {
      g.fillStyle = '#F4F7FA';
      g.beginPath();
      g.moveTo(W * 0.55, top);
      g.lineTo(W * 0.78, top);
      g.lineTo(W * 0.75, top + 9);
      g.lineTo(W * 0.58, top + 9);
      g.closePath();
      g.fill();
      rect(g, W * 0.6, top - 8, W * 0.1, 8, '#E2E8EE');
    }
  }
  if (tier === 12) stars(g, r, W, H, 50, '#ffffff');
}

/** Scrolling layer: edge structures and props on a transparent tile. */
export function paintScene(g: G, tier: number, W: number, H: number): void {
  const sc = scenes[Math.min(tier, scenes.length - 1)];
  const r = rng(1000 + tier * 97);

  switch (tier) {
    case 0: {
      // Courtyard: brick walls, bins, a single lamp.
      for (const side of ['left', 'right'] as const) {
        const x = side === 'left' ? 0 : W - 58;
        rect(g, x, 0, 58, H, '#3A3230');
        g.fillStyle = 'rgba(0,0,0,0.18)';
        for (let y = 0; y < H; y += 8) for (let bx = (y / 8) % 2 ? 0 : 7; bx < 58; bx += 14) g.fillRect(x + bx, y, 12, 1);
      }
      for (let y = 120; y < H; y += 220) {
        bins(g, 4, y, '#2F4F6F');
        bins(g, W - 54, y + 110, '#3F5F3F');
      }
      for (let y = 60; y < H; y += 260) {
        rect(g, 58, y, 3, 28, '#555');
        g.fillStyle = 'rgba(255,220,140,0.85)';
        g.beginPath();
        g.arc(66, y, 4, 0, Math.PI * 2);
        g.fill();
      }
      stars(g, r, W, H, 20, sc.dot);
      break;
    }
    case 1:
    case 2:
    case 3: {
      const tall = tier >= 2;
      const opts = {
        width: tall ? 74 : 64,
        body: sc.block,
        win: sc.window,
        lit: tier === 3 ? 0.75 : 0.5,
        winW: tall ? 9 : 10,
        winH: tall ? 11 : 12,
        gapX: tall ? 6 : 8,
        gapY: tall ? 9 : 14,
        balcony: tier === 1 ? '#5A6278' : undefined,
        trim: tier >= 2 ? (tier === 2 ? '#F2B62D' : '#FF8FA3') : undefined,
      };
      facade(g, r, 'left', W, H, opts);
      facade(g, r, 'right', W, H, opts);
      if (tier === 1) {
        // Laundry lines on old balconies.
        for (let y = 80; y < H; y += 190) {
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.beginPath();
          g.moveTo(64, y);
          g.lineTo(96, y + 6);
          g.stroke();
          rect(g, 72, y + 2, 7, 9, '#C86B6B');
          rect(g, 84, y + 4, 6, 8, '#6B9BC8');
        }
      }
      if (tier === 3) {
        for (let y = 150; y < H; y += 240) {
          car(g, 6, y, 1.4, '#1A1530');
          car(g, W - 62, y + 120, 1.4, '#2A2050');
        }
      }
      stars(g, r, W, H, tier === 2 ? 6 : 26, sc.dot);
      break;
    }
    case 4:
    case 5: {
      // Pretty house: light walls, big windows, trees (garden on tier 5).
      for (const side of ['left', 'right'] as const) {
        const x = side === 'left' ? 0 : W - 66;
        rect(g, x, 0, 66, H, '#EDE6D8');
        for (let y = 20; y < H; y += 70) {
          rr(g, x + 12, y, 42, 40, 4, 'rgba(70,110,140,0.85)');
          rect(g, x + 32, y, 2, 40, '#EDE6D8');
          rect(g, x + 10, y + 40, 46, 4, '#C9BFAE');
        }
      }
      for (let y = 100; y < H; y += tier === 5 ? 120 : 220) {
        tree(g, 78, y, tier === 5 ? 1.1 : 0.9, '#3E8E55', '#6B4A2E');
        tree(g, W - 78, y + 60, tier === 5 ? 1.1 : 0.9, '#4FA466', '#6B4A2E');
      }
      if (tier === 5) {
        for (let i = 0; i < 18; i++) {
          g.fillStyle = ['#FF8FA3', '#FFD640', '#C9A0FF'][i % 3];
          g.beginPath();
          g.arc(r() < 0.5 ? 66 + r() * 22 : W - 88 + r() * 22, r() * H, 2.4, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case 6:
    case 7: {
      // Mansion: columns, tall windows with chandeliers; cars and motorbikes on tier 7.
      for (const side of ['left', 'right'] as const) {
        const x = side === 'left' ? 0 : W - 70;
        rect(g, x, 0, 70, H, sc.block);
        for (let y = 0; y < H; y += 120) {
          rr(g, x + 14, y + 16, 42, 80, 20, sc.window);
          g.fillStyle = 'rgba(255,240,200,0.9)';
          g.beginPath();
          g.arc(x + 35, y + 40, 6, 0, Math.PI * 2);
          g.fill();
          rect(g, x + 34, y + 16, 2, 18, 'rgba(255,240,200,0.6)');
        }
        column(g, side === 'left' ? 64 : W - 74, 0, H, 10, '#E9E1CF', '#D4C8AE');
      }
      if (tier === 7) {
        for (let y = 140; y < H; y += 200) {
          car(g, 4, y, 1.5, '#C0283A', true);
          moto(g, W - 58, y + 100, 1.6, '#111');
        }
      }
      stars(g, r, W, H, 24, sc.dot);
      break;
    }
    case 8:
    case 9:
    case 10: {
      // Palace: gold columns, arches; red carpet on the entrance; sea at sunset on the terrace.
      for (const side of ['left', 'right'] as const) {
        const x = side === 'left' ? 0 : W - 72;
        rect(g, x, 0, 72, H, sc.block);
        for (let y = 0; y < H; y += 110) {
          g.fillStyle = sc.window;
          g.beginPath();
          g.moveTo(x + 14, y + 100);
          g.lineTo(x + 14, y + 40);
          g.arc(x + 36, y + 40, 22, Math.PI, 0);
          g.lineTo(x + 58, y + 100);
          g.closePath();
          g.fill();
          rect(g, x + 8, y + 100, 56, 6, '#E8C060');
        }
        column(g, side === 'left' ? 66 : W - 78, 0, H, 12, '#F1D58A', '#C99A2E');
      }
      if (tier === 9) {
        rect(g, W / 2 - 22, 0, 44, H, 'rgba(150,20,40,0.28)');
        for (let y = 30; y < H; y += 150) {
          rect(g, 88, y, 3, 30, '#2a2a2a');
          g.fillStyle = 'rgba(255,220,140,0.9)';
          g.beginPath();
          g.arc(89.5, y, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (tier === 10) {
        for (let y = 60; y < H; y += 40) rect(g, 84, y, 6, 30, 'rgba(240,230,210,0.6)');
      }
      stars(g, r, W, H, 18, sc.dot);
      break;
    }
    case 11: {
      // Private island: palms on rocky ledges (lightweight scene; sea and yacht are on the static layer).
      for (let y = 80; y < H; y += 170) {
        rr(g, -6, y + 60, 46, 10, 5, '#6B5A45');
        palm(g, 20, y + 60, 1.2, '#0B5A4A');
        rr(g, W - 44, y + 140, 50, 10, 5, '#6B5A45');
        palm(g, W - 26, y + 140, 1.1, '#0E6B57');
      }
      break;
    }
    default: {
      // Cosmodrome: launch towers and rockets (lightweight scene).
      tower(g, 10, 30, H, 'rgba(160,170,200,0.55)');
      tower(g, W - 40, 30, H, 'rgba(160,170,200,0.55)');
      for (let y = 140; y < H; y += 260) {
        rocket(g, 58, y + 80, 1.1);
        rocket(g, W - 58, y + 200, 0.9);
      }
    }
  }

}

/**
 * Extra parallax layers on transparent tiles that scroll at different speeds:
 * 0 - distant towers (slowest), 1 - clouds and haze, 2 - near drifting specks (fastest).
 * Nothing crosses the tile edge, so the tile repeats without a seam. They are faint and
 * stay away from the middle of the field, so they never hide a platform.
 */
export function paintParallax(g: G, tier: number, W: number, H: number, layer: 0 | 1 | 2): void {
  const sc = scenes[Math.min(tier, scenes.length - 1)];
  const r = rng(7000 + tier * 31 + layer * 977);
  if (layer === 0) {
    // Far skyline in two rows: the farthest is pale and hazy (it melts into the sky), the nearer
    // one is darker with lit windows. A mist at the foot of the tile hides the repeat.
    const row = (alpha: number, minH: number, spanH: number, color: string, winP: number, haze: number): void => {
      g.globalAlpha = alpha;
      let x = -10;
      while (x < W) {
        const w = 20 + r() * 40;
        const h = minH + r() * spanH;
        const top = H - 6 - h;
        rect(g, x, top, w, h, color);
        if (r() < 0.4) rect(g, x + w * 0.3, top - 8 - r() * 10, w * 0.4, 10, color); // roof block
        if (r() < 0.3) rect(g, x + w / 2 - 0.7, top - 22, 1.4, 22, color); // antenna
        g.globalAlpha = alpha * 1.6;
        for (let wy = top + 8; wy < H - 14; wy += 11) {
          for (let wx = x + 4; wx < x + w - 5; wx += 8) if (r() < winP) rect(g, wx, wy, 3, 4, sc.window);
        }
        g.globalAlpha = alpha;
        x += w + 2 + r() * 14;
      }
      // Haze: the lower part of the row fades into the sky color.
      g.globalAlpha = haze;
      const m = g.createLinearGradient(0, H - 150, 0, H);
      m.addColorStop(0, 'rgba(255,255,255,0)');
      m.addColorStop(1, sc.skyBottom);
      g.fillStyle = m;
      g.fillRect(0, H - 150, W, 150);
    };
    row(0.2, 120, H * 0.5, sc.dot, 0.05, 0.35);
    row(0.34, 80, H * 0.38, sc.block, 0.2, 0.4);
    // Fade the foot of the tile out completely, so the repeat has no visible seam.
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
    const cut = g.createLinearGradient(0, H - 90, 0, H);
    cut.addColorStop(0, 'rgba(0,0,0,0)');
    cut.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = cut;
    g.fillRect(0, H - 90, W, 90);
    g.globalCompositeOperation = 'source-over';
  } else if (layer === 1) {
    // Volumetric clouds: a lit top, a darker belly and a soft glow around them.
    const n = 6;
    for (let i = 0; i < n; i++) {
      const cy = 50 + (i / n) * (H - 100) + (r() - 0.5) * 30;
      const cx = r() * W;
      const s2 = 0.9 + r() * 1.1;
      const puffs = 6;
      for (let pass = 0; pass < 3; pass++) {
        for (let j = 0; j < puffs; j++) {
          const px = cx + (j - puffs / 2) * 13 * s2;
          const py = cy + Math.sin(j * 1.7) * 5 * s2 + (pass === 1 ? 3 : pass === 2 ? -2.5 : 0);
          const rad = (13 + ((j * 7) % 5)) * s2;
          g.globalAlpha = pass === 0 ? 0.07 : pass === 1 ? 0.13 : 0.1;
          g.fillStyle = pass === 1 ? sc.block : sc.dot;
          g.beginPath();
          g.arc(px, py, rad * (pass === 0 ? 1.5 : 1), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.globalAlpha = 1;
  } else {
    // Foreground close to the camera: big dark soft shapes at the edges and a few large blurred lights.
    for (let i = 0; i < 6; i++) {
      const left = i % 2 === 0;
      const y = (i / 6) * H + r() * 80;
      const rx = 26 + r() * 30;
      const ry = 60 + r() * 90;
      const x = left ? -rx * 0.35 : W + rx * 0.35;
      const gr = g.createRadialGradient(x, y, 0, x, y, ry);
      gr.addColorStop(0, 'rgba(4,6,10,0.55)');
      gr.addColorStop(0.6, 'rgba(4,6,10,0.22)');
      gr.addColorStop(1, 'rgba(4,6,10,0)');
      g.save();
      g.translate(x, y);
      g.scale(rx / ry, 1);
      g.translate(-x, -y);
      g.fillStyle = gr;
      g.fillRect(x - ry, y - ry, ry * 2, ry * 2);
      g.restore();
    }
    for (let i = 0; i < 7; i++) {
      const left = r() < 0.5;
      const x = left ? 6 + r() * 50 : W - 6 - r() * 50;
      const y = 20 + r() * (H - 40);
      const rad = 10 + r() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, sc.dot);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = 0.16 + r() * 0.1;
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.globalAlpha = 1;
  }
}
