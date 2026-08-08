/**
 * THE path parser. There is exactly one in this codebase and this is it.
 *
 * SPEC.md §2 ("Routing / i18n") and §4: the old app had the router and the i18n language detector
 * each parsing `location.pathname` independently, and they drifted out of agreement about what a
 * given URL meant — a real, shipped bug class. Both consumers here go through `parseLocation()`:
 *
 *   - the router            -> shared/router/useRoute.ts
 *   - the language detector -> shared/i18n/detectLanguage.ts
 *
 * Do NOT add a second `pathname.split('/')` anywhere. If you need something new out of a URL, add
 * a field to `ParsedLocation`.
 *
 * Dependency-free on purpose (no React import): the language detector calls this at module-init
 * time, before React exists.
 *
 * URL shape (SPEC.md §4):
 *   /                    -> English homepage
 *   /vi/                 -> Vietnamese homepage
 *   /{slug}/             -> English tool page
 *   /vi/{slug}/          -> Vietnamese tool page
 * A deploy base path (Vite's `base`) may prefix all of the above.
 */

import { DEFAULT_LANGUAGE, type Language, toSupportedLanguage } from './language.ts';

/** Non-default languages are the only ones that appear in a URL; English lives at the root. */
const PREFIXED_LANGUAGES: readonly Language[] = ['vi'];

export interface ParsedLocation {
  /** Deploy base path, always leading+trailing slashed, e.g. '/' or '/app/'. */
  readonly basePath: string;
  /**
   * Positive-only language signal: 'vi' for a /vi/... path, `undefined` everywhere else.
   *
   * Deliberately NOT 'en' on the root path (SPEC.md §4). The root must fall through to the
   * localStorage -> navigator chain rather than the path asserting "this visitor wants English";
   * asserting it would make the root path override a real Vietnamese preference.
   */
  readonly lang: Language | undefined;
  /** Tool slug candidate, or undefined for a homepage URL. Not validated against the registry — */
  /** the router resolves it (unknown slug -> not found), so this file stays registry-independent. */
  readonly slug: string | undefined;
}

/** Vite's configured `base`, normalized to a leading+trailing-slashed path. */
function currentBasePath(): string {
  // Optional-chained so this module stays importable outside a Vite runtime (node smoke tests,
  // and a future prerender step) — keeping it the single parser everywhere, not just in the browser.
  const raw = import.meta.env?.BASE_URL || '/';
  // `base: './'` (relative) carries no path information; treat it as root.
  if (raw === './' || raw === '.') return '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * Parses a pathname into { basePath, lang, slug }.
 *
 * Strips the deploy base path from the front, then reads an optional language segment followed by
 * an optional tool slug. Trailing slashes are irrelevant; casing is not (slugs are lowercase).
 */
export function parseLocation(pathname?: string): ParsedLocation {
  const basePath = currentBasePath();
  const raw = pathname ?? (typeof location === 'undefined' ? '/' : location.pathname);

  const withoutBase = raw.startsWith(basePath) ? raw.slice(basePath.length) : raw.replace(/^\//, '');
  const segments = withoutBase.split('/').filter((segment) => segment.length > 0);

  let index = 0;
  const maybeLang = toSupportedLanguage(segments[index]);
  const lang = maybeLang && PREFIXED_LANGUAGES.includes(maybeLang) ? maybeLang : undefined;
  if (lang) index += 1;

  const slug = segments[index];

  return { basePath, lang, slug: slug ?? undefined };
}

/**
 * Builds a path for a (slug, language) pair. The inverse of `parseLocation` and the only way a
 * URL string should ever be constructed — nothing else in the app concatenates path segments.
 *
 * @param slug tool slug, or undefined/null for the homepage.
 */
export function buildPath(slug: string | undefined | null, lang: Language): string {
  const langSegment = PREFIXED_LANGUAGES.includes(lang) ? `${lang}/` : '';
  const slugSegment = slug ? `${slug}/` : '';
  return `${currentBasePath()}${langSegment}${slugSegment}`;
}

/** Convenience for the language switcher: the current URL, re-expressed in another language. */
export function buildLanguageSwitchPath(lang: Language): string {
  return buildPath(parseLocation().slug, lang);
}

export { DEFAULT_LANGUAGE, type Language };
