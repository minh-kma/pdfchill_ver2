import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, type Language, toSupportedLanguage } from '../lib/language.ts';

/**
 * The active UI language, always narrowed to a supported one.
 *
 * `i18n.language` can be a full region tag ('vi-VN') that is not itself in SUPPORTED_LANGUAGES;
 * comparing it raw against 'en'/'vi' was a real shipped bug (SPEC.md §2). Nothing in the app
 * should read `i18n.language` directly — use this hook.
 */
export function useLanguage(): Language {
  const { i18n } = useTranslation();
  return toSupportedLanguage(i18n.language) ?? DEFAULT_LANGUAGE;
}
