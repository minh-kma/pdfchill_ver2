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

export interface PageMeta {
  readonly title: string;
  readonly description: string;
  /** Value for <html lang>. The raw active language, which may be a region tag ('vi-VN'). */
  readonly htmlLang: string;
  readonly canonical: string;
  readonly alternates: readonly AlternateLink[];
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
 * Resolves a route to its complete set of SEO tags.
 *
 * Homepage vs tool page is the only branch: a tool takes its copy from its own namespace via the
 * registry's `seoTitleKey`/`seoDescriptionKey`, the homepage from `home:`.
 */
export function buildPageMeta({ route, language, origin, t }: PageMetaInput): PageMeta {
  const isTool = route.kind === 'tool';
  const titleKey = isTool ? route.tool.seoTitleKey : 'home:seoTitle';
  const descriptionKey = isTool ? route.tool.seoDescriptionKey : 'home:seoDescription';
  const slug = isTool ? route.tool.slug : undefined;

  const resolved = toSupportedLanguage(language) ?? DEFAULT_LANGUAGE;

  const alternates: AlternateLink[] = SUPPORTED_LANGUAGES.map((alternate) => ({
    hreflang: alternate,
    href: origin + buildPath(slug, alternate),
  }));
  // x-default points at English, which lives at the unprefixed root (SPEC.md §4).
  alternates.push({ hreflang: 'x-default', href: origin + buildPath(slug, DEFAULT_LANGUAGE) });

  return {
    title: t(titleKey),
    description: t(descriptionKey),
    htmlLang: language,
    canonical: origin + buildPath(slug, resolved),
    alternates,
  };
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
