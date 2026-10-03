// Keeps swipes inside the game. Embedded webviews (the VK app) and mobile browsers take a quick
// swipe for page scroll, "back" navigation or pull-to-refresh; the game must keep every touch.

/** Real visible height of the page (toolbars of embedded browsers come and go). */
function syncHeight(): void {
  document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
}

export function lockGestures(): void {
  syncHeight();
  window.addEventListener('resize', syncHeight);
  window.addEventListener('orientationchange', () => setTimeout(syncHeight, 250));

  // Only menus may scroll; everything else (field, buttons, margins) swallows the gesture.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.screen')) e.preventDefault();
    },
    { passive: false },
  );
  // iOS pinch/zoom gestures and the long-press menu.
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(name, (e) => e.preventDefault());
  }
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}
