import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../lib/language.ts';
import { buildPath } from '../lib/routes.ts';
import type { Route } from '../router/useRoute.ts';

/**
 * Owns every per-page SEO tag: <title>, <meta name="description">, <html lang>, canonical, and
 * the three hreflang alternates (en / vi / x-default -> English), per SPEC.md §4.
 *
 * The copy comes from the same per-tool i18n namespace the UI renders from, so a tool's title and
 * description exist in exactly one place. The old app authored them twice — once in each static
 * HTML <head> and again in seo.json — with nothing keeping them in sync; that drift shipped a real
 * production bug and is SPEC.md §7 pain point #2. When a prerender/SSG step is added, it must
 * render these tags from these same keys rather than reintroducing hand-written <head> copy.
 */
export function useDocumentMeta(route: Route): void {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  useEffect(() => {
    const isTool = route.kind === 'tool';
    const titleKey = isTool ? route.tool.seoTitleKey : 'home:seoTitle';
    const descriptionKey = isTool ? route.tool.seoDescriptionKey : 'home:seoDescription';
    const slug = isTool ? route.tool.slug : undefined;

    document.title = t(titleKey);
    upsertMeta('description', t(descriptionKey));
    document.documentElement.lang = language;

    const origin = window.location.origin;
    upsertLink('canonical', undefined, origin + buildPath(slug, resolveLanguage(language)));
    for (const alternate of SUPPORTED_LANGUAGES) {
      upsertLink('alternate', alternate, origin + buildPath(slug, alternate));
    }
    upsertLink('alternate', 'x-default', origin + buildPath(slug, DEFAULT_LANGUAGE));
  }, [route, t, language]);
}

function resolveLanguage(raw: string) {
  return SUPPORTED_LANGUAGES.find((lang) => lang === raw.toLowerCase().split('-')[0]) ?? DEFAULT_LANGUAGE;
}

function upsertMeta(name: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = name;
    document.head.append(tag);
  }
  tag.content = content;
}

function upsertLink(rel: string, hreflang: string | undefined, href: string): void {
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
  let tag = document.head.querySelector<HTMLLinkElement>(selector);
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = rel;
    if (hreflang) tag.hreflang = hreflang;
    document.head.append(tag);
  }
  tag.href = href;
}
