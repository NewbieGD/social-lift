// A live copy of somebody else's run, for watching a duel. The game is deterministic, so the seed
// and the inputs the player sends are enough to play it again on the spectator's screen. Inputs
// arrive in small batches a moment after they happen, so the picture runs a little behind real
// time (LAG seconds) and always has the inputs it needs.

import { DT, Sim, type InputRecord } from '../core/sim';
import type { LightId } from '../core/gameConfig';
import { Renderer } from './renderer';
import type { StyleLoadout } from './styles';
import { PET_IDS } from './pets';

const LIGHTS: LightId[] = ['yellow', 'blue', 'green', 'red'];
/** How far behind the real time the picture runs (seconds). */
const LAG = 0.9;
const VIEW_W = 360;
const VIEW_H = 700;

export class LiveReplica {
  readonly sim: Sim;
  private renderer: Renderer;
  private look: { loadout?: Record<string, string>; pet?: string | null } | null | undefined;
  private log: InputRecord[] = [];
  private idx = 0;
  private axis = 0;
  /** The score reported by the server once the player is out (the exact final number). */
  finalScore: number | null = null;

  /** `startLocal` is the local time (ms) at which the run started, on this device's clock. */
  constructor(
    canvas: HTMLCanvasElement,
    seed: number,
    private startLocal: number,
    look: { loadout?: Record<string, string>; pet?: string | null } | null | undefined,
  ) {
    this.sim = new Sim(seed, VIEW_H, { items: true });
    this.look = look;
    this.renderer = this.makeRenderer(canvas);
  }

  private makeRenderer(canvas: HTMLCanvasElement): Renderer {
    const r = new Renderer(canvas);
    // Two live copies run at once, so the light drawing mode is used.
    r.reducedEffects = true;
    r.cinematic = false;
    r.styles = (this.look?.loadout ?? {}) as StyleLoadout;
    r.pet = PET_IDS[this.look?.pet ?? ''] ?? null;
    return r;
  }

  /** Moves the picture to another canvas (the one on the screen, created after the replica). */
  attach(canvas: HTMLCanvasElement): void {
    this.renderer = this.makeRenderer(canvas);
  }

  resize(cssW: number): void {
    this.renderer.resize(cssW, Math.round((cssW * VIEW_H) / VIEW_W), cssW / VIEW_W);
  }

  push(entries: InputRecord[]): void {
    for (const e of entries) this.log.push(e);
  }

  get dead(): boolean {
    return this.sim.dead;
  }

  get score(): number {
    return this.finalScore ?? this.sim.score;
  }

  /** Plays the run forward to where it should be now (it catches up at once after joining late). */
  update(): void {
    const sim = this.sim;
    if (sim.dead) return;
    const target = Math.floor(((Date.now() - this.startLocal) / 1000 - LAG) / DT);
    let steps = 0;
    while (sim.tick < target && !sim.dead && steps < 1200) {
      let press: LightId | null = null;
      while (this.idx < this.log.length && this.log[this.idx][0] <= sim.tick) {
        const e = this.log[this.idx++];
        if (e[0] === sim.tick) {
          this.axis = e[1] / 8;
          if (e[2] > 0) press = LIGHTS[e[2] - 1];
        }
      }
      sim.step({ axis: this.axis, press });
      this.renderer.handleEvents(sim.events, sim);
      steps++;
    }
  }

  draw(): void {
    this.renderer.draw(this.sim, 1, 1 / 60);
  }
}
