// Thin wrapper around VK Bridge: init, launch params and visibility events.
import bridge from '@vkontakte/vk-bridge';

/** Raw launch query string (without "?"), forwarded to the server for signature checks. */
export function launchParamsRaw(): string {
  return window.location.search.replace(/^\?/, '');
}

/** True when the page was opened by VK with signed launch parameters. */
export function isInVk(): boolean {
  const q = new URLSearchParams(launchParamsRaw());
  return q.has('sign') && q.has('vk_user_id');
}

/** The platform VK reports at launch (mobile_android, mobile_iphone, mobile_web, desktop_web ...). */
export function vkPlatform(): string {
  return new URLSearchParams(launchParamsRaw()).get('vk_platform') ?? '';
}

/** On iPhone digital goods cannot be sold inside the app (Apple's rule), so purchases are hidden. */
export function isIOS(): boolean {
  return vkPlatform().startsWith('mobile_iphone');
}

/** Fire-and-forget bridge call: older clients may not know a method, which is fine. */
function quiet(method: string, params?: Record<string, unknown>): void {
  try {
    const send = bridge.send as unknown as (m: string, p?: Record<string, unknown>) => Promise<unknown>;
    void send.call(bridge, method, params).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/**
 * Asks the player to allow VK notifications (duel challenges reach them even when the game
 * is in the background). Only called after a tap; VK shows its own dialog. Resolves to true if allowed.
 */
export async function askNotifications(): Promise<boolean> {
  if (!isInVk()) return false;
  try {
    const r = (await bridge.send('VKWebAppAllowNotifications')) as { result?: boolean } | undefined;
    return r?.result !== false;
  } catch {
    return false;
  }
}

export function initVk(handlers: { onHide: () => void; onRestore?: () => void }): void {
  if (!isInVk()) return;
  bridge.subscribe((event: { detail?: { type?: string; data?: unknown } }) => {
    const type = (event.detail as { type?: string } | undefined)?.type;
    if (type === 'VKWebAppUpdateConfig') applyInsets((event.detail as { data?: unknown }).data);
    if (type === 'VKWebAppViewHide') handlers.onHide();
    if (type === 'VKWebAppViewRestore') handlers.onRestore?.();
  });
  bridge
    .send('VKWebAppInit')
    .then(() => {
      // The "swipe back" gesture of the VK app must not fire while the player steers by swiping.
      quiet('VKWebAppSetSwipeSettings', { history: false });
      // Dark bars that match the game instead of the light VK chrome.
      quiet('VKWebAppSetViewSettings', {
        status_bar_style: 'light',
        action_bar_color: '#151D23',
        navigation_bar_color: '#151D23',
      });
    })
    .catch(() => {
      /* The game still works; the server rejects unsigned calls anyway. */
    });
}

/** Safe areas reported by VK clients (rule 3.2.2), combined with the CSS env() values. */
function applyInsets(data: unknown): void {
  const insets = (data as { insets?: { top?: number; bottom?: number } } | undefined)?.insets;
  if (!insets) return;
  const root = document.documentElement.style;
  if (typeof insets.top === 'number') root.setProperty('--safe-top', `max(env(safe-area-inset-top, 0px), ${insets.top}px)`);
  if (typeof insets.bottom === 'number')
    root.setProperty('--safe-bottom', `max(env(safe-area-inset-bottom, 0px), ${insets.bottom}px)`);
  window.dispatchEvent(new Event('resize'));
}
