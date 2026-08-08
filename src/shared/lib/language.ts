/**
 * Language primitives. Dependency-free on purpose (no React, no i18next): the i18n layer has to
 * call into this at module-init time, before React exists. See SPEC.md §4.
 */

export const SUPPORTED_LANGUAGES = ['en', 'vi'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'en';

/**
 * Legacy storage key, deliberately kept from the old app (SPEC.md §5): renaming it would silently
 * drop every existing visitor's language preference on the first deploy of this rewrite.
 * It lives in localStorage (not the session store) so it survives "Start over".
 */
export const LANGUAGE_STORAGE_KEY = 'pdfdemo:lang';

/**
 * Normalizes anything language-shaped ('vi', 'vi-VN', 'VI') to a supported language, or undefined.
 *
 * Every comparison against the supported set must go through this. A raw `=== 'vi'` against a full
 * region tag was a real shipped bug (SPEC.md §2): the switcher's active-language badge showed the
 * wrong value and the English option appeared inert for Vietnamese-locale visitors.
 */
export function toSupportedLanguage(raw: string | null | undefined): Language | undefined {
  if (!raw) return undefined;
  const base = raw.toLowerCase().split('-')[0];
  return SUPPORTED_LANGUAGES.find((lang) => lang === base);
}

/** Reads the *explicitly chosen* language. Never inferred — see persistLanguagePreference. */
export function readStoredLanguage(): Language | undefined {
  try {
    return toSupportedLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    // Private-mode / disabled storage: treat as "no preference".
    return undefined;
  }
}

/**
 * The ONLY writer of the stored language preference, called by LanguageSwitcher immediately before
 * it navigates. The stored value means "the user explicitly chose this" — never "we detected this".
 *
 * SPEC.md §2: automatic detection-caching used to stamp 'vi' into storage merely because the
 * visitor loaded /vi/ or had a Vietnamese browser locale, which then permanently hid the English
 * option on the root path for them. That is why detection (shared/i18n/detectLanguage.ts) has no
 * write path at all.
 */
export function persistLanguagePreference(lang: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Preference is a nicety; failing to store it must never block navigation.
  }
}

/** Positive-only navigator signal, mirroring the path detector's contract. */
export function detectNavigatorLanguage(): Language | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const lang = toSupportedLanguage(candidate);
    if (lang) return lang;
  }
  return undefined;
}
