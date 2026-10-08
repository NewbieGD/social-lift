// The small state of the living main screen: what is switched on, and what was just touched.
// The switches are remembered on this device.

const KEY = 'sl_menu_state';

interface Saved {
  tvOn: boolean;
  lampOn: boolean;
  /** Where the hero was put on the main screen (fractions of the stage); null = the default place. */
  hero: { x: number; y: number } | null;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { tvOn: true, lampOn: true, hero: null, ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    /* blocked storage: the defaults apply */
  }
  return { tvOn: true, lampOn: true, hero: null };
}

export const menuState = {
  ...load(),
  /** Time (seconds, the stage clock) of the last tap on a prop: for its little animation. */
  touched: new Map<string, number>(),
  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ tvOn: this.tvOn, lampOn: this.lampOn, hero: this.hero }));
    } catch {
      /* ignore */
    }
  },
};
