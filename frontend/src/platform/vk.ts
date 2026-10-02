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

export function initVk(handlers: { onHide: () => void; onRestore?: () => void }): void {
  if (!isInVk()) return;
  bridge.subscribe((event) => {
    const type = (event.detail as { type?: string } | undefined)?.type;
    if (type === 'VKWebAppViewHide') handlers.onHide();
    if (type === 'VKWebAppViewRestore') handlers.onRestore?.();
  });
  bridge.send('VKWebAppInit').catch(() => {
    /* The game still works; the server rejects unsigned calls anyway. */
  });
}
