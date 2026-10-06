// Cosmetic styles: seven sets, each with its own colors and look. Styles never change the score.
// The ids match backend/app/cosmetics.py ("<set>_<slot>"). Only art and names live here;
// how a part is obtained (record, drop, duels) is decided by the server.

import type { Slot } from './slots';

export interface Palette {
  main: string;
  sub: string;
  accent: string;
  dark: string;
  /** Glow color (visors, eyes, lenses). */
  glow?: string;
  /** Skin override for the whole set (e.g. green). */
  skin?: string;
  skinShade?: string;
}

export interface StyleDef {
  id: string;
  set: string;
  slot: Slot;
  palette: Palette;
  /** Drawing variant of this part, see styleArt.ts. */
  kind: string;
}

export interface StyleSet {
  id: string;
  palette: Palette;
  /** Parts in display order. */
  parts: Slot[];
}

/**
 * Common motif: faceted, angular cuts with one bright accent per set, a dark outline,
 * flat colors with a soft highlight. Every set uses two main colors and one accent.
 */
export const STYLE_SETS: StyleSet[] = [
  {
    id: 'starter',
    palette: { main: '#8A93A3', sub: '#3F5F8F', accent: '#F2C14E', dark: '#4F5868' },
    parts: ['head', 'torso', 'legs', 'feet'],
  },
  {
    // Red and gold armor with a glowing visor slit.
    id: 'steel',
    palette: { main: '#C2282F', sub: '#E6B83A', accent: '#FFE48A', dark: '#6E1218', glow: '#9CE8FF' },
    parts: ['head', 'torso', 'arms', 'legs'],
  },
  {
    // Midnight blue with silver and violet, a hood and a long cape.
    id: 'night',
    palette: { main: '#1E2540', sub: '#B9C2D4', accent: '#6B5AD2', dark: '#0B0F20', glow: '#EAF3FF' },
    parts: ['head', 'torso', 'arms', 'legs'],
  },
  {
    // Cobalt and white with an orange cape and glowing red eyes.
    id: 'captain',
    palette: { main: '#2E5FD6', sub: '#F2F5FA', accent: '#F28A2B', dark: '#173477', glow: '#FF3B3B' },
    parts: ['head', 'torso', 'arms', 'legs'],
  },
  {
    // Moss green with a brown shell on the back and an orange headband.
    id: 'ninja',
    palette: { main: '#4E7A3A', sub: '#8A5A33', accent: '#F08A2B', dark: '#2A3B20' },
    parts: ['head', 'torso', 'arms', 'legs'],
  },
  {
    // Purple and mint with a web pattern and big white mask lenses.
    id: 'acrobat',
    palette: { main: '#5B3FA8', sub: '#5BE3C2', accent: '#B9FFEA', dark: '#2A1B58', glow: '#F5FBFF' },
    parts: ['head', 'torso', 'arms', 'legs'],
  },
  {
    // Green skin and ragged teal clothes: huge arms, torn trousers.
    id: 'brute',
    palette: { main: '#55707A', sub: '#34474F', accent: '#9CD28A', dark: '#223037', skin: '#6FBF5B', skinShade: '#4E9540' },
    parts: ['head', 'torso', 'arms', 'legs'],
  },
];

const KINDS: Record<string, Partial<Record<Slot, string>>> = {
  starter: { head: 'beanie', torso: 'hoodie', legs: 'jeans', feet: 'sneaker' },
  steel: { head: 'helmet', torso: 'armor', arms: 'gauntlet', legs: 'plates' },
  night: { head: 'cowl', torso: 'tunic', arms: 'bracer', legs: 'trousers' },
  captain: { head: 'glow', torso: 'suit', arms: 'glove', legs: 'bodysuit' },
  ninja: { head: 'headband', torso: 'wraps', arms: 'wrap', legs: 'wraplegs' },
  acrobat: { head: 'mask', torso: 'web', arms: 'webglove', legs: 'weblegs' },
  brute: { head: 'brute', torso: 'bare', arms: 'big', legs: 'torn' },
};

export const STYLES: Record<string, StyleDef> = {};
for (const set of STYLE_SETS) {
  for (const slot of set.parts) {
    const id = `${set.id}_${slot}`;
    STYLES[id] = { id, set: set.id, slot, palette: set.palette, kind: KINDS[set.id][slot] ?? '' };
  }
}

export function styleDef(id: string | undefined): StyleDef | undefined {
  return id ? STYLES[id] : undefined;
}

export type StyleLoadout = Partial<Record<Slot, string>>;

/** The worn styles of a loadout as definitions, by slot. */
export interface WornStyles {
  head?: StyleDef;
  torso?: StyleDef;
  arms?: StyleDef;
  legs?: StyleDef;
  feet?: StyleDef;
  /** The style that draws the boots: a feet piece, else the boots of a worn legs piece. */
  boots?: StyleDef;
}

export function wornStyles(loadout: StyleLoadout | undefined): WornStyles {
  const w: WornStyles = {};
  if (!loadout) return w;
  w.head = styleDef(loadout.head);
  w.torso = styleDef(loadout.torso);
  w.arms = styleDef(loadout.arms);
  w.legs = styleDef(loadout.legs);
  w.feet = styleDef(loadout.feet);
  // A full-body set (no separate feet piece) brings its own boots.
  w.boots = w.feet ?? (w.legs && w.legs.set !== 'starter' ? w.legs : undefined);
  return w;
}

export function hasAnyStyle(w: WornStyles): boolean {
  return !!(w.head || w.torso || w.arms || w.legs || w.feet);
}
