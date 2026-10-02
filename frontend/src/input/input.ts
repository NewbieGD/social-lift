import { gameConfig, type LightId } from '../core/gameConfig';

export type SteerMode = 'drag' | 'zones';

/**
 * Collects player intent. Steering comes from keyboard or from a pointer on the
 * play field; light buttons are separate DOM elements, so multitouch works:
 * one finger steers while another presses colors.
 */
export class InputController {
  mode: SteerMode = 'drag';
  sensitivity = gameConfig.input.dragSensitivity;

  private keys = new Set<string>();
  private pendingPress: LightId | null = null;

  private steerPointer: number | null = null;
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
    for (const el of surfaces) this.addSurface(el);
  }

  /** Any element that should accept steering drags (play field, side pad). */
  addSurface(el: HTMLElement): void {
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
  }

  /** Called by light buttons and keyboard shortcuts. */
  press(light: LightId): void {
    this.pendingPress = light;
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
    const map: Record<string, LightId> = {
      Digit1: 'yellow',
      Numpad1: 'yellow',
      Digit2: 'blue',
      Numpad2: 'blue',
      Digit3: 'green',
      Numpad3: 'green',
      Digit4: 'red',
      Numpad4: 'red',
      Space: 'red',
    };
    if (map[e.code]) {
      if (!e.repeat) this.press(map[e.code]);
      e.preventDefault();
      return;
    }
    if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      this.keys.add(e.code);
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.steerPointer !== null) return;
    this.steerPointer = e.pointerId;
    const el = e.currentTarget as HTMLElement;
    this.steerSurface = el;
    el.setPointerCapture?.(e.pointerId);
    if (this.mode === 'zones') {
      const rect = el.getBoundingClientRect();
      this.zoneDir = e.clientX < rect.left + rect.width / 2 ? -1 : 1;
    } else {
      this.dragStartPx = e.clientX;
      this.dragStartHeroX = this.heroXProvider();
      this.dragTargetX = this.dragStartHeroX;
    }
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.steerPointer) return;
    if (this.mode === 'zones') {
      const rect = (this.steerSurface ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
      this.zoneDir = e.clientX < rect.left + rect.width / 2 ? -1 : 1;
      return;
    }
    const dxWorld = ((e.clientX - this.dragStartPx) / this.scale) * this.sensitivity;
    const W = gameConfig.world.width;
    const target = Math.max(0, Math.min(W, this.dragStartHeroX + dxWorld));
    this.dragTargetX = target;
    // Re-anchor when the finger pushes past the field edge so dragging back responds at once.
    if (target === 0 || target === W) {
      this.dragStartPx = e.clientX;
      this.dragStartHeroX = target;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.steerPointer) return;
    this.steerPointer = null;
    this.steerSurface = null;
    this.dragTargetX = null;
    this.zoneDir = 0;
  };
}
