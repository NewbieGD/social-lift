// Visual check page: a game scene with the crown, trail and waves, plus the menu hero with and without the crown.
import { gameConfig } from '../src/core/gameConfig';
import { DT, Sim } from '../src/core/sim';
import { outfitFromMask } from '../src/render/hero';
import { drawHeroFront } from '../src/render/heroFront';
import { CROWN_LIFT_FRONT, crownBob, drawCrown } from '../src/render/crown';
import { Renderer } from '../src/render/renderer';

const W = gameConfig.world.width;
const H = 700;
const scale = 1;
const params = new URLSearchParams(location.search);
const tier = Number(params.get('tier') ?? 0);
const crown = params.get('crown') !== '0';
const seconds = Number(params.get('sec') ?? 14);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const r = new Renderer(canvas);
r.resize(W, H, scale);
r.setScene(tier);
r.crown = crown;
r.ownedMask = Number(params.get('mask') ?? 0);
const sim = new Sim(5, H, {});
let press: 'yellow' | 'blue' | 'green' | null = 'yellow';
for (let i = 0; i < seconds / DT; i++) {
  // Simple wanderer: chase the nearest platform above, switch lights now and then.
  let best = null as null | { x: number; y: number };
  let bs = -1e9;
  for (const p of sim.platforms) {
    const dy = p.y - sim.hero.y;
    if (dy < 10 || dy > 150) continue;
    const s = -Math.abs(p.x - sim.hero.x);
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  const axis = best ? Math.max(-1, Math.min(1, (best.x - sim.hero.x) / 10)) : 0;
  if (i % 90 === 0) press = (['yellow', 'blue', 'green'] as const)[(i / 90) % 3];
  sim.step({ axis, press: i % 90 === 0 ? press : null });
  r.handleEvents(sim.events, sim);
  if (i < seconds / DT - 1) r.draw(sim, 1, DT);
}
r.draw(sim, 1, DT);
console.log("dead", sim.dead, "heroY", sim.hero.y, "camY", sim.camY, "score", sim.score, "mult", sim.multiplier);
(window as unknown as { done: boolean }).done = true;

// Menu hero
for (const [id, withCrown, mask] of [['m0', false, 0], ['m1', true, 0], ['m2', true, (1 << 13) - 1]] as const) {
  const c = document.getElementById(id) as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const w = c.width;
  const h = c.height;
  const sc = Math.min(w / 58, h / (withCrown ? 114 : 96));
  g.save();
  g.translate(w / 2, h - 6 * sc);
  g.scale(sc, sc);
  const o = outfitFromMask(mask);
  drawHeroFront(g, o, 1.3, 'idle', 'normal');
  if (withCrown) {
    g.translate(0, -(o.suit ? 68 : o.cap ? 64 : 61) - CROWN_LIFT_FRONT - crownBob(1.3));
    g.scale(1.15, 1.15);
    drawCrown(g, 1.3, false);
  }
  g.restore();
}
