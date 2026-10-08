// The fiery trail of a combo: while the score multiplier is above x1, flames stream behind the
// hero. The higher the multiplier, the bigger and hotter they are:
//   x1.5 orange sparks, x2 flames, x2.5 big red flames with a glow, x3 white-blue plasma.
// Only drawn when effects are not reduced (see Renderer.reducedEffects and the quality level).

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  level: number;
  seed: number;
}

const MAX = 160;
const RATE = [0, 34, 58, 84, 120];

const COLORS: Record<number, [string, string, string]> = {
  1: ['255,246,170', '255,170,50', '220,80,20'],
  2: ['255,240,150', '255,140,30', '225,60,15'],
  3: ['255,236,170', '255,100,30', '210,30,20'],
  4: ['235,252,255', '120,210,255', '60,110,255'],
};

/** Level of the trail for a score multiplier (0 = none). */
export function comboLevel(multiplier: number): number {
  if (multiplier >= 3) return 4;
  if (multiplier >= 2.5) return 3;
  if (multiplier >= 2) return 2;
  if (multiplier >= 1.5) return 1;
  return 0;
}

export class FireTrail {
  private puffs: Puff[] = [];
  private carry = 0;
  private t = 0;

  reset(): void {
    this.puffs.length = 0;
    this.carry = 0;
  }

  update(dt: number): void {
    this.t += dt;
    for (const p of this.puffs) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 26 * dt; // flames drift up a little (screen y goes down)
      p.vx *= 1 - 1.4 * dt;
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }

  /** Adds new flames at the hero (screen coordinates, world units). */
  emit(dt: number, x: number, y: number, vx: number, vy: number, level: number): void {
    if (level <= 0) return;
    this.carry += RATE[level] * dt;
    const n = Math.floor(this.carry);
    this.carry -= n;
    for (let i = 0; i < n && this.puffs.length < MAX; i++) {
      const max = 0.45 + Math.random() * 0.4 + level * 0.06;
      this.puffs.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 14,
        // The flames trail behind the movement of the hero.
        vx: -vx * 0.2 + (Math.random() - 0.5) * 36,
        // The hero's height speed is up-positive; on the screen the flames stay behind him (below when he rises).
        vy: vy * 0.14 + (Math.random() - 0.5) * 28,
        life: max,
        max,
        size: 4.5 + level * 2.4 + Math.random() * 3,
        level,
        seed: Math.random() * 10,
      });
    }
  }

  /** Draws the flames (additive). `level` is the current level, used for the glow around the hero. */
  draw(ctx: CanvasRenderingContext2D, level: number, hx: number, hy: number): void {
    if (!this.puffs.length && level < 3) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (level >= 3) {
      const c = COLORS[level];
      const pulse = 0.85 + 0.15 * Math.sin(this.t * 12);
      const r = (level === 4 ? 46 : 38) * pulse;
      const g = ctx.createRadialGradient(hx, hy, 2, hx, hy, r);
      g.addColorStop(0, `rgba(${c[1]},${level === 4 ? 0.5 : 0.4})`);
      g.addColorStop(1, `rgba(${c[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
    }
    for (const p of this.puffs) {
      const k = p.life / p.max; // 1 -> 0
      const c = COLORS[p.level];
      const flick = 0.8 + 0.2 * Math.sin(this.t * 30 + p.seed);
      const r = p.size * (0.4 + k * 0.9) * flick;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${c[0]},${0.95 * k})`);
      g.addColorStop(0.45, `rgba(${c[1]},${0.7 * k})`);
      g.addColorStop(1, `rgba(${c[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
}
