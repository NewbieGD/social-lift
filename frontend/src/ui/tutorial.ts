// Guided tutorial: a short script of big cards. Each card freezes the game, explains one thing
// and either waits for "ОК" or for the player to press the highlighted light button.
// The platforms of every lesson (3 yellow, 3 blue, 3 green, 3 red) are placed by the script.

import { gameConfig, type LightId } from '../core/gameConfig';
import type { Sim } from '../core/sim';
import { ru } from '../i18n/ru';

type Phase = 'controls' | 'yellowRun' | 'yellowCatch' | 'blueCatch' | 'greenCatch' | 'redRun' | 'redDone' | 'finished';

const TOTAL_STEPS = 6;

interface Card {
  step: number;
  title: string;
  html: string;
  /** Wait for this light button instead of "ОК". */
  press?: LightId;
  onPress?: () => void;
  onOk?: () => void;
}

export interface TutorialHost {
  sim: () => Sim;
  isTouch: boolean;
  keyLabel: (light: LightId) => string;
  /** Glows the given light button (null removes the glow). */
  highlight: (light: LightId | null) => void;
  /** The last card was confirmed. */
  finish: () => void;
}

const COLOR_NAME: Record<LightId, string> = {
  yellow: 'жёлтую',
  blue: 'синюю',
  green: 'зелёную',
  red: 'красную',
};

/** Colored platforms that are still waiting to be caught. */
function left(sim: Sim): number {
  let n = 0;
  for (const p of sim.platforms) if (p.kind === 'color') n++;
  return n;
}

export class Tutorial {
  phase: Phase = 'controls';
  private card: Card | null = null;

  constructor(
    private el: HTMLElement,
    private host: TutorialHost,
  ) {}

  /** True while a card is open: the game is frozen. */
  get frozen(): boolean {
    return this.card !== null;
  }

  begin(): void {
    this.phase = 'controls';
    this.close();
    const t = ru.tutorial;
    const keys = this.host.isTouch
      ? `<div class="tut-visual" aria-hidden="true"><span class="tut-swipe">◀ ☝ ▶</span></div><p>${t.controlsTouch}</p>`
      : `<div class="tut-visual" aria-hidden="true"><kbd>A</kbd><kbd>D</kbd><span class="tut-or">или</span><kbd>←</kbd><kbd>→</kbd></div><p>${t.controlsKeys}</p>`;
    this.show({
      step: 1,
      title: t.controlsTitle,
      html: `${keys}<p class="tut-next">${t.controlsNext}</p>`,
      onOk: () => {
        this.host.sim().tutorialSpawn('yellow');
        this.phase = 'yellowRun';
      },
    });
  }

  /** Hides the card (leaving the tutorial, pause to menu). */
  stop(): void {
    this.close();
  }

  /** The light the player has to press next, if a card is waiting for it. */
  get waitingFor(): LightId | null {
    return this.card?.press ?? null;
  }

  /** A queued light press while frozen. True if it is the awaited one (it stays queued for the game). */
  acceptPress(light: LightId): boolean {
    const card = this.card;
    if (!card || card.press !== light) return false;
    this.close();
    card.onPress?.();
    return true;
  }

  /** The "ОК" button of a card. */
  ok(): void {
    const card = this.card;
    if (!card || card.press) return;
    this.close();
    card.onOk?.();
  }

  /** Called after every simulation step while no card is open. */
  tick(): void {
    if (this.card) return;
    const sim = this.host.sim();
    switch (this.phase) {
      case 'yellowRun':
        for (const e of sim.events) {
          if (e.type !== 'land') continue;
          const p = sim.platforms.find((pl) => pl.id === e.id);
          if (p && p.kind === 'color' && p.color === 'yellow') {
            this.yellowCard();
            return;
          }
        }
        break;
      // A lesson is over when every colored platform of the set has been caught, in any order.
      case 'yellowCatch':
        if (left(sim) === 0) this.lightCard('blue');
        break;
      case 'blueCatch':
        if (left(sim) === 0) this.lightCard('green');
        break;
      case 'greenCatch':
        if (left(sim) === 0) this.lightCard('red');
        break;
      case 'redRun':
        if (sim.events.some((e) => e.type === 'aura')) this.redDoneCard();
        break;
      default:
        break;
    }
  }

  /** Short line under the HUD while the player is playing a lesson. */
  hint(): string {
    if (this.card) return '';
    const sim = this.host.sim();
    const t = ru.tutorial;
    const caught = 3 - Math.min(3, left(sim));
    const need = (light: LightId, name: string): string =>
      sim.light !== light ? t.hintPress(COLOR_NAME[light]) : t.hintCatch(name, caught);
    switch (this.phase) {
      case 'yellowRun':
        return t.hintYellowRun;
      case 'yellowCatch':
        return need('yellow', t.yellowPlural);
      case 'blueCatch':
        return need('blue', t.bluePlural);
      case 'greenCatch':
        return need('green', t.greenPlural);
      case 'redRun':
        return sim.light !== 'red' ? t.hintPress(COLOR_NAME.red) : t.hintRed;
      default:
        return '';
    }
  }

  // ---------- cards ----------

  private keyNote(light: LightId): string {
    return this.host.isTouch ? '' : ` (${ru.tutorial.key} ${this.host.keyLabel(light)})`;
  }

  private yellowCard(): void {
    const t = ru.tutorial;
    const sim = this.host.sim();
    sim.tutorialAllow('yellow');
    this.show({
      step: 2,
      title: t.yellowTitle,
      html: `<p>${t.yellowText(this.keyNote('yellow'))}</p>`,
      press: 'yellow',
      onPress: () => (this.phase = 'yellowCatch'),
    });
  }

  private lightCard(light: 'blue' | 'green' | 'red'): void {
    const t = ru.tutorial;
    const sim = this.host.sim();
    sim.tutorialAllow(light);
    const pts = light === 'red' ? 0 : gameConfig.colors[light].points;
    const spec: Record<'blue' | 'green' | 'red', { step: number; title: string; text: string; next: Phase }> = {
      blue: { step: 3, title: t.blueTitle, text: t.blueText(pts, this.keyNote('blue')), next: 'blueCatch' },
      green: { step: 4, title: t.greenTitle, text: t.greenText(pts, this.keyNote('green')), next: 'greenCatch' },
      red: { step: 5, title: t.redTitle, text: t.redText(this.keyNote('red')), next: 'redRun' },
    };
    const s = spec[light];
    this.show({
      step: s.step,
      title: s.title,
      html: `<p>${s.text}</p>`,
      press: light,
      onPress: () => {
        sim.tutorialSpawn(light);
        this.phase = s.next;
      },
    });
  }

  private redDoneCard(): void {
    const t = ru.tutorial;
    this.phase = 'redDone';
    this.show({
      step: 6,
      title: t.redDoneTitle,
      html: `<p>${t.redDoneText}</p>`,
      onOk: () => {
        this.phase = 'finished';
        this.host.finish();
      },
    });
  }

  // ---------- rendering ----------

  private show(card: Card): void {
    this.card = card;
    const t = ru.tutorial;
    this.el.innerHTML = `<div class="tut-card${card.press ? ' press' : ''}" role="dialog" aria-live="polite">
      <div class="tut-head"><span class="tut-badge">${t.badge}</span><span class="tut-step">${t.step(card.step, TOTAL_STEPS)}</span></div>
      <h3>${card.title}</h3>
      ${card.html}
      ${
        card.press
          ? `<div class="tut-press"><span class="tut-arrow" aria-hidden="true">▼</span>${t.pressNote}</div>`
          : `<button class="primary tut-ok" data-action="tutOk">${t.ok}</button>`
      }
    </div>`;
    this.el.classList.add('on');
    this.host.highlight(card.press ?? null);
  }

  private close(): void {
    this.card = null;
    this.el.classList.remove('on');
    this.host.highlight(null);
  }
}
