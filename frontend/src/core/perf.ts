// Performance monitor and adaptive quality for weak phones. No DOM here, so it can be tested.
//
// Every frame time (milliseconds) is recorded. About every two seconds the monitor looks at the
// average and the slowest frames and moves the quality level:
//   0 high    all effects
//   1 medium  fewer particles, no weather in the menu, a lighter combo trail
//   2 low     only the essentials: no combo trail, no weather, simple death effect, no TV replay
// It steps down quickly (two bad checks in a row) and up slowly (a long calm stretch), and never
// changes more than once per ten seconds, so the picture does not flicker between levels.

export type QualityLevel = 0 | 1 | 2;

export interface DeviceHints {
  memoryGb?: number;
  cores?: number;
}

/** The starting level from what the device says about itself (Chrome-based browsers report memory). */
export function startLevel(h: DeviceHints): QualityLevel {
  if ((h.memoryGb !== undefined && h.memoryGb <= 2) || (h.cores !== undefined && h.cores <= 2)) return 2;
  if ((h.memoryGb !== undefined && h.memoryGb <= 4) || (h.cores !== undefined && h.cores <= 4)) return 1;
  return 0;
}

export class PerfMonitor {
  level: QualityLevel = 0;
  /** The level the player forced (reduced effects setting); null = automatic. */
  forced: QualityLevel | null = null;
  onChange: (level: QualityLevel) => void = () => undefined;
  private times: number[] = [];
  private since = 0;
  private bad = 0;
  private good = 0;
  private lastChange = -1e9;
  private clock = 0;
  /** Totals since the last reset: for the report at the end of a run. */
  private sum = 0;
  private count = 0;
  private lastAvg = 0;
  private lastP95 = 0;

  constructor(hints: DeviceHints = {}) {
    this.level = startLevel(hints);
  }

  get effective(): QualityLevel {
    return this.forced ?? this.level;
  }

  /** One frame took `ms` milliseconds. Frames longer than 250 ms (tab hidden, pause) are ignored. */
  record(ms: number): void {
    if (ms <= 0 || ms > 250) return;
    this.clock += ms / 1000;
    this.times.push(ms);
    this.sum += ms;
    this.count++;
    this.since += ms;
    if (this.since < 2000 || this.times.length < 40) return;
    const sorted = [...this.times].sort((a, b) => a - b);
    const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    this.lastAvg = avg;
    this.lastP95 = p95;
    this.times.length = 0;
    this.since = 0;
    // Under about 40 fps on average, or very uneven frames, counts as bad; over 55 fps as good.
    if (avg > 25 || p95 > 45) {
      this.bad++;
      this.good = 0;
    } else if (avg < 18 && p95 < 28) {
      this.good++;
      this.bad = 0;
    } else {
      this.bad = 0;
      this.good = 0;
    }
    if (this.clock - this.lastChange < 10) return;
    if (this.bad >= 2 && this.level < 2) this.set((this.level + 1) as QualityLevel);
    else if (this.good >= 8 && this.level > 0) this.set((this.level - 1) as QualityLevel);
  }

  private set(level: QualityLevel): void {
    this.level = level;
    this.lastChange = this.clock;
    this.bad = 0;
    this.good = 0;
    this.onChange(this.effective);
  }

  /** Average frames per second and the slowest-5% frame time since the last report. */
  report(reset = true): { fps: number; p95: number; level: QualityLevel } {
    const fps = this.count ? Math.round(1000 / (this.sum / this.count)) : 0;
    const out = { fps, p95: Math.round(this.lastP95), level: this.effective };
    if (reset) {
      this.sum = 0;
      this.count = 0;
    }
    return out;
  }

  get lastAverageMs(): number {
    return this.lastAvg;
  }
}

declare global {
  interface Navigator {
    deviceMemory?: number;
  }
}

export const perf = new PerfMonitor(
  typeof navigator !== 'undefined' ? { memoryGb: navigator.deviceMemory, cores: navigator.hardwareConcurrency } : {},
);
