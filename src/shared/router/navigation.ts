/**
 * Minimal history integration for the in-app router.
 *
 * All URL *interpretation* lives in shared/lib/routes.ts; this file only pushes and observes.
 */

const NAVIGATION_EVENT = 'pdfchill:navigation';

export function subscribeToLocation(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATION_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATION_EVENT, onChange);
  };
}

export function getLocationSnapshot(): string {
  return window.location.pathname;
}

/**
 * Snapshot used when there is no live `window` — i.e. a prerender/SSG pass, which renders one
 * known URL per output file. Returning that URL here (rather than a hardcoded '/') is what lets a
 * future prerender step emit real per-route HTML through the same router.
 */
export function getServerLocationSnapshot(): string {
  return typeof location === 'undefined' ? '/' : location.pathname;
}

/** Client-side navigation. Language changes never come through here — see LanguageSwitcher. */
export function navigate(path: string, options?: { replace?: boolean }): void {
  if (path === window.location.pathname) return;
  if (options?.replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  window.scrollTo({ top: 0 });
}
