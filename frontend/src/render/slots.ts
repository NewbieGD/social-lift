// Body slots shared by cosmetics (styles) and the run bonus items.
// A style worn in a slot keeps the slot: a bonus item for that slot still gives its +5% to the
// score multiplier, but it is not drawn on the hero. It shows as a buff icon instead.

import { ITEM_BY_TIER } from './hero';

export type Slot = 'head' | 'torso' | 'arms' | 'legs' | 'feet';

export const SLOTS: readonly Slot[] = ['head', 'torso', 'arms', 'legs', 'feet'];

/** Which slot every bonus item belongs to. */
export const ITEM_SLOT: Record<string, Slot> = {
  cap: 'head',
  glasses: 'head',
  helmet: 'head',
  slippers: 'feet',
  shoes: 'feet',
  sweats: 'legs',
  trousers: 'legs',
  shirt: 'torso',
  jacket: 'torso',
  tie: 'torso',
  watch: 'arms',
  newTorch: 'arms',
  phone: 'arms',
};

/** Slot of the bonus item that belongs to the given tier. */
export function slotOfTier(tier: number): Slot {
  return ITEM_SLOT[ITEM_BY_TIER[tier]] ?? 'torso';
}

/** Slots taken by worn styles (a loadout is {slot: styleId}). */
export function occupiedSlots(loadout: Partial<Record<Slot, string>> | undefined): Set<Slot> {
  const out = new Set<Slot>();
  for (const s of SLOTS) if (loadout?.[s]) out.add(s);
  return out;
}

/** True when a bonus item of this tier must be shown as a buff icon instead of being worn. */
export function isBuffOnly(tier: number, occupied: ReadonlySet<Slot>): boolean {
  return occupied.has(slotOfTier(tier));
}

/** Splits a run's bonus items into the drawn ones and the buff-icon ones. */
export function splitBonus(mask: number, occupied: ReadonlySet<Slot>): { worn: number; buffs: number } {
  let worn = 0;
  let buffs = 0;
  for (let t = 0; t < ITEM_BY_TIER.length; t++) {
    if (!(mask & (1 << t))) continue;
    if (isBuffOnly(t, occupied)) buffs |= 1 << t;
    else worn |= 1 << t;
  }
  return { worn, buffs };
}
