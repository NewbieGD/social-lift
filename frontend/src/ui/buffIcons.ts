// Small icons of the run bonus items shown under the wallet (items whose slot holds a style).
// Every icon is fitted into its frame by the real extent of the drawing, and its size on screen
// is set explicitly: without that a high-density phone shows the canvas at its pixel size,
// twice as big as the frame, and the icons sprawl.

import { drawItem, ITEM_BY_TIER, type Item } from '../render/hero';

const itemBoxes = new Map<string, { w: number; h: number; cx: number; cy: number }>();

/** The real extent of an item drawing (measured once): items differ a lot in size and offset. */
export function itemBox(item: Item): { w: number; h: number; cx: number; cy: number } {
  const known = itemBoxes.get(item);
  if (known) return known;
  const S = 4;
  const N = 160;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.translate(N / 2, N / 2);
  g.scale(S, S);
  drawItem(g, item);
  const px = g.getImageData(0, 0, N, N).data;
  let x0 = N;
  let y0 = N;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (px[(y * N + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const box =
    x1 < 0
      ? { w: 20, h: 20, cx: 0, cy: 0 }
      : { w: (x1 - x0 + 1) / S, h: (y1 - y0 + 1) / S, cx: ((x0 + x1) / 2 - N / 2) / S, cy: ((y0 + y1) / 2 - N / 2) / S };
  itemBoxes.set(item, box);
  return box;
}

export function buffIcon(tier: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // The size on screen is set explicitly: without it a high-density phone shows the canvas
  // at its pixel size, twice as big as the icon frame.
  c.width = Math.round(30 * dpr);
  c.height = Math.round(30 * dpr);
  c.style.width = '30px';
  c.style.height = '30px';
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  // A light plate so dark items (trousers, shoes, glasses) stay visible on the dark frame.
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.beginPath();
  g.roundRect(3, 3, 24, 24, 8);
  g.fill();
  g.translate(15, 15);
  // Fit the whole item into the frame, whatever its size.
  const item = ITEM_BY_TIER[tier] as Item;
  const k = 19 / Math.max(itemBox(item).w, itemBox(item).h);
  g.scale(k, k);
  g.translate(-itemBox(item).cx, -itemBox(item).cy);
  drawItem(g, item);
  return c;
}

