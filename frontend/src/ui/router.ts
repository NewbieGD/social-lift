// Screen stack: full-screen pages and modal cards rendered into #screens.
// Each entry is rendered from a view function, so going back re-renders fresh data.

export interface View {
  html: () => string;
  /** Called after the HTML is in the DOM (load data, focus, timers). */
  mount?: (root: HTMLElement) => void;
  /** Modal cards keep the game visible behind a dim layer. */
  modal?: boolean;
  /** Extra class for the screen element. */
  cls?: string;
}

export class Router {
  private stack: string[] = [];
  private views = new Map<string, View>();
  private current: HTMLElement | null = null;
  onChange: (top: string | null) => void = () => undefined;

  constructor(private host: HTMLElement) {}

  register(id: string, view: View): void {
    this.views.set(id, view);
  }

  get top(): string | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  has(id: string): boolean {
    return this.stack.includes(id);
  }

  /** Opens a screen on top of the current one. */
  open(id: string): void {
    this.stack.push(id);
    this.render();
  }

  /** Replaces the whole stack with one screen. */
  reset(id: string): void {
    this.stack = [id];
    this.render();
  }

  back(): void {
    this.stack.pop();
    this.render();
  }

  /** Closes everything: the game is visible. */
  clear(): void {
    this.stack = [];
    this.render();
  }

  /** Re-renders the current screen (after data changed). */
  refresh(): void {
    this.render(false);
  }

  private render(animate = true): void {
    const id = this.top;
    const old = this.current;
    const keepScroll = !animate && old ? old.querySelector('.scroll')?.scrollTop ?? 0 : 0;
    if (old) {
      if (animate) {
        old.classList.add('leaving');
        old.addEventListener('transitionend', () => old.remove(), { once: true });
        setTimeout(() => old.remove(), 400);
      } else old.remove();
    }
    this.current = null;
    if (id) {
      const view = this.views.get(id);
      if (!view) throw new Error(`Unknown screen ${id}`);
      const el = document.createElement('section');
      el.className = `screen${view.modal ? ' modal' : ''}${view.cls ? ` ${view.cls}` : ''}${animate ? ' entering' : ''}`;
      el.dataset.screen = id;
      el.innerHTML = view.html();
      this.host.appendChild(el);
      this.current = el;
      if (animate) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')));
      if (keepScroll) {
        const sc = el.querySelector('.scroll');
        if (sc) sc.scrollTop = keepScroll;
      }
      view.mount?.(el);
      // Stagger buttons and list rows for the entrance.
      el.querySelectorAll<HTMLElement>('.stagger > *').forEach((child, i) => {
        child.style.setProperty('--i', String(i));
      });
    }
    this.onChange(id);
  }
}
