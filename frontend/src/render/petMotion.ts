// How the pets move. On the main screen a pet wanders around on its own (PetWalker); in a run it
// stays beside the hero (PetFollower): a cat or a dog follows the hero's path a moment later, so it
// jumps and lands where he did, a parrot flies in lazy circles around him.

import type { PetKind, PetMode } from './pets';

export interface PetView {
  /** Position in the caller's units (pixels on the main screen, world units in a run). */
  x: number;
  /** Height above the ground (the parrot's flights). */
  lift: number;
  facing: 1 | -1;
  mode: PetMode;
  phase: number;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export class PetWalker {
  x = 0;
  lift = 0;
  facing: 1 | -1 = 1;
  mode: PetMode = 'sit';
  phase = 0;
  /** Whether the pet is in front of the hero or behind him. */
  lane: 'back' | 'front' = 'front';
  private kind: PetKind | null = null;
  private timer = 1.2;
  private target = 0;
  private from = 0;
  private flyT = 0;
  private flyDur = 1;
  private flyH = 0;
  private ready = false;

  /** Moves the pet. `u` is the size of one unit in pixels; the pet stays between minX and maxX. */
  update(dt: number, kind: PetKind, minX: number, maxX: number, u: number): void {
    if (this.kind !== kind || !this.ready) {
      this.kind = kind;
      this.ready = true;
      this.x = minX + (maxX - minX) * 0.22;
      this.mode = kind === 'parrot' ? 'perch' : 'sit';
      this.lift = 0;
      this.timer = 1;
    }
    this.x = Math.max(minX, Math.min(maxX, this.x));
    const pick = (): number => {
      let t = minX + Math.random() * (maxX - minX);
      // Make the trip worth it: at least a few units away.
      if (Math.abs(t - this.x) < 18 * u) t = this.x + (this.x > (minX + maxX) / 2 ? -1 : 1) * 30 * u;
      return Math.max(minX, Math.min(maxX, t));
    };
    if (kind === 'spark') {
      // Always airborne: it drifts from place to place, bobbing in the air.
      this.mode = 'fly';
      this.timer -= dt;
      if (this.timer <= 0) {
        this.from = this.x;
        this.target = pick();
        this.facing = this.target >= this.x ? 1 : -1;
        this.flyT = 0;
        this.flyDur = 1.1 + Math.abs(this.target - this.x) / (60 * u);
        this.flyH = (16 + Math.random() * 22) * u;
        this.lane = Math.random() < 0.5 ? 'back' : 'front';
        this.timer = this.flyDur + 0.4 + Math.random() * 1.2;
      }
      this.flyT += dt;
      const k = Math.min(1, this.flyT / this.flyDur);
      const e = k * k * (3 - 2 * k);
      this.x = this.from + (this.target - this.from) * e;
      this.lift = this.flyH * (0.55 + 0.45 * Math.sin(k * Math.PI)) + Math.sin(this.flyT * 4) * 1.5 * u;
      return;
    }
    if (kind === 'parrot') {
      if (this.mode === 'perch' || this.mode === 'walk') {
        this.timer -= dt;
        this.phase += dt * (this.mode === 'walk' ? 9 : 0);
        if (this.timer <= 0) {
          this.from = this.x;
          this.target = pick();
          this.facing = this.target >= this.x ? 1 : -1;
          this.flyT = 0;
          this.flyDur = 1.5 + Math.abs(this.target - this.x) / (46 * u);
          this.flyH = (14 + Math.random() * 14) * u;
          this.lane = Math.random() < 0.5 ? 'back' : 'front';
          this.mode = 'fly';
        }
      } else {
        this.flyT += dt;
        const k = Math.min(1, this.flyT / this.flyDur);
        const e = k * k * (3 - 2 * k);
        this.x = this.from + (this.target - this.from) * e;
        this.lift = Math.sin(k * Math.PI) * this.flyH;
        if (k >= 1) {
          this.mode = Math.random() < 0.4 ? 'walk' : 'perch';
          this.lift = 0;
          this.timer = 1.8 + Math.random() * 3.6;
        }
      }
      return;
    }
    if (this.mode === 'sit') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.target = pick();
        this.facing = this.target >= this.x ? 1 : -1;
        this.lane = Math.random() < 0.6 ? 'front' : 'back';
        this.mode = 'walk';
      }
    } else {
      const speed = (kind === 'dog' ? 20 : 16) * u;
      this.x += this.facing * speed * dt;
      this.phase += dt * (kind === 'dog' ? 11 : 9.5);
      if ((this.facing > 0 && this.x >= this.target) || (this.facing < 0 && this.x <= this.target)) {
        this.mode = 'sit';
        this.timer = 2.2 + Math.random() * 4.5;
      }
    }
  }

  view(): PetView {
    return { x: this.x, lift: this.lift, facing: this.facing, mode: this.mode, phase: this.phase };
  }
}

// ---------------------------------------------------------------------------
// In a run
// ---------------------------------------------------------------------------

interface Sample {
  t: number;
  x: number;
  y: number;
}

export class PetFollower {
  x = 0;
  y = 0;
  facing: 1 | -1 = 1;
  mode: PetMode = 'jump';
  phase = 0;
  private hist: Sample[] = [];
  private heroFacing: 1 | -1 = 1;
  private lastX = 0;
  private ready = false;

  reset(): void {
    this.hist.length = 0;
    this.ready = false;
  }

  /**
   * Follows the hero. `now` is the run time in seconds, hx/hy the hero's world position
   * (feet), `heroFacing` where he looks. World y grows upward.
   */
  update(now: number, dt: number, kind: PetKind, hx: number, hy: number, heroFacing: 1 | -1): void {
    this.heroFacing = heroFacing;
    if (!this.ready) {
      this.ready = true;
      this.x = hx - 16 * heroFacing;
      this.y = hy;
      this.lastX = this.x;
    }
    this.hist.push({ t: now, x: hx, y: hy });
    while (this.hist.length > 90 && this.hist[0].t < now - 1.2) this.hist.shift();

    if (kind === 'parrot' || kind === 'spark') {
      // Lazy circles around the hero, a little above him (the spark is quicker and a little higher).
      const quick = kind === 'spark' ? 1.7 : 1;
      const tx = hx + Math.cos(now * 1.35 * quick) * (kind === 'spark' ? 30 : 26);
      const ty = hy + (kind === 'spark' ? 30 : 24) + Math.sin(now * 2.1 * quick) * 8;
      const k = Math.min(1, dt * 5);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
      this.mode = 'fly';
    } else {
      // The pet reaches a spot a moment after the hero: it jumps and lands where he did.
      const delay = 0.06;
      let s = this.hist[0];
      for (const h of this.hist) {
        if (h.t <= now - delay) s = h;
        else break;
      }
      const k = Math.min(1, dt * 9);
      this.x += (s.x - 17 * this.heroFacing - this.x) * k;
      const before = this.y;
      this.y += (s.y - this.y) * Math.min(1, dt * 16);
      // Never fall far behind the hero (he rises fast): stay within a short distance of his height.
      this.y = Math.max(hy - 22, Math.min(hy + 3, this.y));
      const vy = dt > 0 ? (this.y - before) / dt : 0;
      this.mode = Math.abs(vy) > 14 ? 'jump' : Math.abs(this.x - this.lastX) > 0.4 ? 'walk' : 'sit';
    }
    const dx = this.x - this.lastX;
    if (Math.abs(dx) > 0.15) this.facing = dx > 0 ? 1 : -1;
    else this.facing = this.heroFacing;
    this.phase += Math.min(0.4, Math.abs(dx)) * 1.6 + dt * 3;
    this.lastX = this.x;
  }

  view(): PetView {
    return { x: this.x, lift: this.y, facing: this.facing, mode: this.mode, phase: this.phase };
  }
}
