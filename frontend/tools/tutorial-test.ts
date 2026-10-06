// Plays the scripted tutorial headlessly with a simple bot and checks that every lesson can be finished.
// Usage: npx tsx tools/tutorial-test.ts
import assert from 'node:assert/strict';
import { jumpApex } from '../src/core/generator';
import type { LightId } from '../src/core/gameConfig';
import { DT, Sim } from '../src/core/sim';
import type { Platform } from '../src/core/types';
import { Tutorial } from '../src/ui/tutorial';

function run(seed: number, reaction: number): { seconds: number; cards: string[] } {
  let sim = new Sim(seed, 700, { tutorial: true });
  const classes = new Set<string>();
  const el = {
    innerHTML: '',
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
  } as unknown as HTMLElement;
  let finished = false;
  const cards: string[] = [];
  const glow: (LightId | null)[] = [];
  const tut = new Tutorial(el, {
    sim: () => sim,
    isTouch: false,
    keyLabel: (l) => l,
    highlight: (l) => glow.push(l),
    finish: () => (finished = true),
  });
  tut.begin();
  let standY = sim.hero.y;
  let target: Platform | null = null;
  let queued: LightId | null = null;
  let wait = 0;
  let lastHtml = '';
  for (let i = 0; i < 120 / DT && !finished; i++) {
    if (el.innerHTML !== lastHtml && el.innerHTML) {
      lastHtml = el.innerHTML;
      cards.push((/<h3>(.*?)<\/h3>/.exec(el.innerHTML) ?? [])[1] ?? '?');
    }
    if (tut.frozen) {
      wait += DT;
      if (wait < reaction) continue;
      wait = 0;
      const need = tut.waitingFor;
      if (need) {
        // Wrong presses are dropped by the host; then the awaited one arrives.
        assert.ok(!tut.acceptPress(need === 'red' ? 'yellow' : 'red'));
        assert.ok(tut.acceptPress(need));
        queued = need;
      } else tut.ok();
      continue;
    }
    // Steering: go to the nearest platform above that still gives something to do.
    if (!target || !sim.platforms.includes(target) || (sim.hero.vy < 0 && target.y < standY)) {
      let best: Platform | null = null;
      let bestScore = -Infinity;
      for (const p of sim.platforms) {
        const dy = p.y - standY;
        // Uncaptured colored platforms below count too (a human would walk back down to them).
        if ((dy < 20 && !(p.kind === 'color' && dy > -200)) || dy > jumpApex() * 0.85) continue;
        let s = -Math.abs(p.x - sim.hero.x) * 0.3 + (p.kind === 'color' ? 200 : 0) + dy * 0.2;
        if (p.kind === 'red') s += 150;
        if (s > bestScore) {
          bestScore = s;
          best = p;
        }
      }
      target = best;
    }
    const axis = target ? Math.max(-1, Math.min(1, (target.x - sim.hero.x) / 10)) : 0;
    sim.step({ axis, press: queued });
    queued = null;
    for (const e of sim.events) {
      if (e.type === 'land') {
        standY = e.y;
        target = null;
      }
      assert.notEqual(e.type, 'death', 'nobody dies in the tutorial');
    }
    tut.tick();
    if (sim.tick > 120 / DT) break;
  }
  if (!finished) console.log('stuck', { target: target && [target.kind, target.x, target.y], hero: [sim.hero.x, sim.hero.y, sim.hero.vy], standY, plats: sim.platforms.map((p) => [p.kind, Math.round(p.x), p.y]) });
  assert.ok(finished, `tutorial not finished (phase ${tut.phase}, captures ${sim.captures}, seed ${seed})`);
  assert.equal(sim.captures, 9);
  assert.ok(!sim.dead);
  return { seconds: sim.time, cards };
}

for (const seed of [1, 2, 3, 42, 777, 123456]) {
  for (const reaction of [0.1, 1.5]) {
    const r = run(seed, reaction);
    console.log(`seed ${seed} reaction ${reaction}: done in ${r.seconds.toFixed(1)}s, cards: ${r.cards.join(' > ')}`);
  }
}
console.log('tutorial ok');
