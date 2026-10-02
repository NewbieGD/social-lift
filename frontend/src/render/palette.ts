import type { ColorId } from '../core/gameConfig';

export const palette = {
  light: { yellow: '#FFD640', blue: '#5AA8FF', green: '#55DD84', red: '#FF4C5A' } as Record<ColorId | 'red', string>,
  platform: { yellow: '#F6C343', blue: '#3E8BFF', green: '#38C673' } as Record<ColorId, string>,
  platformEdge: { yellow: '#B9850E', blue: '#2257B8', green: '#1F8A4D' } as Record<ColorId, string>,
  red: '#E8394A',
  redEdge: '#931827',
  white: '#F3EFE3',
  whiteEdge: '#BDB49C',
  start: '#8C93A3',
  startEdge: '#565C6B',
  bill: '#7FCF8A',
  billMark: '#3E8C4C',
  skin: '#E9B48C',
  skinDark: '#D49C74',
  hair: '#3A2A22',
  shirt: '#E9E4D6',
  shorts: '#46608A',
  torch: '#3B3F4A',
};

export interface Scene {
  skyTop: string;
  skyBottom: string;
  block: string;
  window: string;
  dot: string;
  /** Page background around the play field. */
  page: string;
}

// One scene per wealth tier (see design doc, section 4).
export const scenes: Scene[] = [
  { skyTop: '#1F2A33', skyBottom: '#3B4A4F', block: '#2A363C', window: '#5E6B5A', dot: '#9FB0A8', page: '#151D23' },
  { skyTop: '#26304A', skyBottom: '#4A5470', block: '#2F3954', window: '#C8A86A', dot: '#B9C2DA', page: '#181F31' },
  { skyTop: '#3C6E9E', skyBottom: '#8FBBDB', block: '#4F7EA8', window: '#D8EAF6', dot: '#FFFFFF', page: '#22425F' },
  { skyTop: '#2B2350', skyBottom: '#B5607A', block: '#3A2F62', window: '#FFC873', dot: '#FFD9A6', page: '#1C1736' },
  { skyTop: '#4F9BCB', skyBottom: '#CDE7EE', block: '#6CA9C9', window: '#F4FBFF', dot: '#FFFFFF', page: '#2C5F80' },
  { skyTop: '#5FA7B8', skyBottom: '#D9EFC9', block: '#5E9B78', window: '#EAF7D4', dot: '#FFFFFF', page: '#2E5E58' },
  { skyTop: '#2E3F6B', skyBottom: '#D59A6A', block: '#3D4C78', window: '#FFE1A3', dot: '#FFE8C0', page: '#1D284A' },
  { skyTop: '#16203F', skyBottom: '#5C4A8E', block: '#232C55', window: '#FFD27A', dot: '#E9DCFF', page: '#0F1630' },
  { skyTop: '#5B3A1E', skyBottom: '#E8B865', block: '#7A4F28', window: '#FFF0C2', dot: '#FFF4D6', page: '#3A2512' },
  { skyTop: '#3D1F3A', skyBottom: '#D9A350', block: '#5A2E50', window: '#FFE6A0', dot: '#FFEFC7', page: '#281326' },
  { skyTop: '#1E2B4C', skyBottom: '#E3B868', block: '#2C3B63', window: '#FFE9B0', dot: '#FFF2CF', page: '#131B33' },
  { skyTop: '#0E7C9E', skyBottom: '#9FE6E0', block: '#138B9C', window: '#E8FFFB', dot: '#FFFFFF', page: '#0A4F66' },
  { skyTop: '#0B0F2A', skyBottom: '#3B2E6E', block: '#1A1F45', window: '#9FB8FF', dot: '#FFFFFF', page: '#070A1D' },
];
