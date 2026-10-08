// Full screen for the whole game: the browser Fullscreen API (desktop browsers, Android, iPad).
// iPhone Safari and the VK mobile app do not allow it for web pages; there the VK app draws its own
// bars, so we only ask VK to expand the window (best effort) and tell the player when nothing works.
import { isNativeVkApp } from './vk';

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

/**
 * True if the browser can really go full screen. Inside the VK mobile apps it cannot: VK draws
 * its own bars around a mini app and gives no way to hide them, so the button is not shown there.
 */
export function fullscreenSupported(): boolean {
  if (isNativeVkApp()) return false;
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

/**
 * An ad cannot be shown over a page that is in full screen (VK draws it outside the game's frame,
 * behind the full-screen element). So the game leaves full screen before asking for an ad and
 * returns on the first tap or key press afterwards (the browser only allows entering full screen
 * from a user action). Returns the function that arranges the return.
 */
export async function leaveFullscreenForAd(): Promise<() => void> {
  if (!isFullscreen()) return () => undefined;
  await toggleFullscreen();
  await new Promise((r) => setTimeout(r, 300));
  return () => {
    const again = (): void => {
      window.removeEventListener('pointerdown', again, true);
      window.removeEventListener('pointerup', again, true);
      window.removeEventListener('keydown', again, true);
      if (!isFullscreen()) void toggleFullscreen();
    };
    window.addEventListener('pointerdown', again, true);
    window.addEventListener('pointerup', again, true);
    window.addEventListener('keydown', again, true);
  };
}

/** Calls back when the page enters or leaves full screen (also on Esc). */
export function onFullscreenChange(cb: (on: boolean) => void): void {
  const fire = (): void => cb(isFullscreen());
  document.addEventListener('fullscreenchange', fire);
  document.addEventListener('webkitfullscreenchange', fire);
}
