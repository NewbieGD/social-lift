// The look of the government: the diamond crown of the mayor, the glow of the mayor and of his
// assistants, and the throne. Pure drawing; the callers decide when and where.

type Ctx = CanvasRenderingContext2D;

export type GovRole = 'mayor' | 'assistant' | null;

/**
 * The mayor's crown: platinum and gold with a large diamond in the middle and small ones on the tips.
 * The metal shimmers with a slow rainbow and the diamond flashes. Origin: the middle of the base,
 * y grows downward, the crown rises to about -14 (like the leader's crown, so it replaces it).
 */
export function drawMayorCrown(ctx: Ctx, t: number, calm = false): void {
  ctx.save();
  const pulse = 0.75 + Math.sin(t * 3) * 0.25;
  // Glow: white-gold with a cool edge.
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, -7, 1, 0, -7, 24);
  halo.addColorStop(0, `rgba(255,250,225,${0.6 * pulse})`);
  halo.addColorStop(0.45, `rgba(255,205,90,${0.22 * pulse})`);
  halo.addColorStop(1, 'rgba(150,210,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-26, -32, 52, 52);
  ctx.globalCompositeOperation = 'source-over';

  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-11.5, -10);
    ctx.lineTo(-6, -5.4);
    ctx.lineTo(-3.4, -13);
    ctx.lineTo(0, -6.4);
    ctx.lineTo(3.4, -13);
    ctx.lineTo(6, -5.4);
    ctx.lineTo(11.5, -10);
    ctx.lineTo(10, 0);
    ctx.closePath();
  };
  path();
  // The metal: gold with a rainbow sheen that slides across.
  const sheen = (t * 40) % 120;
  const g = ctx.createLinearGradient(-12 + sheen - 60, 0, 12 + sheen - 60, -14);
  g.addColorStop(0, '#E8B53A');
  g.addColorStop(0.3, '#FFF2B0');
  g.addColorStop(0.5, `hsl(${(t * 60) % 360},85%,78%)`);
  g.addColorStop(0.7, '#FFD25A');
  g.addColorStop(1, '#C98A12');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = '#8A5A0A';
  ctx.stroke();
  // The band.
  ctx.fillStyle = '#7A1020';
  ctx.fillRect(-9.6, -2.4, 19.2, 2.2);
  // Small diamonds on the tips.
  const gem = (x: number, y: number, r: number, hue: number): void => {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.8, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.8, y);
    ctx.closePath();
    const gg = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    gg.addColorStop(0, '#FFFFFF');
    gg.addColorStop(0.5, `hsl(${hue},90%,82%)`);
    gg.addColorStop(1, '#8FD3FF');
    ctx.fillStyle = gg;
    ctx.fill();
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = 'rgba(40,70,120,0.7)';
    ctx.stroke();
  };
  gem(-11.2, -10.2, 1.5, 200);
  gem(11.2, -10.2, 1.5, 200);
  gem(-3.4, -13.4, 1.4, 190);
  gem(3.4, -13.4, 1.4, 190);
  // The big diamond.
  gem(0, -7, 3.6, 205 + Math.sin(t * 2) * 25);
  if (!calm) {
    // Flashes of light on the diamond.
    const k = (t * 0.9) % 1;
    const a = Math.sin(k * Math.PI);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-6 * a, -7);
    ctx.lineTo(6 * a, -7);
    ctx.moveTo(0, -7 - 6 * a);
    ctx.lineTo(0, -7 + 6 * a);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The glow of a post holder around the hero (hero frame, `cy` is the middle of the body). The mayor
 * gets the richest one: a white-gold light with a slow rainbow veil and rising sparks of light. An
 * assistant gets a calmer, silver-blue light, so that it does not stand out as much.
 */
export function drawGovAura(ctx: Ctx, role: GovRole, t: number, cy = -30, calm = false): void {
  if (!role) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const mayor = role === 'mayor';
  const breathe = 0.9 + 0.1 * Math.sin(t * 1.8);
  const r = (mayor ? 58 : 46) * breathe;
  const g = ctx.createRadialGradient(0, cy, 4, 0, cy, r);
  if (mayor) {
    g.addColorStop(0, 'rgba(255,248,215,0.42)');
    g.addColorStop(0.5, 'rgba(255,200,90,0.2)');
    g.addColorStop(1, 'rgba(255,200,90,0)');
  } else {
    g.addColorStop(0, 'rgba(225,238,255,0.3)');
    g.addColorStop(0.55, 'rgba(150,190,255,0.14)');
    g.addColorStop(1, 'rgba(150,190,255,0)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(-r, cy - r, r * 2, r * 2);
  if (!calm) {
    // Veils of light that turn slowly around the hero (the mayor's ones take the colors of a diamond).
    const n = mayor ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = t * (mayor ? 0.5 : 0.35) + (i / n) * Math.PI * 2;
      const x = Math.cos(a) * (mayor ? 26 : 22);
      const y = cy + Math.sin(a) * (mayor ? 34 : 28);
      const hue = mayor ? (t * 50 + i * 70) % 360 : 215;
      const sg = ctx.createRadialGradient(x, y, 0, x, y, mayor ? 11 : 8);
      sg.addColorStop(0, mayor ? `hsla(${hue},90%,80%,0.4)` : 'rgba(210,225,255,0.25)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x - 12, y - 12, 24, 24);
    }
    // Small sparks of light that rise and fade.
    const sparks = mayor ? 10 : 5;
    for (let i = 0; i < sparks; i++) {
      const ph = (t * 0.22 + i * 0.137) % 1;
      const x = Math.sin(i * 3.1 + t * 0.5) * 20;
      const y = cy + 34 - ph * 74;
      const a = Math.sin(ph * Math.PI) * (mayor ? 0.9 : 0.55);
      const sg = ctx.createRadialGradient(x, y, 0, x, y, 2.4);
      sg.addColorStop(0, `rgba(255,252,235,${a})`);
      sg.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
    }
  }
  ctx.restore();
}

const avatarCache = new Map<string, HTMLImageElement | null>();

/** An avatar image that loads once; null until it is ready (or if it fails). */
export function avatar(url: string | null | undefined): HTMLImageElement | null {
  if (!url) return null;
  if (avatarCache.has(url)) {
    const img = avatarCache.get(url) ?? null;
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => avatarCache.set(url, null);
  img.src = url;
  avatarCache.set(url, img);
  return null;
}

/**
 * The hall with the throne for the Government screen. Empty: a cold light and dust in the air.
 * With a mayor: the throne is lit in gold, light rays fan out behind it, and the mayor sits on it
 * (his profile picture) with the diamond crown over his head.
 */
export function drawThrone(
  ctx: Ctx,
  w: number,
  h: number,
  t: number,
  mayor: { name: string | null; photo: string | null } | null,
): void {
  ctx.clearRect(0, 0, w, h);
  // The hall.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, mayor ? '#2A1D3E' : '#171B28');
  bg.addColorStop(1, mayor ? '#46263A' : '#1E2433');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // Columns on both sides and a red carpet running to the throne.
  for (const sd of [-1, 1]) {
    const x = w / 2 + sd * w * 0.4;
    const cg = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
    cg.addColorStop(0, '#3A3F55');
    cg.addColorStop(0.5, '#6A7090');
    cg.addColorStop(1, '#2C3045');
    ctx.fillStyle = cg;
    ctx.fillRect(x - 12, h * 0.06, 24, h * 0.8);
    ctx.fillStyle = '#8A90B0';
    ctx.fillRect(x - 15, h * 0.04, 30, 9);
    ctx.fillRect(x - 15, h * 0.86, 30, 9);
  }
  ctx.fillStyle = mayor ? '#A01830' : '#5C1A28';
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h * 0.62);
  ctx.lineTo(w * 0.58, h * 0.62);
  ctx.lineTo(w * 0.8, h);
  ctx.lineTo(w * 0.2, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = mayor ? '#E8B53A' : '#6A5A3A';
  ctx.lineWidth = 2;
  ctx.stroke();

  const cx = w / 2;
  const sy = h * 0.58; // the seat
  // Light behind the throne.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (mayor) {
    ctx.translate(cx, h * 0.38);
    ctx.rotate(t * 0.15);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      const rg = ctx.createLinearGradient(0, 0, 0, -h * 0.75);
      rg.addColorStop(0, 'rgba(255,225,140,0.3)');
      rg.addColorStop(1, 'rgba(255,225,140,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.lineTo(16, -h * 0.75);
      ctx.lineTo(-16, -h * 0.75);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    const dust = ctx.createRadialGradient(cx, h * 0.4, 8, cx, h * 0.4, w * 0.45);
    dust.addColorStop(0, 'rgba(150,175,255,0.16)');
    dust.addColorStop(1, 'rgba(150,175,255,0)');
    ctx.fillStyle = dust;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // The throne: a tall pointed back, a seat with a cushion, arms and legs.
  const gold = ctx.createLinearGradient(cx - 40, 0, cx + 40, 0);
  const lit = mayor ? 1 : 0.55;
  gold.addColorStop(0, `rgba(${Math.round(150 * lit + 40)},${Math.round(105 * lit + 35)},${Math.round(20 * lit + 25)},1)`);
  gold.addColorStop(0.5, `rgba(${Math.round(255 * lit)},${Math.round(215 * lit + 20)},${Math.round(110 * lit + 30)},1)`);
  gold.addColorStop(1, `rgba(${Math.round(150 * lit + 40)},${Math.round(105 * lit + 35)},${Math.round(20 * lit + 25)},1)`);
  ctx.fillStyle = gold;
  ctx.strokeStyle = mayor ? '#7A4F0A' : '#3A3424';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 40, sy);
  ctx.lineTo(cx - 40, h * 0.18);
  ctx.lineTo(cx - 26, h * 0.12);
  ctx.lineTo(cx - 14, h * 0.2);
  ctx.lineTo(cx, h * 0.06);
  ctx.lineTo(cx + 14, h * 0.2);
  ctx.lineTo(cx + 26, h * 0.12);
  ctx.lineTo(cx + 40, h * 0.18);
  ctx.lineTo(cx + 40, sy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // The red velvet of the back and the seat.
  ctx.fillStyle = mayor ? '#B01C34' : '#4E1A26';
  ctx.beginPath();
  ctx.moveTo(cx - 30, sy);
  ctx.lineTo(cx - 30, h * 0.24);
  ctx.quadraticCurveTo(cx, h * 0.16, cx + 30, h * 0.24);
  ctx.lineTo(cx + 30, sy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = gold;
  ctx.fillRect(cx - 46, sy - 6, 92, 16); // seat
  ctx.strokeRect(cx - 46, sy - 6, 92, 16);
  ctx.fillRect(cx - 52, sy - 22, 12, 36); // arms
  ctx.fillRect(cx + 40, sy - 22, 12, 36);
  ctx.strokeRect(cx - 52, sy - 22, 12, 36);
  ctx.strokeRect(cx + 40, sy - 22, 12, 36);
  ctx.fillRect(cx - 42, sy + 10, 10, 26);
  ctx.fillRect(cx + 32, sy + 10, 10, 26);
  // Jewels on the back of the throne.
  for (const [dx, dy, c] of [[0, 0.1, '#7FD3FF'], [-26, 0.15, '#FF6A8A'], [26, 0.15, '#FF6A8A']] as [number, number, string][]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx + dx, h * dy + h * 0.045, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (mayor) {
    // The mayor: a round portrait in a golden frame on the throne, and the crown above.
    const r = 30;
    const py = sy - 38;
    ctx.save();
    ctx.shadowColor = 'rgba(255,215,100,0.9)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, py, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#E8B53A';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, py, r, 0, Math.PI * 2);
    ctx.clip();
    const img = avatar(mayor.photo);
    if (img) ctx.drawImage(img, cx - r, py - r, r * 2, r * 2);
    else {
      ctx.fillStyle = '#4A5A8A';
      ctx.fillRect(cx - r, py - r, r * 2, r * 2);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${r}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((mayor.name || '?').slice(0, 1).toUpperCase(), cx, py + 2);
    }
    ctx.restore();
    ctx.save();
    ctx.translate(cx, py - r - 6 + Math.sin(t * 2.2) * 1.2);
    ctx.scale(1.9, 1.9);
    drawMayorCrown(ctx, t);
    ctx.restore();
    // Sparks of light rising from the throne.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const ph = (t * 0.2 + i * 0.0625) % 1;
      const x = cx + Math.sin(i * 2.7 + t * 0.6) * w * 0.3;
      const y = h * 0.9 - ph * h * 0.85;
      const a = Math.sin(ph * Math.PI);
      const sg = ctx.createRadialGradient(x, y, 0, x, y, 3);
      sg.addColorStop(0, `rgba(255,240,190,${0.9 * a})`);
      sg.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    ctx.restore();
  } else {
    // An empty throne: a shadow of a crown that nobody wears, and a few motes of dust.
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.1 * Math.sin(t * 1.5);
    ctx.translate(cx, sy - 38);
    ctx.scale(2.2, 2.2);
    drawMayorCrown(ctx, t, true);
    ctx.restore();
    ctx.fillStyle = 'rgba(190,205,255,0.5)';
    for (let i = 0; i < 12; i++) {
      const x = ((i * 53 + t * 6) % w);
      const y = h * 0.2 + ((i * 37 + t * 4 * (1 + (i % 3) * 0.3)) % (h * 0.6));
      ctx.fillRect(x, y, 1.6, 1.6);
    }
  }
}
