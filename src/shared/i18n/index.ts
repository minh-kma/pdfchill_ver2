/**
 * i18n bootstrap.
 *
 * Namespaces are discovered from the locale files themselves (`locales/{lng}/{namespace}.json`),
 * so adding a tool's namespace requires no wiring here — drop in `locales/en/<id>.json` and
 * `locales/vi/<id>.json` and it is loaded. Per SPEC.md's pattern, each tool owns exactly one
 * namespace named after its registry id; `common`, `nav` and `home` are the shared chrome ones.
 *
 * No i18next-browser-languagedetector plugin: detection is our own ordered chain
 * (detectLanguage.ts), which shares the app's single path parser and — unlike the plugin's
 * `caches` behaviour — structurally cannot write a detected language back to storage
 * (SPEC.md §2). Language is fixed for the lifetime of the page: the switcher does a real
 * navigation (SPEC.md §4), so nothing calls `changeLanguage()` at runtime.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../lib/language.ts';
import { detectLanguage } from './detectLanguage.ts';

type Bundle = Record<string, unknown>;

const modules = import.meta.glob<Bundle>('./locales/*/*.json', { eager: true, import: 'default' });

const resources: Record<string, Record<string, Bundle>> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((lang) => [lang, {}]),
);

for (const [path, bundle] of Object.entries(modules)) {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, lang, namespace] = match as unknown as [string, string, string];
  const target = resources[lang];
  if (!target) continue; // A locale folder for an unsupported language — ignore rather than crash.
  target[namespace] = bundle;
}

const namespaces = Object.keys(resources[DEFAULT_LANGUAGE] ?? {}).sort();

void i18n.use(initReactI18next).init({
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  resources,
  ns: namespaces,
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes.
  returnNull: false,
});

export default i18n;
