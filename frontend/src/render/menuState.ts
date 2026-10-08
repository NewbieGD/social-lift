// The small state of the living main screen: what is switched on, and what was just touched.
// The switches are remembered on this device.

const KEY = 'sl_menu_state';

interface Saved {
  tvOn: boolean;
  lampOn: boolean;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { tvOn: true, lampOn: true, ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    /* blocked storage: the defaults apply */
  }
  return { tvOn: true, lampOn: true };
}

export const menuState = {
  ...load(),
  /** Time (seconds, the stage clock) of the last tap on a prop: for its little animation. */
  touched: new Map<string, number>(),
  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ tvOn: this.tvOn, lampOn: this.lampOn }));
    } catch {
      /* ignore */
    }
  },
};
