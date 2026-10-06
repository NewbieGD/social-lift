// Full screen for the whole game: the browser Fullscreen API (desktop browsers, Android, iPad).
// iPhone Safari and the VK mobile app do not allow it for web pages; there the VK app draws its own
// bars, so we only ask VK to expand the window (best effort) and tell the player when nothing works.
import bridge from '@vkontakte/vk-bridge';
import { isInVk } from './vk';

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

/** True if the browser can really go full screen. */
export function fullscreenSupported(): boolean {
  const el = document.documentElement as FsEl;
  return !!(document.fullscreenEnabled || el.webkitRequestFullscreen);
}

/** Toggles full screen. Returns false if nothing could be done on this device. */
export async function toggleFullscreen(): Promise<boolean> {
  const d = document as FsDoc;
  const el = document.documentElement as FsEl;
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
      return true;
    }
    if (isInVk()) {
      // The VK app may expand its window; ignored where unknown.
      try {
        const send = bridge.send as unknown as (m: string) => Promise<unknown>;
        void send.call(bridge, 'VKWebAppExpand').catch(() => undefined);
      } catch {
        /* ignore */
      }
    }
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
      return true;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    /* refused by the browser */
  }
  return false;
}

/** Calls back when the page enters or leaves full screen (also on Esc). */
export function onFullscreenChange(cb: (on: boolean) => void): void {
  const fire = (): void => cb(isFullscreen());
  document.addEventListener('fullscreenchange', fire);
  document.addEventListener('webkitfullscreenchange', fire);
}
