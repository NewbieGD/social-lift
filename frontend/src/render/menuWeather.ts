// A living main screen: the time of day tints the background, the weather changes with the hour
// (rain, fog, wind with leaves, birds), and the props react to a tap (see menuState.ts).
// Pure drawing: the caller decides when it is allowed (not on weak devices, not with reduced effects).

import type { StageLayout } from './ground';

type Ctx = CanvasRenderingContext2D;

export type WeatherKind = 'none' | 'rain' | 'fog' | 'leaves' | 'birds';

const ALLOWED: Record<string, WeatherKind[]> = {
  default: ['rain', 'fog', 'leaves', 'birds', 'none'],
  bg_dusk: ['birds', 'leaves', 'none'],
  bg_roof: ['birds', 'fog', 'none'],
  bg_metro: ['none'],
  bg_neon: ['none'],
  bg_winter: ['none'],
  bg_space: ['none'],
};

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** True when the weather is chosen by hand with ?weather=... (for testing; it ignores the device level). */
export function weatherForced(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('weather');
}

/** The weather for a background at a time: it stays the same for three hours, then changes. */
export function weatherFor(bg: string | undefined, now = new Date()): WeatherKind {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('weather') : null;
  if (forced && ['none', 'rain', 'fog', 'leaves', 'birds'].includes(forced)) return forced as WeatherKind;
  const list = ALLOWED[bg ?? 'default'] ?? ['none'];
  const slot = Math.floor(now.getTime() / (3 * 3600 * 1000));
  let h = 0;
  for (const c of bg ?? 'default') h = (h * 31 + c.charCodeAt(0)) % 9973;
  return list[Math.floor(hash(slot + h) * list.length) % list.length];
}

/** How dark and what color the light is at an hour (0-23.99): returns an overlay color or null for daylight. */
export function dayTint(hour: number): string | null {
  if (hour >= 22 || hour < 5) return 'rgba(8,16,56,0.36)';
  if (hour < 7) return 'rgba(255,160,90,0.12)';
  if (hour < 9) return 'rgba(255,200,130,0.06)';
  if (hour < 17) return null;
  if (hour < 20) return 'rgba(255,130,60,0.13)';
  return 'rgba(60,40,110,0.24)';
}

export function drawDayTint(g: Ctx, w: number, h: number, hour: number): void {
  const c = dayTint(hour);
  if (!c) return;
  g.fillStyle = c;
  g.fillRect(0, 0, w, h);
}

/**
 * Weather in two layers: 'back' is drawn over the background (before the hero and the objects),
 * 'front' over everything (rain streaks, fog in front of the hero).
 */
export function drawWeather(g: Ctx, kind: WeatherKind, layer: 'back' | 'front', w: number, h: number, L: StageLayout, u: number, t: number): void {
  if (kind === 'none') return;
  if (kind === 'rain') {
    if (layer === 'back') {
      g.fillStyle = 'rgba(10,20,45,0.2)';
      g.fillRect(0, 0, w, h);
      // Ripples in puddles on the floor.
      g.strokeStyle = 'rgba(200,225,255,0.4)';
      g.lineWidth = Math.max(1, u * 0.25);
      for (let i = 0; i < 9; i++) {
        const ph = (t * 1.1 + hash(i) * 3) % 1;
        const x = hash(i + 7) * w;
        const y = L.wallBase + (h - L.wallBase) * (0.2 + hash(i + 13) * 0.75);
        g.globalAlpha = 1 - ph;
        g.beginPath();
        g.ellipse(x, y, (2 + ph * 9) * u * 0.45, (1 + ph * 3) * u * 0.45, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // Streaks fall in two layers: the far ones behind the hero, the near ones in front.
    const n = layer === 'back' ? 34 : 22;
    g.strokeStyle = layer === 'back' ? 'rgba(190,215,255,0.35)' : 'rgba(215,232,255,0.55)';
    g.lineWidth = layer === 'back' ? Math.max(1, u * 0.22) : Math.max(1.2, u * 0.34);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = layer === 'back' ? 2.2 : 3.4;
      const x = ((hash(i + (layer === 'back' ? 0 : 50)) * w + t * 30 * sp * 0.3) % (w + 40)) - 20;
      const y = ((hash(i + 91) * h + t * 220 * sp * 0.5) % (h + 40)) - 20;
      const len = (layer === 'back' ? 5 : 8) * u * 0.6;
      g.moveTo(x, y);
      g.lineTo(x - len * 0.25, y + len);
    }
    g.stroke();
    return;
  }
  if (kind === 'fog') {
    for (let i = 0; i < 3; i++) {
      const front = i === 2;
      if ((layer === 'front') !== front) continue;
      const y = L.wallBase * (0.45 + i * 0.28) + Math.sin(t * 0.3 + i) * 5 * u;
      const off = ((t * (6 + i * 3) * u * 0.2 + i * 90) % (w * 1.4)) - w * 0.2;
      const gr = g.createLinearGradient(0, y - 30 * u, 0, y + 30 * u);
      gr.addColorStop(0, 'rgba(210,220,235,0)');
      gr.addColorStop(0.5, `rgba(210,220,235,${front ? 0.18 : 0.26})`);
      gr.addColorStop(1, 'rgba(210,220,235,0)');
      g.fillStyle = gr;
      g.fillRect(-w * 0.2 + off - w * 1.4, y - 30 * u, w * 2.8, 60 * u);
      g.fillRect(-w * 0.2 + off, y - 30 * u, w * 2.8, 60 * u);
    }
    return;
  }
  if (kind === 'leaves') {
    if (layer !== 'front') return;
    // Wind blows leaves and bits of paper along the floor from left to right.
    for (let i = 0; i < 7; i++) {
      const sp = 26 + hash(i) * 30;
      const x = ((t * sp + hash(i + 3) * w * 1.6) % (w * 1.3)) - w * 0.15;
      const base = L.wallBase + (h - L.wallBase) * (0.3 + hash(i + 9) * 0.65);
      const y = base - Math.abs(Math.sin(t * 2.4 + i * 1.7)) * 9 * u * 0.5;
      g.save();
      g.translate(x, y);
      g.rotate(t * (2 + hash(i)) + i);
      g.fillStyle = ['#C8872B', '#9B5A1E', '#7E8F2E', '#D8C07A'][i % 4];
      g.beginPath();
      g.ellipse(0, 0, 2.6 * u * 0.55, 1.4 * u * 0.55, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    return;
  }
  if (kind === 'birds' && layer === 'back') {
    // A flock crosses the sky every half minute and is gone for the rest of the time.
    const cycle = (t / 28) % 1;
    if (cycle > 0.3) return;
    const k = cycle / 0.3;
    for (let i = 0; i < 4; i++) {
      const x = -20 + (k * 1.3 - i * 0.05) * (w + 40);
      const y = L.wallBase * (0.16 + i * 0.05) + Math.sin(k * 9 + i) * 4 * u;
      const flap = Math.sin(t * 11 + i * 1.3);
      g.strokeStyle = 'rgba(20,20,30,0.75)';
      g.lineWidth = Math.max(1.2, u * 0.4);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x - 4 * u * 0.6, y - flap * 2.2 * u * 0.6);
      g.quadraticCurveTo(x - 1.5 * u * 0.6, y - 2.2 * u * 0.6 + flap, x, y);
      g.quadraticCurveTo(x + 1.5 * u * 0.6, y - 2.2 * u * 0.6 + flap, x + 4 * u * 0.6, y - flap * 2.2 * u * 0.6);
      g.stroke();
    }
  }
}
