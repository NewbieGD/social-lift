// The street under the hero on the main screen: an asphalt strip from edge to edge.
// The hero's soles stand on the top line (y = base). Props can later be placed on the same
// strip next to the hero: use `GROUND_DEPTH` (units below the line) and `groundLine`.

/** Depth of the asphalt below the standing line, in hero units. */
export const GROUND_DEPTH = 24;

export function drawGround(g: CanvasRenderingContext2D, w: number, base: number, h: number, unit: number): void {
  const depth = Math.max(4, h - base);
  // Curb: a thin lighter edge on top of the asphalt.
  const curb = Math.max(2, unit * 1.1);
  const top = g.createLinearGradient(0, base - curb * 0.2, 0, base + curb);
  top.addColorStop(0, '#8D93A0');
  top.addColorStop(1, '#6A7080');
  g.fillStyle = top;
  g.fillRect(0, base - curb * 0.2, w, curb * 1.2);

  // Asphalt body, a little darker towards the bottom.
  const body = g.createLinearGradient(0, base + curb, 0, base + depth);
  body.addColorStop(0, '#454A56');
  body.addColorStop(1, '#2B2F38');
  g.fillStyle = body;
  g.fillRect(0, base + curb, w, depth - curb);

  // Grain: deterministic specks, so the picture never flickers.
  let s = 12345;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const n = Math.round((w * depth) / 140);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = base + curb + rnd() * (depth - curb);
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.18)';
    g.fillRect(x, y, Math.max(1, unit * (0.3 + rnd() * 0.5)), Math.max(1, unit * 0.3));
  }

  // A cracked seam and a dashed road line far below the hero.
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = Math.max(1, unit * 0.25);
  g.beginPath();
  g.moveTo(w * 0.12, base + curb + depth * 0.25);
  g.lineTo(w * 0.2, base + curb + depth * 0.45);
  g.lineTo(w * 0.27, base + curb + depth * 0.4);
  g.stroke();

  // Soft contact shadow line where asphalt meets the curb.
  const sh = g.createLinearGradient(0, base + curb, 0, base + curb + unit * 2);
  sh.addColorStop(0, 'rgba(0,0,0,0.35)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(0, base + curb, w, unit * 2);
}
