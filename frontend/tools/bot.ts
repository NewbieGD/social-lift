// Balance bot: plays the real simulation with a configurable reaction delay.
// Usage (after `npm install`): npx tsx tools/bot.ts [runs] [reactionSec]
import { gameConfig } from '../src/core/gameConfig';
import { jumpApex } from '../src/core/generator';
import { DT, Sim } from '../src/core/sim';
import type { Platform } from '../src/core/types';
import type { LightId } from '../src/core/gameConfig';

export function playBot(seed: number, reaction: number, maxSec = 900): Sim {
  const sim = new Sim(seed, 700);
  let standY = sim.hero.y;
  let target: Platform | null = null;
  let pendingLight: { light: LightId; at: number } | null = null;
  const maxTicks = Math.round(maxSec / DT);
  while (!sim.dead && sim.tick < maxTicks) {
    // Pick a new target at the top of each jump.
    if (!target || !sim.platforms.includes(target) || (sim.hero.vy < 0 && target.y < standY)) {
      target = chooseTarget(sim, standY);
    }
    let axis = 0;
    if (target) {
      const dx = target.x - sim.hero.x;
      axis = Math.max(-1, Math.min(1, dx / 10));
    }
    const want = desiredLight(sim, target);
    if (want && want !== sim.light && (!pendingLight || pendingLight.light !== want)) {
      pendingLight = { light: want, at: sim.time + reaction };
    }
    let press: LightId | null = null;
    if (pendingLight && sim.time >= pendingLight.at) {
      press = pendingLight.light;
      pendingLight = null;
    }
    sim.step({ axis, press });
    for (const e of sim.events) if (e.type === 'land') { standY = e.y; target = null; }
  }
  return sim;
}

function lethal(p: Platform): boolean {
  return p.kind === 'red' || p.phase === 'red' || p.phase === 'warn';
}

function chooseTarget(sim: Sim, standY: number): Platform | null {
  const reachY = jumpApex() * 0.85;
  let best: Platform | null = null;
  let bestScore = -Infinity;
  for (const p of sim.platforms) {
    const dy = p.y - standY;
    if (dy < 20 || dy > reachY) continue;
    let s = dy * 0.5 - Math.abs(p.x - sim.hero.x) * 0.3;
    if (p.kind === 'color') s += 60;
    if (p.kind === 'red') s -= 80;
    if (p.phases) s -= 15;
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}

function desiredLight(sim: Sim, target: Platform | null): LightId | null {
  if (!target) return null;
  if (lethal(target)) return 'red';
  if (target.kind === 'color' && target.color) return target.color;
  return null;
}

// CLI
const runs = Number(process.argv[2] || 30);
const reaction = Number(process.argv[3] || 0.3);
const tierTimes: number[][] = gameConfig.tiers.map(() => []);
let totalTime = 0, totalScore = 0;
for (let i = 0; i < runs; i++) {
  const sim = playBot(1000 + i, reaction);
  totalTime += sim.runTime;
  totalScore += sim.score;
  tierTimes[sim.tier].push(sim.runTime);
}
console.log(`runs=${runs} reaction=${reaction}s avgTime=${(totalTime / runs).toFixed(1)}s avgScore=${(totalScore / runs).toFixed(0)}`);
console.log('final tier distribution:', tierTimes.map((t) => t.length).join(' '));
