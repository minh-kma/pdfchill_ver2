import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Route } from '../router/useRoute.ts';
import { buildPageMeta } from './pageMeta.ts';

/**
 * Owns every per-page SEO tag: <title>, <meta name="description">, <html lang>, canonical, and
 * the three hreflang alternates (en / vi / x-default -> English), per SPEC.md §4.
 *
 * The tags themselves are computed by `buildPageMeta()` in pageMeta.ts; this hook only applies them
 * to the live document. That split is deliberate: the build-time prerenderer
 * (`scripts/prerender.mjs`) calls the same function to emit the same tags into static HTML, so the
 * crawlable <head> and the runtime <head> cannot drift.
 *
 * The copy comes from the same per-tool i18n namespace the UI renders from, so a tool's title and
 * description exist in exactly one place. The old app authored them twice — once in each static
 * HTML <head> and again in seo.json — with nothing keeping them in sync; that drift shipped a real
 * production bug and is SPEC.md §7 pain point #2. Do not reintroduce hand-written <head> copy, in
 * the app or in a build script.
 */
export function useDocumentMeta(route: Route): void {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  useEffect(() => {
    const meta = buildPageMeta({
      route,
      language,
      origin: window.location.origin,
      t,
    });

    document.title = meta.title;
    upsertMeta('description', meta.description);
    document.documentElement.lang = meta.htmlLang;

    upsertLink('canonical', undefined, meta.canonical);
    for (const alternate of meta.alternates) {
      upsertLink('alternate', alternate.hreflang, alternate.href);
    }
  }, [route, t, language]);
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
