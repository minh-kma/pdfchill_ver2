import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Route } from '../router/useRoute.ts';
import { buildPageMeta } from './pageMeta.ts';

/**
 * Owns every per-page SEO tag: <title>, <meta name="description">, <html lang>, canonical, the
 * three hreflang alternates (en / vi / x-default -> English) per SPEC.md §4, the Open Graph and
 * Twitter Card tags, and `robots` on the not-found page.
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
    document.documentElement.lang = meta.htmlLang;

    // Cleared and rebuilt wholesale rather than updated in place. Some tags are *absent* on some
    // routes — the not-found page has no canonical, no hreflang and no `og:url`, and every other
    // page has no `robots` — so an update-only pass would leave the previous route's tags behind
    // after a client-side navigation. Removing first also means the tags the prerenderer already
    // put in the static <head> are replaced rather than duplicated, and `og:locale:alternate`,
    // which legitimately repeats, cannot accumulate.
    for (const stale of document.head.querySelectorAll(MANAGED_SELECTOR)) stale.remove();

    appendMeta('name', 'description', meta.description);
    if (meta.robots) appendMeta('name', 'robots', meta.robots);
    for (const tag of meta.social) appendMeta(tag.attribute, tag.key, tag.content);

    if (meta.canonical) appendLink('canonical', undefined, meta.canonical);
    for (const alternate of meta.alternates) {
      appendLink('alternate', alternate.hreflang, alternate.href);
    }
  }, [route, t, language]);
}

/**
 * Everything this hook owns. Deliberately narrow: the icon links and `theme-color` in index.html
 * do not vary by route, are not listed here, and must survive untouched.
 */
const MANAGED_SELECTOR = [
  'meta[name="description"]',
  'meta[name="robots"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
  'link[rel="canonical"]',
  'link[rel="alternate"][hreflang]',
].join(',');

function appendMeta(attribute: 'property' | 'name', key: string, content: string): void {
  const tag = document.createElement('meta');
  tag.setAttribute(attribute, key);
  tag.content = content;
  document.head.append(tag);
}

function appendLink(rel: string, hreflang: string | undefined, href: string): void {
  const tag = document.createElement('link');
  tag.rel = rel;
  if (hreflang) tag.hreflang = hreflang;
  tag.href = href;
  document.head.append(tag);
}
