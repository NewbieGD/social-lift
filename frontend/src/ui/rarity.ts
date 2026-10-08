// Rarity of cosmetic items: the color of the card frame (gray, blue, purple, gold). It is derived
// from how hard the item is to get, so it needs nothing from the server.

import type { CatalogItem } from '../net/session';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#8A94A6',
  rare: '#4DA3FF',
  epic: '#B36BFF',
  legendary: '#FFC93C',
};

export function rarityOf(c: CatalogItem | undefined): Rarity {
  if (!c) return 'common';
  // Sold for votes, or a reward for a long streak of duel wins: the rarest things.
  if (c.product) return 'legendary';
  if (c.duel_streak !== null && c.duel_streak !== undefined) return c.duel_streak >= 10 ? 'legendary' : 'epic';
  if (c.record !== null && c.record !== undefined) return c.record >= 2600 ? 'epic' : c.record >= 1200 ? 'rare' : 'common';
  if (c.price !== null && c.price !== undefined) return c.price >= 1000 ? 'epic' : c.price >= 400 ? 'rare' : 'common';
  // Found on platforms during runs.
  if (c.drop) return 'rare';
  return 'common';
}

/** The classes to put on a card: its rarity and whether it is new. */
export function cardClass(c: CatalogItem | undefined, isNew = false): string {
  return `rarity-${rarityOf(c)}${isNew ? ' is-new' : ''}`;
}
