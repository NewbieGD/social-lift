import { gameConfig, isColorUnlocked, type ColorId } from './gameConfig';
import { Rng } from './prng';
import type { Platform } from './types';

const ALL_COLORS: ColorId[] = ['yellow', 'blue', 'green'];

/** Height of the jump apex above the take-off point. */
export function jumpApex(): number {
  const { jumpImpulse: v, gravity: g } = gameConfig.hero;
  return (v * v) / (2 * g);
}

/** Horizontal distance reachable when landing `dy` units above take-off (0 if unreachable). */
export function horizontalReach(dy: number): number {
  const { jumpImpulse: v, gravity: g, maxSpeedX } = gameConfig.hero;
  const apex = jumpApex();
  if (dy > apex) return 0;
  const t = v / g + Math.sqrt((2 * (apex - dy)) / g);
  return maxSpeedX * t;
}

/** Conservative reach used by the generator. */
export function safeReachX(dy: number): number {
  return horizontalReach(dy) * gameConfig.platform.reachFactor;
}

export function safeReachY(): number {
  return jumpApex() * gameConfig.platform.reachFactor;
}

export class Generator {
  private nextId = 1;
  /** Last platform on the guaranteed safe path. */
  anchorX: number;
  anchorY: number;
  private lastColor: ColorId | null = null;
  private sameCount = 0;
  private lastWasRed = false;

  constructor(private rng: Rng, startX: number, startY: number) {
    this.anchorX = startX;
    this.anchorY = startY;
  }

  makeStart(x: number, y: number): Platform {
    return this.make(x, y, 'start', null, false, 0);
  }

  /**
   * Generate platforms until the safe path reaches `targetY`.
   * `existing` is used to respect the on-screen limit.
   */
  generateUpTo(targetY: number, tier: number, viewHeight: number, existing: Platform[]): Platform[] {
    const out: Platform[] = [];
    while (this.anchorY < targetY) {
      const batch = this.rng.weighted(gameConfig.platform.batchWeights) + 1;
      const main = this.placeMain(tier, out);
      for (let i = 1; i < batch; i++) {
        const all = existing.concat(out);
        if (countInWindow(all, main.y, viewHeight) >= gameConfig.platform.maxOnScreen) break;
        const extra = this.placeExtra(main, tier, all);
        if (extra) out.push(extra);
      }
    }
    return out;
  }

  private placeMain(tier: number, out: Platform[]): Platform {
    const cfg = gameConfig.platform;
    const t = gameConfig.tiers[tier];
    const half = cfg.width / 2;
    const W = gameConfig.world.width;

    // Base red platform: placed beside the safe path, never on it.
    if (!this.lastWasRed && t.redChance > 0 && this.rng.chance(t.redChance)) {
      const d1 = this.rng.range(cfg.redGap[0], cfg.redGap[1]);
      const d2 = this.rng.range(cfg.redGap[0], cfg.redGap[1]);
      const reach = safeReachX(d1 + d2);
      const safeX = clamp(this.anchorX + this.rng.range(-reach, reach), half + 4, W - half - 4);
      const goRight = safeX >= this.anchorX;
      const offset = this.rng.range(96, 140);
      let redX = goRight ? Math.min(this.anchorX, safeX) - offset : Math.max(this.anchorX, safeX) + offset;
      if (redX < half + 4 || redX > W - half - 4) {
        redX = goRight ? Math.max(this.anchorX, safeX) + offset : Math.min(this.anchorX, safeX) - offset;
      }
      if (redX >= half + 4 && redX <= W - half - 4) {
        out.push(this.make(redX, this.anchorY + d1, 'red', null, false, tier));
        const safe = this.makeColored(safeX, this.anchorY + d1 + d2, tier);
        out.push(safe);
        this.anchorX = safeX;
        this.anchorY = safe.y;
        this.lastWasRed = true;
        return safe;
      }
    }

    const dy = this.rng.range(cfg.gap[0], Math.min(cfg.gap[1], safeReachY()));
    const reach = safeReachX(dy);
    // Prefer visible horizontal movement so the path zig-zags.
    let x = this.anchorX + this.rng.range(-reach, reach);
    if (Math.abs(x - this.anchorX) < 30) x += this.rng.chance(0.5) ? 40 : -40;
    x = clamp(x, half + 4, W - half - 4);
    const p = this.makeColored(x, this.anchorY + dy, tier);
    out.push(p);
    this.anchorX = x;
    this.anchorY = p.y;
    this.lastWasRed = false;
    return p;
  }

  private placeExtra(main: Platform, tier: number, all: Platform[]): Platform | null {
    const cfg = gameConfig.platform;
    const half = cfg.width / 2;
    const W = gameConfig.world.width;
    const t = gameConfig.tiers[tier];
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = this.rng.range(half + 4, W - half - 4);
      const y = main.y + this.rng.range(-22, 30);
      const clash = all.some((p) => Math.abs(p.y - y) < 40 && Math.abs(p.x - x) < cfg.width + 18);
      if (clash) continue;
      if (t.redChance > 0 && this.rng.chance(Math.min(0.6, t.redChance * 1.6))) {
        // A red platform must never hang right above another platform:
        // bouncing in place would otherwise land on it without warning.
        const overHead = all.some((p) => y > p.y && y - p.y < 170 && Math.abs(p.x - x) < cfg.width + 12);
        if (!overHead) return this.make(x, y, 'red', null, false, tier);
      }
      return this.makeColored(x, y, tier);
    }
    return null;
  }

  private makeColored(x: number, y: number, tier: number): Platform {
    const color = this.pickColor(tier);
    const t = gameConfig.tiers[tier];
    const phases = this.rng.chance(t.phaseChance);
    return this.make(x, y, 'color', color, phases, tier);
  }

  private pickColor(tier: number): ColorId {
    let options = ALL_COLORS.filter((c) => isColorUnlocked(c, tier));
    if (this.sameCount >= 2 && options.length > 1) {
      options = options.filter((c) => c !== this.lastColor);
    }
    const c = this.rng.pick(options);
    this.sameCount = c === this.lastColor ? this.sameCount + 1 : 1;
    this.lastColor = c;
    return c;
  }

  private make(
    x: number,
    y: number,
    kind: Platform['kind'],
    color: ColorId | null,
    phases: boolean,
    tier: number,
  ): Platform {
    const t = gameConfig.tiers[tier];
    const wait = phases ? this.rng.range(t.phaseInterval[0], t.phaseInterval[1]) : 0;
    return {
      id: this.nextId++,
      x,
      y,
      kind,
      color,
      phases,
      phase: 'normal',
      phaseT: wait,
      phaseLen: wait,
      whiteT: 0,
      whiteAge: 0,
    };
  }
}

function countInWindow(list: Platform[], topY: number, h: number): number {
  let n = 0;
  for (const p of list) if (p.y <= topY && p.y > topY - h) n++;
  return n;
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
