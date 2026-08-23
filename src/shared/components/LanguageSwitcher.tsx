import type { MouseEvent } from 'react';
import { SUPPORTED_LANGUAGES, type Language, persistLanguagePreference } from '../lib/language.ts';
import { buildLanguageSwitchPath } from '../lib/routes.ts';
import { useLanguage } from '../i18n/useLanguage.ts';

const LABELS: Record<Language, string> = { en: 'EN', vi: 'VI' };

/**
 * Rendered as two plain links rather than a second dropdown — the nav bar has exactly one dropdown
 * ("All PDF Tools") by design.
 *
 * Switching language is a REAL page navigation, not an in-memory locale swap (SPEC.md §4): the
 * crawlable per-language document genuinely differs, and once a prerender step exists the served
 * HTML for /vi/ will not be the same file as for /. `persistLanguagePreference()` is called first
 * and is the only writer of the stored preference — it means "the user chose this", which is why
 * nothing in the detection chain writes it.
 */
export function LanguageSwitcher() {
  const active = useLanguage();

  function switchTo(event: MouseEvent<HTMLAnchorElement>, lang: Language) {
    event.preventDefault();
    if (lang === active) return;
    persistLanguagePreference(lang);
    window.location.assign(buildLanguageSwitchPath(lang));
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-stone-100 p-0.5 text-xs font-bold">
      {SUPPORTED_LANGUAGES.map((lang) => {
        const isActive = lang === active;
        return (
          <a
            key={lang}
            href={buildLanguageSwitchPath(lang)}
            hrefLang={lang}
            aria-current={isActive ? 'true' : undefined}
            onClick={(event) => switchTo(event, lang)}
            className={`rounded-md px-2.5 py-1.5 transition ${
              isActive ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {LABELS[lang]}
          </a>
        );
      })}
    </div>
  );
}
