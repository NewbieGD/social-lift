import { gameConfig, type LightId } from '../core/gameConfig';

export type SteerMode = 'drag' | 'zones';

/** Keys that always steer the hero and cannot be used for the light buttons. */
export const STEER_CODES = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];

/** Default bindings; the player can change the four main ones in the settings. */
export const DEFAULT_KEYS: Record<LightId, string> = {
  yellow: 'Digit1',
  blue: 'Digit2',
  green: 'Digit3',
  red: 'Space',
};

/** Extra keys that keep working while they are not taken by a custom binding. */
const ALIASES: Record<string, LightId> = {
  Numpad1: 'yellow',
  Numpad2: 'blue',
  Numpad3: 'green',
  Numpad4: 'red',
  Digit4: 'red',
};

/** Human readable name of a key for the buttons and the settings ("Digit1" -> "1"). */
export function keyLabel(code: string): string {
  if (code === 'Space') return 'Пробел';
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (code === 'ShiftLeft') return 'Shift';
  if (code === 'ShiftRight') return 'Shift (правый)';
  if (code === 'ControlLeft') return 'Ctrl';
  if (code === 'ControlRight') return 'Ctrl (правый)';
  if (code === 'AltLeft') return 'Alt';
  if (code === 'AltRight') return 'Alt (правый)';
  if (code === 'Tab') return 'Tab';
  if (code === 'Enter') return 'Enter';
  if (code === 'Backspace') return 'Backspace';
  if (code === 'CapsLock') return 'Caps Lock';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (/^F\d{1,2}$/.test(code)) return code;
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * Collects player intent. Steering comes from keyboard or from a pointer on the
 * play field; light buttons are separate DOM elements, so multitouch works:
 * one finger steers while another presses colors.
 *
 * Touch screens use touch events for steering: webviews (like the VK app) love to take
 * a quick swipe for themselves and cancel pointer events, so the hero used to move only
 * after the finger had been held down for a moment. Touch events with preventDefault
 * keep every swipe in the game. Mouse and pen still use pointer events.
 */
export class InputController {
  mode: SteerMode = 'drag';
  sensitivity = gameConfig.input.dragSensitivity;

  private keys = new Set<string>();
  private pendingPress: LightId | null = null;
  private bindings = new Map<string, LightId>();

  private steerPointer: number | null = null;
  private steerTouch: number | null = null;
  private dragStartPx = 0;
  private dragStartHeroX = 0;
  private dragTargetX: number | null = null;
  private zoneDir = 0;

  /** Pixels per world unit, updated on resize. */
  scale = 1;

  private steerSurface: HTMLElement | null = null;

  constructor(surfaces: HTMLElement[]) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.reset());
    this.setBindings(DEFAULT_KEYS);
    for (const el of surfaces) this.addSurface(el);
  }

  /** Any element that should accept steering drags (play field, side pad). */
  addSurface(el: HTMLElement): void {
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd, { passive: false });
    el.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
  }

  /** Replaces the keyboard bindings of the light buttons. */
  setBindings(keys: Record<LightId, string>): void {
    this.bindings.clear();
    for (const [code, light] of Object.entries(ALIASES)) this.bindings.set(code, light);
    // Custom keys win over the built-in aliases when they collide.
    for (const [light, code] of Object.entries(keys) as [LightId, string][]) this.bindings.set(code, light);
  }

  /** Called by light buttons and keyboard shortcuts. */
  press(light: LightId): void {
    this.pendingPress = light;
  }

  /** The queued press, without consuming it (the tutorial looks at it while the game is frozen). */
  peekPress(): LightId | null {
    return this.pendingPress;
  }

  /** Returns the steering axis for the current tick. */
  axis(heroX: number): number {
    const kb = (this.keyDown('right') ? 1 : 0) - (this.keyDown('left') ? 1 : 0);
    if (kb !== 0) return kb;
    if (this.mode === 'zones') return this.zoneDir;
    if (this.dragTargetX === null) return 0;
    const diff = this.dragTargetX - heroX;
    const dead = gameConfig.input.dragDeadband;
    return Math.max(-1, Math.min(1, diff / dead));
  }

  /** Consumes the light press queued since the last tick. */
  takePress(): LightId | null {
    const p = this.pendingPress;
    this.pendingPress = null;
    return p;
  }

  /** Hero x is needed when a drag starts (relative steering). */
  heroXProvider: () => number = () => 0;

  reset(): void {
    this.keys.clear();
    this.steerPointer = null;
    this.steerTouch = null;
    this.dragTargetX = null;
    this.zoneDir = 0;
    this.pendingPress = null;
  }

  private keyDown(dir: 'left' | 'right'): boolean {
    return dir === 'left'
      ? this.keys.has('KeyA') || this.keys.has('ArrowLeft')
      : this.keys.has('KeyD') || this.keys.has('ArrowRight');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Typing in a text field (the chat) must not trigger lights or steering, or eat digits, spaces and A/D.
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    const light = this.bindings.get(e.code);
    if (light) {
      if (!e.repeat) this.press(light);
      e.preventDefault();
      return;
    }
    if (STEER_CODES.includes(e.code)) {
      this.keys.add(e.code);
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  // ----- shared steering logic -----

  private beginSteer(clientX: number, el: HTMLElement): void {
    this.steerSurface = el;
    if (this.mode === 'zones') {
      const rect = el.getBoundingClientRect();
      this.zoneDir = clientX < rect.left + rect.width / 2 ? -1 : 1;
    } else {
      this.dragStartPx = clientX;
      this.dragStartHeroX = this.heroXProvider();
      this.dragTargetX = this.dragStartHeroX;
    }
  }

  private moveSteer(clientX: number, fallback: HTMLElement): void {
    if (this.mode === 'zones') {
      const rect = (this.steerSurface ?? fallback).getBoundingClientRect();
      this.zoneDir = clientX < rect.left + rect.width / 2 ? -1 : 1;
      return;
    }
    const dxWorld = ((clientX - this.dragStartPx) / this.scale) * this.sensitivity;
    const W = gameConfig.world.width;
    const target = Math.max(0, Math.min(W, this.dragStartHeroX + dxWorld));
    this.dragTargetX = target;
    // Re-anchor when the finger pushes past the field edge so dragging back responds at once.
    if (target === 0 || target === W) {
      this.dragStartPx = clientX;
      this.dragStartHeroX = target;
    }
  }

  private endSteer(): void {
    this.steerSurface = null;
    this.dragTargetX = null;
    this.zoneDir = 0;
  }

  // ----- mouse and pen -----

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return; // touch steers through touch events
    // Buttons on the field (pause, skip, floating shield) handle their own taps.
    if ((e.target as HTMLElement).closest('button')) return;
    if (this.steerPointer !== null) return;
    this.steerPointer = e.pointerId;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    this.beginSteer(e.clientX, el);
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || e.pointerId !== this.steerPointer) return;
    this.moveSteer(e.clientX, e.currentTarget as HTMLElement);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || e.pointerId !== this.steerPointer) return;
    this.steerPointer = null;
    this.endSteer();
  };

  // ----- touch -----

  private findTouch(list: TouchList): Touch | null {
    if (this.steerTouch === null) return null;
    for (let i = 0; i < list.length; i++) if (list[i].identifier === this.steerTouch) return list[i];
    return null;
  }

  private onTouchStart = (e: TouchEvent): void => {
    // Taps on buttons are handled by the buttons; everything else on the field steers.
    const t0 = e.changedTouches[0];
    if (!t0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    // Keep the webview from taking this touch for scrolling, swiping back or pull-to-refresh.
    if (e.cancelable) e.preventDefault();
    if (this.steerTouch !== null) return;
    this.steerTouch = t0.identifier;
    this.beginSteer(t0.clientX, e.currentTarget as HTMLElement);
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (e.cancelable) e.preventDefault();
    const t = this.findTouch(e.changedTouches);
    if (t) this.moveSteer(t.clientX, e.currentTarget as HTMLElement);
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (e.cancelable && !(e.target as HTMLElement).closest('button')) e.preventDefault();
    if (!this.findTouch(e.changedTouches)) return;
    this.steerTouch = null;
    this.endSteer();
  };
}
