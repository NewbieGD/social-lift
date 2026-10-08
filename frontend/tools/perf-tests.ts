// Adaptive quality: npx tsx tools/perf-tests.ts
import assert from 'node:assert/strict';
import { PerfMonitor, startLevel } from '../src/core/perf';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

/** Feeds `seconds` of frames of `ms` each. */
function feed(m: PerfMonitor, ms: number, seconds: number): void {
  for (let t = 0; t < seconds * 1000; t += ms) m.record(ms);
}

test('the start level follows what the device says', () => {
  assert.equal(startLevel({ memoryGb: 8, cores: 8 }), 0);
  assert.equal(startLevel({ memoryGb: 4, cores: 8 }), 1);
  assert.equal(startLevel({ cores: 4 }), 1);
  assert.equal(startLevel({ memoryGb: 2 }), 2);
  assert.equal(startLevel({}), 0);
});

test('a smooth device stays at the top level', () => {
  const m = new PerfMonitor();
  feed(m, 16.6, 60);
  assert.equal(m.level, 0);
});

test('a slow device steps down, but not at once and not below the lowest level', () => {
  const m = new PerfMonitor();
  feed(m, 40, 3);
  assert.equal(m.level, 0, 'one bad check is not enough');
  feed(m, 40, 30);
  assert.equal(m.level, 2);
  feed(m, 40, 60);
  assert.equal(m.level, 2);
});

test('it steps back up only after a long calm stretch', () => {
  const m = new PerfMonitor();
  feed(m, 40, 30);
  assert.equal(m.level, 2);
  feed(m, 16.6, 10);
  assert.equal(m.level, 2, 'ten calm seconds are not enough');
  feed(m, 16.6, 60);
  assert.ok(m.level < 2);
});

test('long pauses (a hidden tab) are ignored', () => {
  const m = new PerfMonitor();
  for (let i = 0; i < 100; i++) m.record(1500);
  assert.equal(m.level, 0);
});

test('the player can force a level and the report gives frames per second', () => {
  const m = new PerfMonitor();
  m.forced = 2;
  assert.equal(m.effective, 2);
  feed(m, 20, 5);
  assert.equal(m.report().fps, 50);
});

console.log(`\n${passed} tests passed`);
