// All balance numbers live here so the owner can tune the game without touching logic.

export type ColorId = 'yellow' | 'blue' | 'green';
export type LightId = ColorId | 'red';

export interface TierConfig {
  /** Score needed to reach this tier. */
  from: number;
  /** Chance that a newly generated platform is a base red platform. */
  redChance: number;
  /** Chance that a colored platform can go into a red phase. */
  phaseChance: number;
  /** Random interval between red phases, seconds [min, max]. */
  phaseInterval: [number, number];
  /** Warning duration before a red phase, seconds (never below 0.4). */
  telegraphSec: number;
  /** Red phase duration, seconds [min, max]. */
  redSec: [number, number];
  /** How long a used (white) platform lives, seconds. */
  whiteLifetime: number;
  /** Speed of the rising "debt wave", world units per second. */
  riseSpeed: number;
}

export const gameConfig = {
  world: {
    width: 360,
    minHeight: 560,
    maxHeight: 780,
  },
  sim: {
    hz: 60,
    maxFrameSec: 0.25,
  },
  hero: {
    width: 34,
    height: 52,
    /** Half width of the feet used for landing checks. */
    footHalf: 14,
    gravity: 2000,
    jumpImpulse: 760,
    maxSpeedX: 260,
    accelX: 3200,
  },
  platform: {
    width: 78,
    height: 14,
    /** Vertical gap between consecutive platforms [min, max]. */
    gap: [60, 110] as [number, number],
    /** Gap used around a base red platform so the safe path stays reachable. */
    redGap: [50, 57] as [number, number],
    /** Share of the theoretical jump range treated as reachable. */
    reachFactor: 0.8,
    /** Batch size weights for 1, 2, 3 platforms. */
    batchWeights: [50, 35, 15],
    maxOnScreen: 8,
    /** Generate this far above the visible top edge. */
    spawnAhead: 260,
  },
  colors: {
    yellow: { points: 2, unlockTier: 0 },
    blue: { points: 3, unlockTier: 1 },
    green: { points: 4, unlockTier: 2 },
  } as Record<ColorId, { points: number; unlockTier: number }>,
  combo: {
    windowSec: 2.5,
    /** [minimum streak, multiplier], checked from the top. */
    steps: [
      [8, 3],
      [6, 2.5],
      [4, 2],
      [2, 1.5],
    ] as [number, number][],
  },
  wave: {
    /** Seconds after the run starts before the wave begins rising. */
    delaySec: 8,
    /** Start offset below the starting platform. */
    startBelow: 220,
    /** The wave never lags further than this below the camera bottom. */
    maxLag: 140,
  },
  camera: {
    /** Hero is kept at this share of the view height from the bottom. */
    heroAnchor: 0.38,
    follow: 10,
  },
  items: {
    /** Bonus to the score multiplier per item worn in the run (13 items -> x1.65). */
    bonusPerItem: 0.05,
    /** Chance that a tier's item appears when the tier is entered. */
    chance: 0.5,
    /** Chance that one earlier missed item gets a second try on a new tier. */
    laterChance: 0.4,
    count: 13,
  },
  death: {
    hitStopMs: 120,
    slowMoSec: 0.6,
    slowMoScale: 0.35,
  },
  input: {
    /** Drag sensitivity multiplier (1 = finger moves hero 1:1 in world units). */
    dragSensitivity: 1.15,
    /** World units of offset that produce full speed. */
    dragDeadband: 14,
  },
  tiers: [
    { from: 0   ,    redChance: 0,    phaseChance: 0.15, phaseInterval: [2.5, 6.0], telegraphSec: 0.90, redSec: [1.0, 1.6], whiteLifetime: 12, riseSpeed: 10 },
    { from: 200 ,   redChance: 0.05, phaseChance: 0.22, phaseInterval: [2.4, 5.6], telegraphSec: 0.80, redSec: [1.0, 1.6], whiteLifetime: 12, riseSpeed: 13 },
    { from: 550 ,  redChance: 0.07, phaseChance: 0.30, phaseInterval: [2.3, 5.3], telegraphSec: 0.70, redSec: [1.0, 1.6], whiteLifetime: 11.5, riseSpeed: 16 },
    { from: 900 ,  redChance: 0.09, phaseChance: 0.38, phaseInterval: [2.2, 5.0], telegraphSec: 0.60, redSec: [1.0, 1.6], whiteLifetime: 11, riseSpeed: 19 },
    { from: 1300,  redChance: 0.11, phaseChance: 0.42, phaseInterval: [2.1, 4.8], telegraphSec: 0.57, redSec: [1.0, 1.6], whiteLifetime: 10.5, riseSpeed: 22 },
    { from: 1750,  redChance: 0.13, phaseChance: 0.46, phaseInterval: [2.0, 4.6], telegraphSec: 0.54, redSec: [1.0, 1.6], whiteLifetime: 10, riseSpeed: 25 },
    { from: 2250,  redChance: 0.15, phaseChance: 0.50, phaseInterval: [1.9, 4.4], telegraphSec: 0.51, redSec: [1.0, 1.6], whiteLifetime: 10, riseSpeed: 28 },
    { from: 2800, redChance: 0.17, phaseChance: 0.54, phaseInterval: [1.8, 4.2], telegraphSec: 0.48, redSec: [1.0, 1.6], whiteLifetime: 9.5, riseSpeed: 31 },
    { from: 3400, redChance: 0.19, phaseChance: 0.58, phaseInterval: [1.7, 4.0], telegraphSec: 0.46, redSec: [1.0, 1.6], whiteLifetime: 9, riseSpeed: 34 },
    { from: 4050, redChance: 0.21, phaseChance: 0.62, phaseInterval: [1.6, 3.8], telegraphSec: 0.44, redSec: [1.0, 1.6], whiteLifetime: 9, riseSpeed: 37 },
    { from: 4700, redChance: 0.23, phaseChance: 0.66, phaseInterval: [1.5, 3.6], telegraphSec: 0.42, redSec: [1.0, 1.6], whiteLifetime: 8.5, riseSpeed: 40 },
    { from: 5350, redChance: 0.25, phaseChance: 0.70, phaseInterval: [1.5, 3.5], telegraphSec: 0.40, redSec: [1.0, 1.6], whiteLifetime: 8, riseSpeed: 43 },
    { from: 6100, redChance: 0.27, phaseChance: 0.74, phaseInterval: [1.5, 3.5], telegraphSec: 0.40, redSec: [1.0, 1.6], whiteLifetime: 8, riseSpeed: 45 },
  ] as TierConfig[],
};

export type GameConfig = typeof gameConfig;

export function tierForScore(score: number): number {
  const tiers = gameConfig.tiers;
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (score >= tiers[i].from) return i;
  }
  return 0;
}

export function isColorUnlocked(color: ColorId, tier: number): boolean {
  return tier >= gameConfig.colors[color].unlockTier;
}

export function comboMultiplier(streak: number): number {
  for (const [min, mult] of gameConfig.combo.steps) {
    if (streak >= min) return mult;
  }
  return 1;
}
