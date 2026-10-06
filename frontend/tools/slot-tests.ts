// Slot rules for cosmetics and bonus items: npx tsx tools/slot-tests.ts
import assert from 'node:assert/strict';
import { ITEM_BY_TIER } from '../src/render/hero';
import { ITEM_SLOT, isBuffOnly, occupiedSlots, slotOfTier, splitBonus } from '../src/render/slots';

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

test('every bonus item has a slot', () => {
  for (const item of ITEM_BY_TIER) assert.ok(ITEM_SLOT[item], item);
});

test('no styles worn: every bonus item is drawn', () => {
  const occ = occupiedSlots({});
  const all = (1 << ITEM_BY_TIER.length) - 1;
  assert.deepEqual(splitBonus(all, occ), { worn: all, buffs: 0 });
});

test('a head style turns head items into buffs, the rest is still worn', () => {
  const occ = occupiedSlots({ head: 'hero_head' });
  assert.ok(isBuffOnly(0, occ), 'cap is head');
  assert.ok(isBuffOnly(11, occ), 'glasses are head');
  assert.ok(!isBuffOnly(1, occ), 'slippers are feet');
  const all = (1 << ITEM_BY_TIER.length) - 1;
  const { worn, buffs } = splitBonus(all, occ);
  assert.equal(worn | buffs, all);
  assert.equal(worn & buffs, 0);
  assert.equal(slotOfTier(0), 'head');
  for (let t = 0; t < ITEM_BY_TIER.length; t++) assert.equal(!!(buffs & (1 << t)), slotOfTier(t) === 'head');
});

test('a full set turns everything into buffs', () => {
  const occ = occupiedSlots({ head: 'a', torso: 'b', arms: 'c', legs: 'd', feet: 'e' });
  const all = (1 << ITEM_BY_TIER.length) - 1;
  assert.deepEqual(splitBonus(all, occ), { worn: 0, buffs: all });
});

console.log(`\n${passed} tests passed`);
