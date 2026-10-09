import type { ColorId, LightId } from './gameConfig';

export type PlatformKind = 'start' | 'color' | 'white' | 'red';
export type PhaseState = 'normal' | 'warn' | 'red';

export interface Platform {
  id: number;
  /** Center x. */
  x: number;
  /** Top surface y (world y grows upward). */
  y: number;
  kind: PlatformKind;
  color: ColorId | null;
  /** Whether this platform cycles through red phases. */
  phases: boolean;
  phase: PhaseState;
  /** Seconds left in the current phase (or until the next warning when normal). */
  phaseT: number;
  phaseLen: number;
  /** Seconds left before a white platform disappears. */
  whiteT: number;
  /** Seconds since the platform became white (for the capture wave effect). */
  whiteAge: number;
  /** Collectible item (tier index) lying on this platform, or -1. */
  item: number;
  /** A cosmetic offered by the server for this run lies on the platform. */
  drop?: boolean;
  /** The ring of a mayor candidate lies on the platform (the server decided so for this run). */
  ring?: boolean;
}

export interface Hero {
  x: number;
  y: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;
  /** Seconds since last landing, used for squash animation. */
  sinceLand: number;
  facing: 1 | -1;
  spin: number;
}

export interface SimInput {
  /** Horizontal intent in [-1, 1]. */
  axis: number;
  /** Light button pressed during this tick. */
  press: LightId | null;
}

export type DeathReason = 'wave' | 'red' | 'fall';

export type SimEvent =
  | { type: 'land'; x: number; y: number; id: number }
  | { type: 'capture'; x: number; y: number; points: number; mult: number; color: ColorId }
  | { type: 'aura'; x: number; y: number }
  | { type: 'death'; reason: DeathReason }
  | { type: 'tier'; tier: number }
  | { type: 'unlock'; color: ColorId }
  | { type: 'light'; light: LightId | null }
  | { type: 'warn'; id: number }
  | { type: 'comboReset' }
  | { type: 'runStart' }
  | { type: 'close'; x: number; y: number }
  | { type: 'pickup'; item: number; x: number; y: number }
  | { type: 'itemSpawn'; item: number }
  | { type: 'dropPickup'; x: number; y: number }
  | { type: 'ringPickup'; x: number; y: number }
  | { type: 'wall'; x: number; y: number; side: number }
  /** Tutorial only: a mistake was forgiven (the hero was put back, or the shield switched on). */
  | { type: 'rescue'; reason: 'fall' | 'red' };
