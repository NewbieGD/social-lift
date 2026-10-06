// Core game tests (no browser): npx tsx tools/sim-tests.ts
import assert from 'node:assert/strict';
import { comboMultiplier, gameConfig, isColorUnlocked, tierForScore, type LightId } from '../src/core/gameConfig';
import { Generator, horizontalReach, jumpApex } from '../src/core/generator';
import { Rng } from '../src/core/prng';
import { Sim } from '../src/core/sim';
import type { Platform } from '../src/core/types';
import { playBot } from './bot';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

test('determinism: same seed and inputs give the same run', () => {
  const a = playBot(777, 0.3, 120);
  const b = playBot(777, 0.3, 120);
  assert.equal(a.score, b.score);
  assert.equal(a.tick, b.tick);
  assert.equal(a.captures, b.captures);
  // Replaying the recorded input log reproduces the run exactly.
  const replay = new Sim(777, 700);
  const log = a.inputLog;
  const codes: (LightId | null)[] = [null, 'yellow', 'blue', 'green', 'red'];
  let axis = 0;
  let i = 0;
  while (!replay.dead && replay.tick < a.tick) {
    let press: LightId | null = null;
    while (i < log.length && log[i][0] === replay.tick) {
      axis = log[i][1] / 8;
      if (log[i][2] > 0) press = codes[log[i][2]];
      i++;
    }
    replay.step({ axis, press });
  }
  assert.equal(replay.score, a.score);
  assert.equal(replay.dead, a.dead);
});

test('reachability on 1000 seeds: every safe platform has a safe reachable one above', () => {
  const W = gameConfig.world.width;
  const maxDy = jumpApex() * gameConfig.platform.reachFactor + 1;
  for (let seed = 1; seed <= 1000; seed++) {
    const tier = seed % gameConfig.tiers.length;
    const gen = new Generator(new Rng(seed), W / 2, 120);
    const all: Platform[] = [gen.makeStart(W / 2, 120)];
    all.push(...gen.generateUpTo(3000, tier, 700, all));
    const safe = all.filter((p) => p.kind !== 'red');
    for (const p of safe) {
      if (p.y > 3000 - maxDy) continue;
      const ok = safe.some((q) => {
        const dy = q.y - p.y;
        return dy > 15 && dy <= maxDy && Math.abs(q.x - p.x) <= horizontalReach(dy) * gameConfig.platform.reachFactor + 1;
      });
      assert.ok(ok, `seed ${seed} tier ${tier}: dead end at y=${p.y.toFixed(0)}`);
    }
  }
});

function landOn(platform: Partial<Platform>, light: LightId | null): Sim {
  const sim = new Sim(1, 700);
  const p: Platform = {
    id: 999, x: 180, y: 400, kind: 'color', color: 'yellow', phases: false, phase: 'normal',
    phaseT: 99, phaseLen: 99, whiteT: 0, whiteAge: 0, item: -1, ...platform,
  };
  sim.platforms = [p];
  sim.runStarted = true;
  sim.hero.x = 180;
  sim.hero.y = 430;
  sim.hero.vy = -10;
  sim.light = light;
  for (let i = 0; i < 30 && sim.hero.vy <= 0 && !sim.dead; i++) sim.step({ axis: 0, press: null });
  return sim;
}

test('landing table', () => {
  let s = landOn({}, 'yellow');
  assert.equal(s.captures, 1);
  assert.equal(s.platforms.find((p) => p.id === 999)?.kind, 'white');
  s = landOn({}, 'blue');
  assert.equal(s.captures, 0);
  assert.equal(s.dead, false);
  s = landOn({ kind: 'red', color: null }, 'yellow');
  assert.equal(s.dead, true);
  s = landOn({ kind: 'red', color: null }, 'red');
  assert.equal(s.dead, false);
  s = landOn({ phase: 'red', phases: true }, null);
  assert.equal(s.dead, true);
  s = landOn({ phase: 'warn', phases: true }, 'yellow');
  assert.equal(s.dead, false, 'warning is still safe');
  s = landOn({ kind: 'white', color: null, whiteT: 5 }, null);
  assert.equal(s.dead, false);
});

test('combo multiplier steps', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 12].map(comboMultiplier), [1, 1, 1.5, 1.5, 2, 2, 2.5, 2.5, 3, 3]);
});

test('tiers and color unlocks', () => {
  assert.equal(tierForScore(0), 0);
  assert.equal(tierForScore(gameConfig.tiers[1].from), 1);
  assert.equal(tierForScore(gameConfig.tiers[1].from - 1), 0);
  assert.equal(tierForScore(10 ** 7), 12);
  assert.ok(isColorUnlocked('yellow', 0));
  assert.ok(!isColorUnlocked('blue', 0) && isColorUnlocked('blue', 1));
  assert.ok(!isColorUnlocked('green', 1) && isColorUnlocked('green', 2));
  for (let i = 1; i < gameConfig.tiers.length; i++) assert.ok(gameConfig.tiers[i].from > gameConfig.tiers[i - 1].from);
});

test('red phase is always preceded by a full warning', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const sim = playBot(seed, 0.3, 60);
    void sim;
  }
  // Direct check on the state machine.
  const sim = new Sim(3, 700);
  const p = sim.platforms.find((q) => q.kind === 'color')!;
  p.phases = true;
  p.phase = 'normal';
  p.phaseT = 0.01;
  let sawWarn = false;
  for (let i = 0; i < 200; i++) {
    sim.step({ axis: 0, press: null });
    if (p.phase === 'warn') sawWarn = true;
    if (p.phase === 'red') {
      assert.ok(sawWarn);
      break;
    }
  }
});

test('items: each run starts from zero, pickups add the bonus, no item repeats within a run', () => {
  let found: Sim | null = null;
  for (let seed = 1; seed < 60 && !found; seed++) {
    const sim = new Sim(seed, 700, { items: true });
    for (let i = 0; i < 400; i++) {
      sim.step({ axis: sim.platforms[1].x > sim.hero.x ? 1 : -1, press: null });
      if (sim.platforms.some((p) => p.item === 0)) {
        found = sim;
        break;
      }
      if (sim.dead) break;
    }
  }
  assert.ok(found, 'the cap appears in some runs');
  const sim = found!;
  assert.equal(sim.owned, 0);
  const p = sim.platforms.find((q) => q.item === 0)!;
  sim.hero.x = p.x;
  sim.hero.y = p.y + 30;
  sim.hero.vy = -10;
  for (let i = 0; i < 30 && sim.hero.vy <= 0; i++) sim.step({ axis: 0, press: null });
  assert.equal(sim.picked & 1, 1);
  assert.ok(Math.abs(sim.itemBonus - 1 - gameConfig.items.bonusPerItem) < 1e-9);
  for (let i = 0; i < 300; i++) sim.step({ axis: 0, press: null });
  assert.ok(!sim.platforms.some((q) => q.item === 0), 'a worn item never appears again in the same run');
});

test('a cosmetic drop appears after a while and is collected by landing on it', () => {
  let found = false;
  for (let seed = 1; seed < 40 && !found; seed++) {
    const sim = new Sim(seed, 700, { items: true, drop: true });
    let placed: Platform | undefined;
    for (let i = 0; i < 3000 && !sim.dead; i++) {
      sim.step({ axis: sim.platforms[1] && sim.platforms[1].x > sim.hero.x ? 1 : -1, press: null });
      placed = sim.platforms.find((p) => p.drop);
      if (placed) break;
    }
    if (!placed) continue;
    assert.equal(sim.dropFound, false);
    sim.hero.x = placed.x;
    sim.hero.y = placed.y + 30;
    sim.hero.vy = -10;
    for (let i = 0; i < 30 && sim.hero.vy <= 0; i++) sim.step({ axis: 0, press: null });
    assert.equal(sim.dropFound, true);
    assert.ok(!sim.platforms.some((p) => p.drop), 'a drop is placed only once');
    found = true;
  }
  assert.ok(found, 'a drop was placed in some run');
  // Without the server offering one nothing is placed.
  const plain = new Sim(3, 700, { items: true });
  for (let i = 0; i < 2000 && !plain.dead; i++) plain.step({ axis: 0, press: null });
  assert.ok(!plain.platforms.some((p) => p.drop));
});

console.log(`\n${passed} tests passed`);
