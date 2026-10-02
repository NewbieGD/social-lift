// Player-selectable placement of the light buttons. Steering by dragging on the
// play field works the same in every layout.

import { ru } from '../i18n/ru';

export type ButtonLayout = 'triangle' | 'field' | 'row';
export type ShieldSide = 'left' | 'right';

export interface ControlsPrefs {
  layout: ButtonLayout;
  side: ShieldSide;
}

const LAYOUTS: ButtonLayout[] = ['triangle', 'field', 'row'];
const SIDES: ShieldSide[] = ['left', 'right'];
const KEY = 'sl_controls';

export function loadControls(): ControlsPrefs {
  const fallback: ControlsPrefs = { layout: 'triangle', side: 'left' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<ControlsPrefs> | null;
    if (!raw) return fallback;
    return {
      layout: LAYOUTS.includes(raw.layout as ButtonLayout) ? (raw.layout as ButtonLayout) : fallback.layout,
      side: SIDES.includes(raw.side as ShieldSide) ? (raw.side as ShieldSide) : fallback.side,
    };
  } catch {
    return fallback;
  }
}

function saveControls(p: ControlsPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: preferences live for this session only */
  }
}

/**
 * Moves the shield button to the right container and sets layout classes.
 * In the "field" layout the shield floats over the bottom corner of the board.
 */
export function applyControls(
  p: ControlsPrefs,
  els: { controls: HTMLElement; buttons: HTMLElement; board: HTMLElement; shield: HTMLElement },
): void {
  const { controls, buttons, board, shield } = els;
  for (const l of LAYOUTS) controls.classList.toggle(`layout-${l}`, l === p.layout);
  controls.classList.toggle('mirror', p.side === 'right');
  board.classList.toggle('mirror', p.side === 'right');
  const parent = p.layout === 'field' ? board : buttons;
  if (shield.parentElement !== parent) {
    if (parent === buttons) buttons.prepend(shield);
    else parent.appendChild(shield);
  }
  shield.classList.toggle('shield-float', p.layout === 'field');
}

/** Renders the two segmented pickers into every `.controls-picker` container. */
export function mountPickers(onChange: (p: ControlsPrefs) => void): void {
  const render = (): void => {
    const p = loadControls();
    for (const host of document.querySelectorAll<HTMLElement>('.controls-picker')) {
      host.innerHTML = `
        <div class="setting-label">${ru.controls.layoutTitle}</div>
        <div class="seg" role="radiogroup">
          ${LAYOUTS.map((l) => seg('layout', l, ru.controls.layouts[l], p.layout === l)).join('')}
        </div>
        <div class="setting-label">${ru.controls.sideTitle}</div>
        <div class="seg seg-2" role="radiogroup">
          ${SIDES.map((s) => seg('side', s, ru.controls.sides[s], p.side === s)).join('')}
        </div>`;
    }
  };
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.seg button');
    if (!btn) return;
    const p = loadControls();
    if (btn.dataset.kind === 'layout') p.layout = btn.dataset.value as ButtonLayout;
    else p.side = btn.dataset.value as ShieldSide;
    saveControls(p);
    render();
    onChange(p);
  });
  render();
}

function seg(kind: string, value: string, label: string, on: boolean): string {
  return `<button type="button" role="radio" aria-checked="${on}" class="${on ? 'on' : ''}" data-kind="${kind}" data-value="${value}">${label}</button>`;
}
