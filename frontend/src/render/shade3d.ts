// "Soft 3D" shading for the hero: the same tricks a 3D render uses, done with Canvas paths
// and gradients (no filters). Key light from the top-left, a core shadow on the far side,
// a bit of reflected light at the edge, specular highlights, and outlines drawn in a dark
// shade of the part's own color instead of black.

export type P = { x: number; y: number };

const rgbCache = new Map<string, [number, number, number]>();

function rgbOf(color: string): [number, number, number] {
  let v = rgbCache.get(color);
  if (v) return v;
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    const m = color.match(/\d+/g) || ['0', '0', '0'];
    v = [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  rgbCache.set(color, v);
  return v;
}

/** Lighten (k > 0) or darken (k < 0) a color. */
export function tone(color: string, k: number): string {
  const [r, g, b] = rgbOf(color);
  const f = (c: number): number => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** Outline in a dark shade of the fill. */
export function edge(ctx: CanvasRenderingContext2D, base: string, w = 0.85): void {
  ctx.strokeStyle = tone(base, -0.58);
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** One continuous tapered limb path through a bent joint: no seam at the elbow or knee. */
export function limbPath(ctx: CanvasRenderingContext2D, a: P, j: P, e: P, wa: number, wj: number, we: number): void {
  const n = (p: P, q: P): P => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };
  };
  const n1 = n(a, j);
  const n2 = n(j, e);
  let nj = { x: n1.x + n2.x, y: n1.y + n2.y };
  const nl = Math.hypot(nj.x, nj.y) || 1;
  nj = { x: nj.x / nl, y: nj.y / nl };
  const at = (p: P, nn: P, k: number): P => ({ x: p.x + nn.x * k, y: p.y + nn.y * k });
  const a1 = at(a, n1, wa / 2);
  const j1 = at(j, nj, wj / 2);
  const e1 = at(e, n2, we / 2);
  const a2 = at(a, n1, -wa / 2);
  const j2 = at(j, nj, -wj / 2);
  const e2 = at(e, n2, -we / 2);
  const angE = Math.atan2(e.y - j.y, e.x - j.x);
  const angA = Math.atan2(j.y - a.y, j.x - a.x);
  ctx.beginPath();
  ctx.moveTo(a1.x, a1.y);
  ctx.quadraticCurveTo(j1.x, j1.y, (j1.x + e1.x) / 2, (j1.y + e1.y) / 2);
  ctx.lineTo(e1.x, e1.y);
  ctx.arc(e.x, e.y, we / 2, angE + Math.PI / 2, angE - Math.PI / 2, true);
  ctx.lineTo((j2.x + e2.x) / 2, (j2.y + e2.y) / 2);
  ctx.quadraticCurveTo(j2.x, j2.y, a2.x, a2.y);
  ctx.arc(a.x, a.y, wa / 2, angA - Math.PI / 2, angA + Math.PI / 2, true);
  ctx.closePath();
}

/** Points along the limb's center curve (for shading strokes). */
export function limbCurve(a: P, j: P, e: P, n = 10): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * j.x + t * t * e.x, y: u * u * a.y + 2 * u * t * j.y + t * t * e.y });
  }
  return out;
}

function offsetCurve(pts: P[], k: number): P[] {
  return pts.map((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)];
    const r = pts[Math.max(i - 1, 0)];
    const dx = q.x - r.x;
    const dy = q.y - r.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: p.x - (dy / l) * k, y: p.y + (dx / l) * k };
  });
}

function strokeCurve(ctx: CanvasRenderingContext2D, pts: P[], width: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/**
 * Fills the current limb path as a cylinder. `lit` picks which side faces the light
 * (+1 or -1 along the curve's normal).
 */
export function shadeCylinder(ctx: CanvasRenderingContext2D, curve: P[], w: number, base: string, lit: number): void {
  ctx.fillStyle = base;
  ctx.fill();
  ctx.save();
  ctx.clip();
  strokeCurve(ctx, offsetCurve(curve, -lit * w * 0.42), w * 0.5, tone(base, -0.3));
  strokeCurve(ctx, offsetCurve(curve, -lit * w * 0.62), w * 0.18, tone(base, -0.1));
  strokeCurve(ctx, offsetCurve(curve, lit * w * 0.16), w * 0.26, tone(base, 0.26));
  ctx.restore();
}

/** A full shaded limb: path, cylinder shading, outline. */
export function limb3d(
  ctx: CanvasRenderingContext2D,
  a: P,
  j: P,
  e: P,
  w: [number, number, number],
  base: string,
  lit = 1,
  lower?: string,
): void {
  limbPath(ctx, a, j, e, w[0], w[1], w[2]);
  shadeCylinder(ctx, limbCurve(a, j, e), (w[0] + w[2]) / 2, base, lit);
  if (lower && lower !== base) {
    // Lower part in another color (bare shin under shorts, bare forearm under a short sleeve).
    ctx.save();
    limbPath(ctx, a, j, e, w[0], w[1], w[2]);
    ctx.clip();
    const mid = { x: j.x, y: j.y };
    limbPath(ctx, mid, { x: (mid.x + e.x) / 2, y: (mid.y + e.y) / 2 }, e, w[1] + 1, (w[1] + w[2]) / 2 + 1, w[2] + 1);
    shadeCylinder(ctx, limbCurve(mid, { x: (mid.x + e.x) / 2, y: (mid.y + e.y) / 2 }, e), (w[1] + w[2]) / 2, lower, lit);
    ctx.restore();
  }
  limbPath(ctx, a, j, e, w[0], w[1], w[2]);
  edge(ctx, lower && lower !== base ? lower : base);
}

/** A shaded ellipsoid: key highlight top-left, core shadow bottom-right, faint rim light. */
export function sphere(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, base: string, rot = 0, outline = true): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, Math.min(rx, ry) * 0.1, 0, 0, Math.max(rx, ry) * 1.05);
  g.addColorStop(0, tone(base, 0.32));
  g.addColorStop(0.45, base);
  g.addColorStop(0.85, tone(base, -0.26));
  g.addColorStop(1, tone(base, -0.4));
  ctx.fillStyle = g;
  ctx.fill();
  if (outline) edge(ctx, base);
  ctx.restore();
}

/** A soft specular highlight. */
export function spec(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.65): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Horizontal "cylinder" gradient for a body (torso, belt): light left, shadow right. */
export function bodyGradient(ctx: CanvasRenderingContext2D, base: string, x0: number, x1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, tone(base, -0.16));
  g.addColorStop(0.28, tone(base, 0.2));
  g.addColorStop(0.55, base);
  g.addColorStop(0.9, tone(base, -0.34));
  g.addColorStop(1, tone(base, -0.12));
  return g;
}

/**
 * A metal flashlight along +x from its grip at 0,0: tail, body, wider head, and a glowing
 * lens seen at an angle (`lensTilt` = width of the lens ellipse; 0..3.4).
 */
export function torch3d(ctx: CanvasRenderingContext2D, len: number, lensTilt: number, light: string, chrome: boolean): void {
  const body = ctx.createLinearGradient(0, -2.5, 0, 2.5);
  if (chrome) {
    body.addColorStop(0, '#6D7482');
    body.addColorStop(0.3, '#F2F4F8');
    body.addColorStop(0.6, '#A9B0BD');
    body.addColorStop(1, '#5A606C');
  } else {
    body.addColorStop(0, '#1F232B');
    body.addColorStop(0.3, '#7B8394');
    body.addColorStop(0.55, '#3C4250');
    body.addColorStop(1, '#181A20');
  }
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-4.5, -2.2, len + 4.5, 4.4, 2);
  ctx.fill();
  ctx.strokeStyle = '#121418';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  const head = ctx.createLinearGradient(0, -3.4, 0, 3.4);
  head.addColorStop(0, chrome ? '#7D8492' : '#2A2E37');
  head.addColorStop(0.35, chrome ? '#FFFFFF' : '#9AA1AE');
  head.addColorStop(1, chrome ? '#626876' : '#22252D');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(len - 2.5, -2.3);
  ctx.lineTo(len + 1.5, -3.3);
  ctx.lineTo(len + 1.5, 3.3);
  ctx.lineTo(len - 2.5, 2.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(len + 1.5, 0, Math.max(0.6, lensTilt), 3.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#B7BDC8';
  ctx.fill();
  ctx.stroke();
  const lens = ctx.createRadialGradient(len + 1.2, -0.8, 0.2, len + 1.5, 0, 3);
  lens.addColorStop(0, '#FFFFFF');
  lens.addColorStop(0.5, `rgb(${light})`);
  lens.addColorStop(1, `rgba(${light},0.75)`);
  ctx.beginPath();
  ctx.ellipse(len + 1.6, 0, Math.max(0.4, lensTilt * 0.72), 2.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = lens;
  ctx.fill();
}

/** A fist around a held object (along +x): one rounded mass, finger creases, thumb on top. */
export function fist3d(ctx: CanvasRenderingContext2D, skin: string): void {
  ctx.beginPath();
  ctx.roundRect(-3.4, -3.5, 6.8, 7.2, 3);
  const g = ctx.createRadialGradient(-1.4, -1.6, 0.5, 0, 0, 5.4);
  g.addColorStop(0, tone(skin, 0.3));
  g.addColorStop(0.5, skin);
  g.addColorStop(1, tone(skin, -0.28));
  ctx.fillStyle = g;
  ctx.fill();
  edge(ctx, skin);
  ctx.strokeStyle = tone(skin, -0.45);
  ctx.lineWidth = 0.55;
  for (const y of [-1.5, 0.3, 2]) {
    ctx.beginPath();
    ctx.moveTo(1, y);
    ctx.quadraticCurveTo(2.9, y + 0.3, 3.2, y + 0.9);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-2.6, -3.1);
  ctx.quadraticCurveTo(0.6, -5.3, 2.8, -3.1);
  ctx.quadraticCurveTo(1, -2.3, -1.6, -2.1);
  ctx.closePath();
  const t = ctx.createLinearGradient(0, -5, 0, -2);
  t.addColorStop(0, tone(skin, 0.25));
  t.addColorStop(1, tone(skin, -0.2));
  ctx.fillStyle = t;
  ctx.fill();
  edge(ctx, skin);
}

/** An open hand (waving / resting): palm, thumb, slight finger split. */
export function hand3d(ctx: CanvasRenderingContext2D, skin: string, open: boolean): void {
  sphere(ctx, 0.6, 0, 3.4, 3, skin);
  if (open) {
    ctx.strokeStyle = tone(skin, -0.45);
    ctx.lineWidth = 0.5;
    for (const y of [-1, 0.4]) {
      ctx.beginPath();
      ctx.moveTo(2.2, y);
      ctx.lineTo(3.6, y + 0.2);
      ctx.stroke();
    }
  }
  sphere(ctx, -0.2, -2.6, 1.3, 1.8, skin, 0.5);
}
