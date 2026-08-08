/**
 * Language detection: path -> localStorage -> navigator -> English (SPEC.md §4).
 *
 * The path signal comes from `parseLocation()` — the same parser the router uses. There is
 * deliberately no second URL inspection here; that disagreement is the bug class SPEC.md §2 calls
 * out. This module is React-free so it can run at module-init time.
 *
 * Note there is no write path anywhere in detection: detecting a language must never be recorded
 * as if the user had chosen it. Only LanguageSwitcher calls `persistLanguagePreference()`.
 */

import {
  DEFAULT_LANGUAGE,
  detectNavigatorLanguage,
  type Language,
  readStoredLanguage,
} from '../lib/language.ts';
import { parseLocation } from '../lib/routes.ts';

export function detectLanguage(): Language {
  return (
    parseLocation().lang ?? readStoredLanguage() ?? detectNavigatorLanguage() ?? DEFAULT_LANGUAGE
  );
}
