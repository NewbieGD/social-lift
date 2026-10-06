// All player settings in one flat object: cached locally, synced to the server
// (last writer by timestamp wins, so settings match across devices).

export type ButtonLayout = 'triangle' | 'field' | 'row';
export type ShieldSide = 'left' | 'right';
export type SteerMode = 'drag' | 'zones';

export interface Settings {
  layout: ButtonLayout;
  side: ShieldSide;
  steer: SteerMode;
  /** Drag sensitivity multiplier. */
  sens: number;
  music: boolean;
  musicVol: number;
  sfxVol: number;
  vibration: boolean;
  colorblind: boolean;
  reducedFx: boolean;
  rulesCard: boolean;
  /** Freeze-frame movie when the outfit changes. */
  cinematic: boolean;
  /** Keyboard bindings for the four light buttons (KeyboardEvent.code), browser only. */
  keyYellow: string;
  keyBlue: string;
  keyGreen: string;
  keyRed: string;
}

export const DEFAULTS: Settings = {
  layout: 'triangle',
  side: 'left',
  steer: 'drag',
  sens: 1.15,
  music: true,
  musicVol: 0.6,
  sfxVol: 0.8,
  vibration: true,
  colorblind: false,
  reducedFx: false,
  rulesCard: true,
  cinematic: true,
  keyYellow: 'Digit1',
  keyBlue: 'Digit2',
  keyGreen: 'Digit3',
  keyRed: 'Space',
};

export const KEY_SETTINGS = ['keyYellow', 'keyBlue', 'keyGreen', 'keyRed'] as const;
export type KeySetting = (typeof KEY_SETTINGS)[number];

const KEY = 'sl_settings';
const LEGACY_KEY = 'sl_controls';

const ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
  layout: ['triangle', 'field', 'row'],
  side: ['left', 'right'],
  steer: ['drag', 'zones'],
};
const RANGES: Partial<Record<keyof Settings, [number, number]>> = {
  sens: [0.6, 1.8],
  musicVol: [0, 1],
  sfxVol: [0, 1],
};

/** Keeps only known keys with valid values; anything else falls back to defaults. */
function sanitize(raw: Record<string, unknown>): Settings {
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = raw[key];
    const def = DEFAULTS[key];
    if (ENUMS[key]) {
      if (typeof v === 'string' && ENUMS[key]!.includes(v)) out[key] = v;
    } else if (typeof def === 'number') {
      const [a, b] = RANGES[key] ?? [-Infinity, Infinity];
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(b, Math.max(a, v));
    } else if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v;
    } else if (typeof def === 'string') {
      // Key codes such as "KeyQ" or "ShiftLeft": short and plain, or the default stays.
      if (typeof v === 'string' && /^[A-Za-z0-9]{2,20}$/.test(v)) out[key] = v;
    }
  }
  return out as unknown as Settings;
}

type Listener = (s: Settings, changed: (keyof Settings)[]) => void;

class SettingsStore {
  private value: Settings;
  private updatedAt = 0;
  private listeners: Listener[] = [];
  private pushTimer = 0;
  /** Set by the app: sends settings to the server. */
  pusher: ((s: Settings, updatedAt: number) => void) | null = null;

  constructor() {
    const { value, updatedAt } = this.read();
    this.value = value;
    this.updatedAt = updatedAt;
  }

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings>): void {
    const next = sanitize({ ...this.value, ...patch });
    const changed = (Object.keys(next) as (keyof Settings)[]).filter((k) => next[k] !== this.value[k]);
    if (!changed.length) return;
    this.value = next;
    this.updatedAt = Date.now();
    this.write();
    this.emit(changed);
    // Sliders fire many events: send to the server once the player stops.
    clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => this.pusher?.(this.value, this.updatedAt), 800);
  }

  /** Server copy wins only when it is newer than the local one. */
  adoptServer(raw: Record<string, unknown>, updatedAt: number): void {
    if (updatedAt <= this.updatedAt || !raw || !Object.keys(raw).length) return;
    const next = sanitize(raw);
    const changed = (Object.keys(next) as (keyof Settings)[]).filter((k) => next[k] !== this.value[k]);
    this.value = next;
    this.updatedAt = updatedAt;
    this.write();
    if (changed.length) this.emit(changed);
  }

  /** Back to defaults (after the player deletes their data). */
  reset(): void {
    this.value = { ...DEFAULTS };
    this.updatedAt = 0;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    this.emit(Object.keys(DEFAULTS) as (keyof Settings)[]);
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  private emit(changed: (keyof Settings)[]): void {
    for (const fn of this.listeners) fn(this.value, changed);
  }

  private read(): { value: Settings; updatedAt: number } {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as { v?: Record<string, unknown>; t?: number } | null;
      if (raw?.v) return { value: sanitize(raw.v), updatedAt: Number(raw.t) || 0 };
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null') as Record<string, unknown> | null;
      if (legacy) return { value: sanitize(legacy), updatedAt: Number(legacy.updatedAt) || 0 };
    } catch {
      /* corrupted or unavailable storage */
    }
    return { value: { ...DEFAULTS }, updatedAt: 0 };
  }

  private write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: this.value, t: this.updatedAt }));
    } catch {
      /* storage unavailable: settings live for this session */
    }
  }
}

export const settingsStore = new SettingsStore();
