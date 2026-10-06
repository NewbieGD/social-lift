// Places the light buttons according to the chosen layout. Steering by dragging
// on the play field works the same in every layout.

import type { ButtonLayout, ShieldSide } from './settingsStore';

const LAYOUTS: ButtonLayout[] = ['triangle', 'field', 'row'];

/**
 * Moves the shield button to the right container and sets layout classes.
 * In the "field" layout the shield floats over the bottom corner of the board.
 */
export function applyControls(
  p: { layout: ButtonLayout; side: ShieldSide },
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
