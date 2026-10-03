import { gameConfig, isColorUnlocked, type ColorId } from './gameConfig';
import { Rng } from './prng';

/** Soft walls: platforms stay between the side buildings. */
const M = gameConfig.world.margin;
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

  /** Tutorial mode: no red platforms and no random red phases. */
  noHazards = false;

  constructor(private rng: Rng, startX: number, startY: number) {
    this.anchorX = startX;
    this.anchorY = startY;
  }

  makeStart(x: number, y: number): Platform {
    return this.make(x, y, 'start', null, false, 0);
  }

  /** A platform placed by the tutorial script (never part of a real run). */
  makeScripted(x: number, y: number, kind: Platform['kind'], color: ColorId | null): Platform {
    return this.make(x, y, kind, color, false, 0);
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

  /** Safe platforms of the last batch: the next main platform must be reachable from all of them. */
  private prevSafe: { x: number; y: number }[] = [];

  /**
   * X interval reachable from every previous safe platform for a platform at height y.
   * Returns null if some previous platform cannot reach that height.
   */
  private commonX(y: number): [number, number] | null {
    const half = gameConfig.platform.width / 2;
    const W = gameConfig.world.width;
    let lo = M + half + 4;
    let hi = W - M - half - 4;
    const from = this.prevSafe.length ? this.prevSafe : [{ x: this.anchorX, y: this.anchorY }];
    for (const p of from) {
      const dy = y - p.y;
      if (dy <= 16 || dy > safeReachY()) return null;
      const r = safeReachX(dy);
      lo = Math.max(lo, p.x - r);
      hi = Math.min(hi, p.x + r);
    }
    return lo <= hi ? [lo, hi] : null;
  }

  private placeMain(tier: number, out: Platform[]): Platform {
    const cfg = gameConfig.platform;
    const t = gameConfig.tiers[tier];
    const half = cfg.width / 2;
    const W = gameConfig.world.width;

    // Base red platform: placed beside the safe path, never on it.
    if (!this.noHazards && !this.lastWasRed && t.redChance > 0 && this.rng.chance(t.redChance)) {
      const d1 = this.rng.range(cfg.redGap[0], cfg.redGap[1]);
      const d2 = this.rng.range(cfg.redGap[0], cfg.redGap[1]);
      const safeY = this.anchorY + d1 + d2;
      const range = this.commonX(safeY);
      if (range) {
        const safeX = this.rng.range(range[0], range[1]);
        const goRight = safeX >= this.anchorX;
        const offset = this.rng.range(96, 140);
        let redX = goRight ? Math.min(this.anchorX, safeX) - offset : Math.max(this.anchorX, safeX) + offset;
        if (redX < M + half + 4 || redX > W - M - half - 4) {
          redX = goRight ? Math.max(this.anchorX, safeX) + offset : Math.min(this.anchorX, safeX) - offset;
        }
        if (redX >= M + half + 4 && redX <= W - M - half - 4) {
          out.push(this.make(redX, this.anchorY + d1, 'red', null, false, tier));
          const safe = this.makeColored(safeX, safeY, tier);
          out.push(safe);
          this.setAnchor(safe);
          this.lastWasRed = true;
          return safe;
        }
      }
    }

    // Height: inside the usual gap from the anchor and reachable from every previous safe platform.
    const maxReach = safeReachY();
    let lo = this.anchorY + cfg.gap[0];
    let hi = this.anchorY + Math.min(cfg.gap[1], maxReach);
    for (const p of this.prevSafe) {
      lo = Math.max(lo, p.y + 17);
      hi = Math.min(hi, p.y + maxReach);
    }
    // Pick among heights where a common x range exists.
    const ys: number[] = [];
    for (let cy = lo; cy <= hi; cy += 3) if (this.commonX(cy)) ys.push(cy);
    let y = ys.length ? ys[Math.floor(this.rng.next() * ys.length)] : this.anchorY + cfg.gap[0];
    let range = this.commonX(y);
    if (!range) {
      // Fallback: reachable from the anchor alone (extras are placed so this is rare).
      this.prevSafe = [];
      y = this.anchorY + this.rng.range(cfg.gap[0], Math.min(cfg.gap[1], maxReach));
      range = this.commonX(y)!;
    }
    // Prefer visible horizontal movement so the path zig-zags.
    let x = this.rng.range(range[0], range[1]);
    if (Math.abs(x - this.anchorX) < 30) {
      const alt = x + (x < this.anchorX ? -40 : 40);
      if (alt >= range[0] && alt <= range[1]) x = alt;
    }
    x = clamp(x, M + half + 4, W - M - half - 4);
    const p = this.makeColored(x, y, tier);
    out.push(p);
    this.setAnchor(p);
    this.lastWasRed = false;
    return p;
  }

  /** True if a platform above could be reached from all current safe platforms plus `extra`. */
  private successorExists(extra: { x: number; y: number }): boolean {
    const saved = this.prevSafe;
    this.prevSafe = [...saved, extra];
    const maxReach = safeReachY();
    let lo = this.anchorY + gameConfig.platform.gap[0];
    let hi = this.anchorY + Math.min(gameConfig.platform.gap[1], maxReach);
    for (const p of this.prevSafe) {
      lo = Math.max(lo, p.y + 17);
      hi = Math.min(hi, p.y + maxReach);
    }
    let ok = false;
    for (let y = lo; y <= hi && !ok; y += 4) ok = this.commonX(y) !== null;
    this.prevSafe = saved;
    return ok;
  }

  private setAnchor(p: Platform): void {
    this.anchorX = p.x;
    this.anchorY = p.y;
    this.prevSafe = [{ x: p.x, y: p.y }];
  }

  private placeExtra(main: Platform, tier: number, all: Platform[]): Platform | null {
    const cfg = gameConfig.platform;
    const half = cfg.width / 2;
    const W = gameConfig.world.width;
    const t = gameConfig.tiers[tier];
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = this.rng.range(M + half + 4, W - M - half - 4);
      const y = main.y + this.rng.range(-22, 30);
      // Only where one platform above can still be reached from every safe platform of the batch.
      if (!this.successorExists({ x, y })) continue;
      const clash = all.some((p) => Math.abs(p.y - y) < 40 && Math.abs(p.x - x) < cfg.width + 18);
      if (clash) continue;
      if (!this.noHazards && t.redChance > 0 && this.rng.chance(Math.min(0.6, t.redChance * 1.6))) {
        // A red platform must never hang right above another platform:
        // bouncing in place would otherwise land on it without warning.
        const overHead = all.some((p) => y > p.y && y - p.y < 170 && Math.abs(p.x - x) < cfg.width + 12);
        if (!overHead) return this.make(x, y, 'red', null, false, tier);
      }
      const extra = this.makeColored(x, y, tier);
      this.prevSafe.push({ x, y });
      return extra;
    }
    return null;
  }

  private makeColored(x: number, y: number, tier: number): Platform {
    const color = this.pickColor(tier);
    const t = gameConfig.tiers[tier];
    const phases = !this.noHazards && this.rng.chance(t.phaseChance);
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
      item: -1,
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
