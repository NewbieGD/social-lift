// The crown of the weekly leader. A floating golden crown with a soft glow, a slow shine
// that runs across it and a few twinkling stars. It is drawn on its own, a little above the
// head, so it never collides with anything the hero wears (cap, glasses, helmet).
// Origin: the middle of the crown's base; y grows downward, the crown rises to about -13.

export const CROWN_LIFT_SIDE = 13; // how far above the head top the base floats (side view)
export const CROWN_LIFT_FRONT = 11; // the same for the front view

/** Gentle up and down float, in the hero's own units. */
export function crownBob(t: number): number {
  return Math.sin(t * 2.2) * 1.1;
}

/**
 * Draws the crown. `t` is a clock in seconds; `calm` turns off the rays and the stars
 * (the "less effects" setting) and keeps only a soft glow.
 */
export function drawCrown(ctx: CanvasRenderingContext2D, t: number, calm = false): void {
  ctx.save();

  // ---- Glow behind the crown ----
  const pulse = 0.75 + Math.sin(t * 3) * 0.25;
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, -6, 1, 0, -6, 20);
  halo.addColorStop(0, `rgba(255,214,90,${0.55 * pulse})`);
  halo.addColorStop(0.5, `rgba(255,170,40,${0.2 * pulse})`);
  halo.addColorStop(1, 'rgba(255,170,40,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-22, -28, 44, 44);

  if (!calm) {
    // Slowly turning rays.
    ctx.save();
    ctx.translate(0, -6);
    ctx.rotate(t * 0.5);
    ctx.fillStyle = `rgba(255,220,120,${0.12 * pulse})`;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-1.6, -19);
      ctx.lineTo(1.6, -19);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';

  // ---- Body of the crown ----
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(-10, -9); // left tip
    ctx.lineTo(-5, -4.6);
    ctx.lineTo(-2.6, -12); // second tip
    ctx.lineTo(0, -5.4);
    ctx.lineTo(2.6, -12);
    ctx.lineTo(5, -4.6);
    ctx.lineTo(10, -9);
    ctx.lineTo(9, 0);
    ctx.quadraticCurveTo(0, 1.8, -9, 0);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(0, -12, 0, 2);
  g.addColorStop(0, '#FFF1A8');
  g.addColorStop(0.45, '#FFC83A');
  g.addColorStop(1, '#C98A12');
  body();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = '#8A5A06';
  ctx.stroke();

  // Band at the bottom.
  ctx.beginPath();
  ctx.moveTo(-9, -1.2);
  ctx.quadraticCurveTo(0, 0.6, 9, -1.2);
  ctx.lineTo(9.2, 0.4);
  ctx.quadraticCurveTo(0, 2.4, -9.2, 0.4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(138,90,6,0.55)';
  ctx.fill();

  // Tip pearls.
  const pearl = (x: number, y: number, r: number): void => {
    const pg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0.2, x, y, r);
    pg.addColorStop(0, '#FFFFFF');
    pg.addColorStop(1, '#F5D56A');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  pearl(-10, -9.4, 1.35);
  pearl(-2.6, -12.4, 1.45);
  pearl(2.6, -12.4, 1.45);
  pearl(10, -9.4, 1.35);

  // Jewels: a ruby in the middle, two sapphires on the sides.
  const jewel = (x: number, y: number, r: number, c1: string, c2: string): void => {
    const jg = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.1, x, y, r * 1.1);
    jg.addColorStop(0, c1);
    jg.addColorStop(1, c2);
    ctx.fillStyle = jg;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,40,0,0.6)';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  };
  jewel(0, -2.6, 1.9, '#FF9AA4', '#C41830');
  jewel(-5.4, -2.2, 1.3, '#BFE0FF', '#2F6FD0');
  jewel(5.4, -2.2, 1.3, '#BFE0FF', '#2F6FD0');

  // ---- Shine running across the crown ----
  ctx.save();
  body();
  ctx.clip();
  const sx = ((t * 0.55) % 1.6) * 30 - 24;
  const shine = ctx.createLinearGradient(sx - 4, 0, sx + 4, 0);
  shine.addColorStop(0, 'rgba(255,255,255,0)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(-12, -14, 24, 17);
  ctx.restore();

  // ---- Twinkling stars ----
  if (!calm) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.9 + i * 0.37) % 1;
      const k = Math.sin(ph * Math.PI);
      const x = [-11, 3, 12][i];
      const y = [-14, -16, -8][i];
      const r = 2.4 * k;
      ctx.fillStyle = `rgba(255,248,200,${0.9 * k})`;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.3, y - r * 0.3);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + r * 0.3, y + r * 0.3);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.3, y + r * 0.3);
      ctx.lineTo(x - r, y);
      ctx.lineTo(x - r * 0.3, y - r * 0.3);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
