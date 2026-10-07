// The TV prop on the main screen replays the player's last run from 0 points to the moment it
// ended. The simulation is deterministic, so the seed and the recorded inputs are enough: the
// run is simulated again in a small off-screen game view and shown inside the TV screen.

import { DT, Sim, type InputRecord } from '../core/sim';
import type { LightId } from '../core/gameConfig';
import { Renderer } from './renderer';
import type { StyleLoadout } from './styles';

export interface StoredReplay {
  v: 1;
  seed: number;
  viewH: number;
  items: boolean;
  log: InputRecord[];
  score: number;
}

const KEY = 'sl_lastrun';

export function saveReplay(r: StoredReplay): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* storage full or blocked: the TV simply shows static */
  }
}

export function loadReplay(): StoredReplay | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as StoredReplay;
    if (r.v !== 1 || !Array.isArray(r.log) || typeof r.seed !== 'number' || !(r.viewH > 300)) return null;
    return r;
  } catch {
    return null;
  }
}

const LIGHTS: LightId[] = ['yellow', 'blue', 'green', 'red'];
const VIEW_W = 360;
/** Width of the small off-screen view in pixels (the TV screen is only a few dozen pixels wide). */
const PX_W = 96;
/** Replay stops after this many seconds even if the run never ended (a safety net). */
const MAX_SECONDS = 20 * 60;

export class ReplayTv {
  private canvas = document.createElement('canvas');
  private renderer: Renderer;
  private replay: StoredReplay | null = null;
  private sim: Sim | null = null;
  private idx = 0;
  private axis = 0;
  private acc = 0;
  private hold = 0;
  private clock = 0;
  private drawn = false;

  constructor() {
    this.renderer = new Renderer(this.canvas);
    this.renderer.reducedEffects = true;
    this.renderer.cinematic = false;
  }

  /** Loads (or reloads) the last run from storage. */
  reload(): void {
    this.replay = loadReplay();
    this.restart();
  }

  setStyles(styles: StyleLoadout): void {
    this.renderer.styles = styles;
  }

  private restart(): void {
    this.idx = 0;
    this.axis = 0;
    this.acc = 0;
    this.hold = 0;
    this.drawn = false;
    const r = this.replay;
    if (!r) {
      this.sim = null;
      return;
    }
    this.sim = new Sim(r.seed, r.viewH, { items: r.items });
    const px = PX_W;
    this.renderer.resize(px, Math.round((px * r.viewH) / VIEW_W), px / VIEW_W);
    this.renderer.ownedMask = 0;
  }

  /** True when there is a recorded run to show. */
  get hasReplay(): boolean {
    return this.replay !== null;
  }

  /** Advances the replay by `dt` seconds of real time. */
  update(dt: number): void {
    this.clock += dt;
    const sim = this.sim;
    const r = this.replay;
    if (!sim || !r) return;
    if (sim.dead || sim.time > MAX_SECONDS) {
      // The run is over: hold the last picture for a moment, then start again.
      this.hold += dt;
      if (this.hold > 2.6) this.restart();
      return;
    }
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= DT && !sim.dead && steps < 8) {
      let press: LightId | null = null;
      while (this.idx < r.log.length && r.log[this.idx][0] <= sim.tick) {
        const e = r.log[this.idx++];
        if (e[0] === sim.tick) {
          this.axis = e[1] / 8;
          if (e[2] > 0) press = LIGHTS[e[2] - 1];
        }
      }
      sim.step({ axis: this.axis, press });
      this.renderer.handleEvents(sim.events, sim);
      this.acc -= DT;
      steps++;
    }
    if (this.acc > DT * 4) this.acc = DT * 4;
  }

  /** Paints the picture into a screen of w x h units (the caller clips and translates). */
  paint(g: CanvasRenderingContext2D, w: number, h: number): void {
    const sim = this.sim;
    if (!sim) {
      this.paintStatic(g, w, h);
      return;
    }
    // Draw the small game view only when something changed.
    this.renderer.ownedMask = sim.owned;
    this.renderer.draw(sim, Math.min(1, this.acc / DT), 1 / 30);
    this.drawn = true;
    g.drawImage(this.canvas, 0, 0, w, h);
    if (sim.dead) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 0, w, h);
    }
    // Scan lines.
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < h; y += 0.9) g.fillRect(0, y, w, 0.3);
    void this.drawn;
  }

  /** "No signal": used for other players' TVs. */
  paintNoSignal(g: CanvasRenderingContext2D, w: number, h: number): void {
    this.paintStatic(g, w, h);
  }

  /** "No signal" for a player who has not finished a run yet. */
  private paintStatic(g: CanvasRenderingContext2D, w: number, h: number): void {
    g.fillStyle = '#1A1D26';
    g.fillRect(0, 0, w, h);
    const n = 120;
    for (let i = 0; i < n; i++) {
      const s = Math.sin(i * 12.9898 + Math.floor(this.clock * 12) * 78.233) * 43758.5453;
      const f = s - Math.floor(s);
      g.fillStyle = `rgba(255,255,255,${0.15 + f * 0.5})`;
      g.fillRect(((f * 997) % 1) * w, ((f * 463) % 1) * h, w * 0.08, h * 0.012);
    }
  }
}
