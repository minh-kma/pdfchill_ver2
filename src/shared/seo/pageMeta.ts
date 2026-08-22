/**
 * THE per-page SEO tag computation. Pure, React-free, DOM-free.
 *
 * Two consumers, and that is the whole point of this file existing:
 *   - runtime  -> shared/seo/useDocumentMeta.ts  (applies the result to document.head)
 *   - build    -> scripts/prerender.mjs          (serialises the result into static HTML)
 *
 * SPEC.md §7 pain point #2: the old app authored each page's <title>/<meta description> twice —
 * once in a static HTML <head>, once in seo.json — with nothing checking the two agreed. That drift
 * shipped a production bug. A prerender step is exactly the situation that would reintroduce it, so
 * the mapping from "a route" to "its tags" lives here once and both paths call it. If you are about
 * to write a tool's title or description anywhere else, including in a build script, that is the
 * bug.
 *
 * The copy itself is never inlined here either: this returns i18n *keys* resolved through the
 * caller's `t`, against the same per-tool namespace the UI renders from.
 */

import { DEFAULT_LANGUAGE, type Language, SUPPORTED_LANGUAGES, toSupportedLanguage } from '../lib/language.ts';
import { buildPath } from '../lib/routes.ts';
import type { Route } from '../router/useRoute.ts';

/** A `t()`-shaped lookup. Kept structural so the prerenderer can pass i18next's `getFixedT`. */
export type Translate = (key: string) => string;

export interface AlternateLink {
  /** 'en' | 'vi' | 'x-default' */
  readonly hreflang: string;
  readonly href: string;
}

/** One `<meta>` tag. Open Graph keys are `property`; Twitter and `robots` are `name`. */
export interface MetaTag {
  readonly attribute: 'property' | 'name';
  readonly key: string;
  readonly content: string;
}

export interface PageMeta {
  readonly title: string;
  readonly description: string;
  /** Value for <html lang>. The raw active language, which may be a region tag ('vi-VN'). */
  readonly htmlLang: string;
  /**
   * `undefined` on the not-found page, and only there. A canonical on an error page tells a
   * crawler the URL is a real, indexable page — the soft-404 signal we are trying not to send.
   */
  readonly canonical: string | undefined;
  /**
   * `<meta name="robots">` content, or `undefined` to emit no robots tag at all. Set only for the
   * not-found page. Absent means "index, follow", which is the default and needs no tag.
   */
  readonly robots: string | undefined;
  /** Empty on the not-found page: hreflang alternates there would advertise URLs that also 404. */
  readonly alternates: readonly AlternateLink[];
  /** Open Graph + Twitter Card tags, ready to serialise. See `socialTags()`. */
  readonly social: readonly MetaTag[];
}

export interface PageMetaInput {
  readonly route: Route;
  /**
   * The active language as the app reports it — `i18n.language` at runtime, which can be a full
   * region tag. Normalised internally; never compared with `===` (SPEC.md §2).
   */
  readonly language: string;
  /** Absolute origin, no trailing slash — `window.location.origin` at runtime. */
  readonly origin: string;
  readonly t: Translate;
}

/**
 * The share card image, generated from `images/logo.png` into `public/og-image.png` at the
 * 1200x630 both Facebook and Twitter want. Absolute because both crawlers reject a relative
 * `og:image`, and built off `buildPath()` so a sub-path deploy still resolves it.
 */
const OG_IMAGE_PATH = 'og-image.png';

/** Open Graph wants a full locale, not a bare language code. */
const OG_LOCALES: Record<Language, string> = { en: 'en_US', vi: 'vi_VN' };

/**
 * Open Graph + Twitter Card tags for a page.
 *
 * These deliberately reuse the page's own `title`/`description` rather than introducing a second
 * set of share-specific copy: a third place to author per-tool text is exactly the drift this
 * module exists to prevent (SPEC.md §7 pain point #2). `og:url` follows the canonical, so the
 * not-found page — which has no canonical — gets no `og:url` either.
 */
function socialTags(
  meta: Pick<PageMeta, 'title' | 'description' | 'canonical'>,
  resolved: Language,
  origin: string,
  t: Translate,
): readonly MetaTag[] {
  const image = origin + buildPath(undefined, DEFAULT_LANGUAGE) + OG_IMAGE_PATH;

  const tags: MetaTag[] = [
    { attribute: 'property', key: 'og:type', content: 'website' },
    { attribute: 'property', key: 'og:site_name', content: t('common:appName') },
    { attribute: 'property', key: 'og:title', content: meta.title },
    { attribute: 'property', key: 'og:description', content: meta.description },
    { attribute: 'property', key: 'og:image', content: image },
    { attribute: 'property', key: 'og:image:width', content: '1200' },
    { attribute: 'property', key: 'og:image:height', content: '630' },
    { attribute: 'property', key: 'og:image:alt', content: t('common:appName') },
    { attribute: 'property', key: 'og:locale', content: OG_LOCALES[resolved] },
  ];

  for (const alternate of SUPPORTED_LANGUAGES) {
    if (alternate === resolved) continue;
    tags.push({ attribute: 'property', key: 'og:locale:alternate', content: OG_LOCALES[alternate] });
  }

  if (meta.canonical) {
    tags.push({ attribute: 'property', key: 'og:url', content: meta.canonical });
  }

  tags.push(
    { attribute: 'name', key: 'twitter:card', content: 'summary_large_image' },
    { attribute: 'name', key: 'twitter:title', content: meta.title },
    { attribute: 'name', key: 'twitter:description', content: meta.description },
    { attribute: 'name', key: 'twitter:image', content: image },
    { attribute: 'name', key: 'twitter:image:alt', content: t('common:appName') },
  );

  return tags;
}

/**
 * Resolves a route to its complete set of SEO tags.
 *
 * Three branches, one per route kind. A tool takes its copy from its own namespace via the
 * registry's `seoTitleKey`/`seoDescriptionKey`; the homepage from `home:`; the not-found page from
 * the same `common:notFound.*` keys `NotFoundPage.tsx` renders — so the tab title and the heading
 * on screen cannot disagree.
 *
 * The not-found page is the one route that is not a real, indexable URL, and its tags say so:
 * `noindex`, no canonical, no hreflang. Everything downstream — this hook at runtime, the
 * prerenderer at build time — reads those three from here rather than deciding for itself.
 */
export function buildPageMeta({ route, language, origin, t }: PageMetaInput): PageMeta {
  const isTool = route.kind === 'tool';
  const isNotFound = route.kind === 'notFound';

  const titleKey = isTool
    ? route.tool.seoTitleKey
    : isNotFound
      ? 'common:notFound.title'
      : 'home:seoTitle';
  const descriptionKey = isTool
    ? route.tool.seoDescriptionKey
    : isNotFound
      ? 'common:notFound.body'
      : 'home:seoDescription';
  const slug = isTool ? route.tool.slug : undefined;

  const resolved = toSupportedLanguage(language) ?? DEFAULT_LANGUAGE;

  const alternates: AlternateLink[] = [];
  if (!isNotFound) {
    for (const alternate of SUPPORTED_LANGUAGES) {
      alternates.push({ hreflang: alternate, href: origin + buildPath(slug, alternate) });
    }
    // x-default points at English, which lives at the unprefixed root (SPEC.md §4).
    alternates.push({ hreflang: 'x-default', href: origin + buildPath(slug, DEFAULT_LANGUAGE) });
  }

  const base = {
    title: t(titleKey),
    description: t(descriptionKey),
    htmlLang: language,
    canonical: isNotFound ? undefined : origin + buildPath(slug, resolved),
    // Reachable at /404.html directly, so keep it out of the index even though every route that
    // actually serves it answers with a 404 status.
    robots: isNotFound ? 'noindex' : undefined,
  };

  return { ...base, alternates, social: socialTags(base, resolved, origin, t) };
}

/**
 * The URL inventory a prerender pass must emit: every (tool × language) plus the homepage in each
 * language. Derived from the registry and `buildPath()`, so a new registry row automatically gets a
 * prerendered page and a sitemap entry with no second list to update.
 *
 * `tools` is passed in rather than imported so this module stays free of the registry's React
 * component imports — the caller hands it `TOOLS`.
 */
export function routeInventory(
  tools: readonly { readonly slug: string }[],
): readonly { readonly path: string; readonly language: Language; readonly slug: string | undefined }[] {
  const entries: { path: string; language: Language; slug: string | undefined }[] = [];
  for (const language of SUPPORTED_LANGUAGES) {
    entries.push({ path: buildPath(undefined, language), language, slug: undefined });
    for (const tool of tools) {
      entries.push({ path: buildPath(tool.slug, language), language, slug: tool.slug });
    }
  }
  return entries;
}
