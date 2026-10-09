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

/** A flame of a torch: layered teardrops that flicker. Origin at the base of the flame. */
function flame(ctx: Ctx, t: number, seed: number, size: number): void {
  const k = 0.9 + 0.1 * Math.sin(t * 11 + seed);
  const sway = Math.sin(t * 7 + seed * 2) * size * 0.1;
  for (const [f, c] of [[1, '#E8420F'], [0.72, '#FF9A2E'], [0.42, '#FFF3B0']] as [number, string][]) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.4 * f, 0);
    ctx.quadraticCurveTo(-size * 0.5 * f, -size * 0.7 * f, sway * f, -size * 1.6 * f * k);
    ctx.quadraticCurveTo(size * 0.5 * f, -size * 0.7 * f, size * 0.4 * f, 0);
    ctx.quadraticCurveTo(0, size * 0.3 * f, -size * 0.4 * f, 0);
    ctx.fillStyle = c;
    ctx.fill();
  }
}

/** A scroll of gold filigree (a pair of curls), for the throne. */
function filigree(ctx: Ctx, x: number, y: number, size: number, flip: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);
  ctx.strokeStyle = '#FFE08A';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(size * 0.6, -size * 0.2, size, -size * 0.8, size * 0.5, -size);
  ctx.bezierCurveTo(size * 0.1, -size * 1.1, 0, -size * 0.6, size * 0.3, -size * 0.55);
  ctx.stroke();
  ctx.restore();
}

/**
 * The hall with the throne for the Government screen: a stained-glass window with turning light,
 * torches, banners, columns, steps and a red carpet. Empty: a cold light, dust in the air and a ghost
 * of the crown on the cushion. With a mayor: the hall is warm and bright, light rays fan out, the mayor
 * (his profile picture in a laurel frame) sits on the throne under the diamond crown, and golden
 * petals fall.
 */
export function drawThrone(
  ctx: Ctx,
  w: number,
  h: number,
  t: number,
  mayor: { name: string | null; photo: string | null } | null,
): void {
  ctx.clearRect(0, 0, w, h);
  const warm = !!mayor;
  const cx = w / 2;
  // The wall.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, warm ? '#2B1A44' : '#141A2A');
  bg.addColorStop(0.62, warm ? '#4A2444' : '#1D2538');
  bg.addColorStop(1, warm ? '#2A1626' : '#10141F');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // A big round stained-glass window behind the throne; coloured light turns in it.
  const wy = h * 0.3;
  const wr = Math.min(w, h) * 0.3;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, wy, wr, 0, Math.PI * 2);
  ctx.clip();
  const colors = warm ? ['#FFB347', '#FF6A8A', '#B36BFF', '#4DA3FF', '#52E0A0', '#FFE27A'] : ['#2A3A5A', '#32486E', '#27375A', '#2E4268', '#243352', '#2B3C60'];
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, wy);
    ctx.arc(cx, wy, wr, (i / 12) * Math.PI * 2 + t * 0.12, ((i + 1) / 12) * Math.PI * 2 + t * 0.12);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
  }
  const wg = ctx.createRadialGradient(cx, wy, 2, cx, wy, wr);
  wg.addColorStop(0, warm ? 'rgba(255,255,255,0.75)' : 'rgba(170,200,255,0.35)');
  wg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = wg;
  ctx.fillRect(cx - wr, wy - wr, wr * 2, wr * 2);
  ctx.restore();
  ctx.strokeStyle = warm ? '#E8B53A' : '#4A5272';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, wy, wr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, wy, wr * 0.55, 0, Math.PI * 2);
  ctx.stroke();

  // Banners and columns.
  for (const sd of [-1, 1]) {
    const bx = cx + sd * w * 0.3;
    const sway = Math.sin(t * 1.3 + sd) * 2;
    ctx.fillStyle = warm ? '#A01830' : '#4E1A26';
    ctx.beginPath();
    ctx.moveTo(bx - 14, h * 0.04);
    ctx.lineTo(bx + 14, h * 0.04);
    ctx.lineTo(bx + 14 + sway, h * 0.4);
    ctx.lineTo(bx + sway, h * 0.46);
    ctx.lineTo(bx - 14 + sway, h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = warm ? '#E8B53A' : '#6A5A3A';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.save();
    ctx.translate(bx + sway * 0.5, h * 0.2);
    ctx.scale(0.8, 0.8);
    ctx.globalAlpha = warm ? 1 : 0.55;
    drawMayorCrown(ctx, t, true);
    ctx.restore();
    const px = cx + sd * w * 0.42;
    const cg = ctx.createLinearGradient(px - 11, 0, px + 11, 0);
    cg.addColorStop(0, '#3A3F55');
    cg.addColorStop(0.5, '#8088A8');
    cg.addColorStop(1, '#2C3045');
    ctx.fillStyle = cg;
    ctx.fillRect(px - 11, h * 0.08, 22, h * 0.76);
    ctx.fillStyle = warm ? '#E8B53A' : '#6A6E8A';
    ctx.fillRect(px - 15, h * 0.06, 30, 9);
    ctx.fillRect(px - 15, h * 0.82, 30, 9);
    // A torch on the column.
    ctx.fillStyle = '#5A3A18';
    ctx.fillRect(px - 2, h * 0.36, 4, 16);
    ctx.save();
    ctx.translate(px, h * 0.36);
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(0, -4, 0, 0, -4, 34);
    fg.addColorStop(0, `rgba(255,170,60,${0.42 + 0.08 * Math.sin(t * 9 + sd)})`);
    fg.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(-36, -40, 72, 72);
    ctx.globalCompositeOperation = 'source-over';
    flame(ctx, t, sd * 3, 7);
    ctx.restore();
  }

  // The steps and the carpet.
  const stepY = h * 0.74;
  for (let i = 0; i < 3; i++) {
    const y = stepY + i * (h * 0.075);
    const half = w * (0.26 + i * 0.07);
    const sg = ctx.createLinearGradient(0, y, 0, y + h * 0.075);
    sg.addColorStop(0, warm ? '#6A4A5A' : '#2E3248');
    sg.addColorStop(1, warm ? '#3A2234' : '#1B1E30');
    ctx.fillStyle = sg;
    ctx.fillRect(cx - half, y, half * 2, h * 0.075);
    ctx.fillStyle = warm ? '#E8B53A' : '#4A4F6A';
    ctx.fillRect(cx - half, y, half * 2, 2);
  }
  ctx.fillStyle = warm ? '#A01830' : '#5C1A28';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.12, stepY);
  ctx.lineTo(cx + w * 0.12, stepY);
  ctx.lineTo(cx + w * 0.2, h);
  ctx.lineTo(cx - w * 0.2, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = warm ? '#E8B53A' : '#6A5A3A';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Light behind the throne.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (warm) {
    ctx.translate(cx, wy);
    ctx.rotate(t * 0.12);
    for (let i = 0; i < 14; i++) {
      ctx.rotate((Math.PI * 2) / 14);
      const rg = ctx.createLinearGradient(0, 0, 0, -h * 0.9);
      rg.addColorStop(0, 'rgba(255,228,150,0.26)');
      rg.addColorStop(1, 'rgba(255,228,150,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(3, 0);
      ctx.lineTo(18, -h * 0.9);
      ctx.lineTo(-18, -h * 0.9);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    const dust = ctx.createRadialGradient(cx, h * 0.45, 8, cx, h * 0.45, w * 0.5);
    dust.addColorStop(0, 'rgba(140,175,255,0.18)');
    dust.addColorStop(1, 'rgba(140,175,255,0)');
    ctx.fillStyle = dust;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  // The throne.
  const seatY = h * 0.66;
  const gold = ctx.createLinearGradient(cx - 52, 0, cx + 52, 0);
  const lit = warm ? 1 : 0.55;
  const c1 = `rgb(${Math.round(150 * lit + 40)},${Math.round(105 * lit + 35)},${Math.round(20 * lit + 25)})`;
  const c2 = `rgb(${Math.round(255 * lit)},${Math.round(215 * lit + 20)},${Math.round(110 * lit + 30)})`;
  gold.addColorStop(0, c1);
  gold.addColorStop(0.5, c2);
  gold.addColorStop(1, c1);
  ctx.fillStyle = gold;
  ctx.strokeStyle = warm ? '#7A4F0A' : '#3A3424';
  ctx.lineWidth = 1.6;
  // Wings of the back.
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + sd * 40, seatY);
    ctx.lineTo(cx + sd * 56, h * 0.28);
    ctx.quadraticCurveTo(cx + sd * 50, h * 0.2, cx + sd * 40, h * 0.22);
    ctx.lineTo(cx + sd * 38, seatY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // The back: a pointed arch with a scalloped edge.
  ctx.beginPath();
  ctx.moveTo(cx - 42, seatY);
  ctx.lineTo(cx - 42, h * 0.24);
  ctx.quadraticCurveTo(cx - 40, h * 0.12, cx, h * 0.04);
  ctx.quadraticCurveTo(cx + 40, h * 0.12, cx + 42, h * 0.24);
  ctx.lineTo(cx + 42, seatY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Velvet inside.
  ctx.fillStyle = warm ? '#B01C34' : '#4E1A26';
  ctx.beginPath();
  ctx.moveTo(cx - 33, seatY);
  ctx.lineTo(cx - 33, h * 0.25);
  ctx.quadraticCurveTo(cx - 31, h * 0.15, cx, h * 0.09);
  ctx.quadraticCurveTo(cx + 31, h * 0.15, cx + 33, h * 0.25);
  ctx.lineTo(cx + 33, seatY);
  ctx.closePath();
  ctx.fill();
  // Quilted buttons on the velvet.
  ctx.fillStyle = warm ? '#E8B53A' : '#6A5A3A';
  for (let r = 0; r < 3; r++) for (let c = -1; c <= 1; c++) {
    ctx.beginPath();
    ctx.arc(cx + c * 14 + (r % 2) * 7 - 3, h * 0.26 + r * 15, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Filigree and jewels.
  filigree(ctx, cx - 40, h * 0.34, 20, 1);
  filigree(ctx, cx + 40, h * 0.34, 20, -1);
  const jewels: [number, number, string][] = [[0, 0.075, '#7FD3FF'], [-24, 0.15, '#FF6A8A'], [24, 0.15, '#FF6A8A'], [-38, 0.24, '#52E0A0'], [38, 0.24, '#52E0A0']];
  for (const [dx, dy, c] of jewels) {
    ctx.save();
    ctx.shadowColor = c;
    ctx.shadowBlur = warm ? 8 : 2;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx + dx, h * dy, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Arms, seat and a tasselled cushion.
  ctx.fillStyle = gold;
  ctx.strokeStyle = warm ? '#7A4F0A' : '#3A3424';
  for (const sd of [-1, 1]) {
    ctx.fillRect(cx + sd * 50 - 7, seatY - 22, 14, 38);
    ctx.strokeRect(cx + sd * 50 - 7, seatY - 22, 14, 38);
    ctx.beginPath();
    ctx.arc(cx + sd * 50, seatY - 24, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillRect(cx - 46, seatY - 4, 92, 14);
  ctx.strokeRect(cx - 46, seatY - 4, 92, 14);
  ctx.fillStyle = warm ? '#C8203A' : '#5A1E2C';
  ctx.beginPath();
  ctx.ellipse(cx, seatY - 5, 40, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = warm ? '#E8B53A' : '#6A5A3A';
  ctx.stroke();
  ctx.fillStyle = warm ? '#E8B53A' : '#6A5A3A';
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + sd * 40, seatY - 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + sd * 40 - 0.6, seatY, 1.2, 9);
  }
  // The finial: a crown on the very top of the throne.
  ctx.save();
  ctx.translate(cx, h * 0.045);
  ctx.scale(1.3, 1.3);
  ctx.globalAlpha = warm ? 1 : 0.5;
  drawMayorCrown(ctx, t, !warm);
  ctx.restore();

  if (mayor) {
    // The mayor in a laurel frame, with the diamond crown above.
    const r = 29;
    const py = seatY - 40;
    ctx.save();
    ctx.shadowColor = 'rgba(255,215,100,0.95)';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(cx, py, r + 4, 0, Math.PI * 2);
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
    // The laurel: leaves along both sides of the frame.
    ctx.fillStyle = '#52C47A';
    for (let i = 0; i < 9; i++) {
      for (const sd of [-1, 1]) {
        const a = Math.PI * (0.55 + i * 0.075);
        const lx = cx + sd * Math.cos(a - Math.PI * 0.5) * (r + 7);
        const ly = py + Math.sin(a - Math.PI * 0.5) * (r + 7) + 4;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(sd * (0.5 + i * 0.25));
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.4, 1.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.translate(cx, py - r - 8 + Math.sin(t * 2.2) * 1.4);
    ctx.scale(2, 2);
    drawMayorCrown(ctx, t);
    ctx.restore();
    // Golden petals falling and sparks rising.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const ph = (t * 0.18 + i * 0.0555) % 1;
      const x = ((i * 47) % w) + Math.sin(t + i) * 8;
      const y = ph * h;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 2 + i);
      ctx.fillStyle = `rgba(255,${200 + (i % 3) * 20},120,${0.8 * Math.sin(ph * Math.PI)})`;
      ctx.fillRect(-2.4, -1.2, 4.8, 2.4);
      ctx.restore();
    }
    ctx.restore();
  } else {
    // An empty throne: a few motes of dust drifting in the cold light.
    ctx.fillStyle = 'rgba(190,205,255,0.5)';
    for (let i = 0; i < 14; i++) {
      const x = (i * 53 + t * 6) % w;
      const y = h * 0.15 + ((i * 37 + t * 4 * (1 + (i % 3) * 0.3)) % (h * 0.6));
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    // A ghost of the crown on the cushion.
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.12 * Math.sin(t * 1.5);
    ctx.translate(cx, seatY - 20);
    ctx.scale(1.9, 1.9);
    drawMayorCrown(ctx, t, true);
    ctx.restore();
  }
}
