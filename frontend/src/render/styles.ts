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
  /** Sold for VK votes (not found or earned). */
  premium?: boolean;
  /** Lent to the mayor or to an assistant for the term of the post. */
  gov?: boolean;
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
    // Premium: pearl-white and gold armor with winged boots and a glowing cyan crystal. Worn
    // completely it wraps the hero in light; the armor also grows wings while he jumps.
    id: 'seraph',
    premium: true,
    palette: { main: '#F4F1E8', sub: '#E9B93C', accent: '#7FE8FF', dark: '#2B3A8C', glow: '#BFF6FF' },
    parts: ['head', 'torso', 'arms', 'legs', 'torch'],
  },
  {
    // Reward for 10 duel wins in a row against different players: a chrome combat machine with
    // red eyes, a glowing core and pistons. Worn completely, a red scanner line sweeps over it.
    id: 'legion',
    palette: { main: '#C9CFD8', sub: '#4A515C', accent: '#FF2A2A', dark: '#1B1F26', glow: '#FF6A4A' },
    parts: ['head', 'torso', 'arms', 'legs', 'torch'],
  },
  {
    // The mayor's set (for the term of his post): a black coat with gold, a peaked cap with the city on it,
    // a cape that is a night skyline with lit windows, gold gloves, and a lighthouse beacon for a flashlight.
    id: 'mayor',
    gov: true,
    palette: { main: '#17131F', sub: '#E8B53A', accent: '#FFF2B0', dark: '#08060C', glow: '#FFD25A' },
    parts: ['head', 'torso', 'arms', 'legs', 'torch'],
  },
  {
    // The assistants' set: a navy suit with a silver badge and a soft silver glow.
    id: 'advisor',
    gov: true,
    palette: { main: '#1E2D58', sub: '#C8D4EC', accent: '#E8F0FF', dark: '#0C1630', glow: '#B8CCF0' },
    parts: ['head', 'torso', 'arms', 'legs', 'torch'],
  },
  // Flashlights: each one replaces the flashlight in the hero's hand.
  { id: 'phone', palette: { main: '#2B3038', sub: '#8FA0B8', accent: '#FFFFFF', dark: '#14171C' }, parts: ['torch'] },
  { id: 'wood', palette: { main: '#8A5A33', sub: '#C9A06A', accent: '#FFB02E', dark: '#4A2F18' }, parts: ['torch'] },
  { id: 'saber', palette: { main: '#B9C1CD', sub: '#2B3038', accent: '#57D6FF', dark: '#14171C', glow: '#BFF3FF' }, parts: ['torch'] },
  { id: 'fireball', palette: { main: '#3A2A22', sub: '#7A4A2A', accent: '#FF8A1F', dark: '#1C130F', glow: '#FFD27A' }, parts: ['torch'] },
  { id: 'jar', palette: { main: '#BFE3F0', sub: '#7A8A96', accent: '#E6FF6A', dark: '#34444F', glow: '#F4FFB0' }, parts: ['torch'] },
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
  seraph: { head: 'seraphHelm', torso: 'seraphArmor', arms: 'seraphGauntlet', legs: 'seraphGreaves', torch: 'seraphLantern' },
  mayor: { head: 'mayorHat', torso: 'mayorCoat', arms: 'mayorGloves', legs: 'mayorLegs', torch: 'mayorBeacon' },
  advisor: { head: 'advisorCap', torso: 'advisorSuit', arms: 'advisorSleeves', legs: 'advisorLegs', torch: 'advisorClip' },
  legion: { head: 'legionHead', torso: 'legionArmor', arms: 'legionArms', legs: 'legionLegs', torch: 'legionTorch' },
  phone: { torch: 'phoneTorch' },
  wood: { torch: 'woodTorch' },
  saber: { torch: 'saberTorch' },
  fireball: { torch: 'fireTorch' },
  jar: { torch: 'jarTorch' },
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
  torch?: StyleDef;
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
  w.torch = styleDef(loadout.torch);
  // A full-body set (no separate feet piece) brings its own boots.
  w.boots = w.feet ?? (w.legs && w.legs.set !== 'starter' ? w.legs : undefined);
  return w;
}

export function hasAnyStyle(w: WornStyles): boolean {
  return !!(w.head || w.torso || w.arms || w.legs || w.feet || w.torch);
}

/** All five parts of the chrome set are worn together: the red scanner runs over the hero. */
export function fullLegion(w: WornStyles): boolean {
  return [w.head, w.torso, w.arms, w.legs, w.torch].every((d) => d?.set === 'legion');
}

/** How far (in hero units) a held light is longer than a plain flashlight: the beam starts at its tip. */
export function torchReach(d: StyleDef | undefined): number {
  switch (d?.kind) {
    case 'woodTorch':
      return 4;
    case 'saberTorch':
      return 8;
    case 'fireTorch':
      return 5;
    case 'jarTorch':
      return 2;
    case 'phoneTorch':
    case 'legionTorch':
      return 1;
    default:
      return 0;
  }
}

/** All five parts of the premium set are worn together: the hero glows. */
export function fullSeraph(w: WornStyles): boolean {
  return [w.head, w.torso, w.arms, w.legs, w.torch].every((d) => d?.set === 'seraph');
}
