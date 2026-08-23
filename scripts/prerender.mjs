/**
 * Build-time prerender + sitemap + robots.txt generation. Runs as `postbuild`, over `dist/`.
 *
 * WHY THIS EXISTS
 * PDFChill is a client-side SPA with one index.html, so a crawler that does not run JS sees the
 * placeholder <head> for every URL. SPEC.md §4 requires a real <title>/<meta description>/canonical/
 * hreflang set per (tool × language). This emits one static HTML file per route carrying those tags.
 *
 * IT ALSO EMITS THE TWO ORIGIN-DEPENDENT FILES
 * `sitemap.xml` and `robots.txt` both need the absolute site origin, and `404.html` is what makes
 * an unknown URL reach the SPA at all on a static host (see emitNotFoundPages). All three are
 * generated here rather than hand-written into `public/` for the same reason the <head> tags are:
 * SITE_ORIGIN below is the single place the domain is written down. A checked-in robots.txt would
 * be a second copy of it that no build step can keep honest.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not server-render the app body. `src/main.tsx` mounts with `createRoot().render()`, not
 * `hydrateRoot()`, so shipping server markup would require changing how the live app boots — and the
 * body is browser-coupled throughout (canvas, the pdf.js worker, File APIs, dnd-kit). Crawlers need
 * the <head>; that is what this generates. Every emitted file keeps the exact same <div id="root">
 * and the one shared JS/CSS bundle, so the page still boots into the full interactive SPA.
 *
 * SINGLE SOURCE OF TRUTH (SPEC.md §7 pain point #2)
 * No SEO copy is authored here. Every tag comes from `buildPageMeta()` in src/shared/seo/pageMeta.ts
 * — the same function `useDocumentMeta` calls at runtime — resolved against the app's own i18next
 * instance. The URL inventory comes from `routeInventory()` over the live registry, so adding a
 * registry row adds a prerendered page and a sitemap entry with nothing to remember.
 *
 * Route resolution goes through the app's real pipeline: `getServerLocationSnapshot()` (which exists
 * for exactly this) -> `parseLocation()` -> `findToolBySlug()`. There is no second route matcher.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(projectRoot, 'dist');

/**
 * Absolute origin for canonical/hreflang/sitemap URLs. At runtime the app uses
 * `window.location.origin`; a static file has no such thing, so it must be configured.
 */
const SITE_ORIGIN = (process.env.PDFCHILL_SITE_ORIGIN || 'https://pdfchill.online').replace(/\/+$/, '');

/** Minimal HTML escaping for text nodes and double-quoted attribute values. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Points the app's `location`-reading code at the URL currently being rendered. This is what
 * `getServerLocationSnapshot()` was built to consume — see shared/router/navigation.ts.
 */
function setLocation(pathname) {
  Object.defineProperty(globalThis, 'location', {
    value: { pathname, origin: SITE_ORIGIN, href: SITE_ORIGIN + pathname },
    configurable: true,
    writable: true,
  });
}

/**
 * Rewrites the built index.html's <head> for one route, leaving everything else — crucially the
 * emitted <script type="module"> and stylesheet tags — untouched, so all routes share one bundle.
 */
/**
 * Strips HTML comments from the template before anything is rewritten.
 *
 * Not cosmetic — this is load-bearing. index.html's <head> comment *documents* the SEO tags and so
 * contains the literal text `<title>` and `<meta name="description">`. A `<title>…</title>` replace
 * against the raw template matches from inside that comment through to the real closing tag,
 * eating the comment's `-->` and leaving the whole <head> inside an unterminated comment — every
 * page silently loses its metadata, which is worse than the placeholder it replaced. Removing
 * comments first makes the tag replacements unambiguous, and the shipped bytes are smaller.
 */
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->\s*/g, '');
}

/**
 * Serialises one `PageMeta` into the template's <head>.
 *
 * Which tags a page gets is decided by `buildPageMeta()`, never here — a 404 arrives with
 * `canonical: undefined`, `robots: 'noindex'` and no alternates, and this just writes out what it
 * is handed. Keeping the decision there is what stops the static <head> and the runtime <head>
 * disagreeing about the same URL.
 */
function renderHtml(template, meta) {
  let html = template;

  html = html.replace(/<html([^>]*)\slang="[^"]*"/i, '<html$1').replace(/<html([^>]*)>/i, `<html$1 lang="${escapeHtml(meta.htmlLang)}">`);


  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);

  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
  );

  const headLines = [];
  if (meta.robots) headLines.push(`    <meta name="robots" content="${escapeHtml(meta.robots)}" />`);
  for (const tag of meta.social) {
    headLines.push(
      `    <meta ${tag.attribute}="${escapeHtml(tag.key)}" content="${escapeHtml(tag.content)}" />`,
    );
  }
  if (meta.canonical) headLines.push(`    <link rel="canonical" href="${escapeHtml(meta.canonical)}" />`);
  for (const alternate of meta.alternates) {
    headLines.push(
      `    <link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" />`,
    );
  }

  if (headLines.length === 0) return html;
  return html.replace(/([ \t]*)<\/head>/i, `${headLines.join('\n')}\n$1</head>`);
}

/**
 * Fails the build if a generated page is not actually crawlable.
 *
 * A regex-templated <head> fails *silently* — it emits a plausible-looking file whose metadata a
 * crawler never sees. That already happened once here (see stripComments), so every page is checked
 * rather than trusted: correct tags, no unbalanced comment, and the real bundle still referenced.
 */
function assertWellFormed(html, meta, routePath) {
  const problems = [];

  const openComments = (html.match(/<!--/g) || []).length;
  const closeComments = (html.match(/-->/g) || []).length;
  if (openComments !== closeComments) {
    problems.push(`unbalanced HTML comments (${openComments} "<!--" vs ${closeComments} "-->")`);
  }

  if (!html.includes(`<title>${escapeHtml(meta.title)}</title>`)) problems.push('title not applied');
  if (!html.includes(`content="${escapeHtml(meta.description)}"`)) problems.push('description not applied');
  if (!html.includes(`lang="${escapeHtml(meta.htmlLang)}"`)) problems.push('<html lang> not applied');
  if (meta.canonical) {
    if (!html.includes(`rel="canonical" href="${escapeHtml(meta.canonical)}"`)) problems.push('canonical not applied');
  } else if (/rel="canonical"/.test(html)) {
    problems.push('404 page must not carry a canonical link');
  }
  if (meta.robots && !html.includes(`<meta name="robots" content="${escapeHtml(meta.robots)}" />`)) {
    problems.push('robots meta not applied');
  }
  for (const alternate of meta.alternates) {
    if (!html.includes(`hreflang="${escapeHtml(alternate.hreflang)}"`)) {
      problems.push(`hreflang ${alternate.hreflang} missing`);
    }
  }
  for (const tag of meta.social) {
    if (!html.includes(`${tag.attribute}="${escapeHtml(tag.key)}" content="${escapeHtml(tag.content)}"`)) {
      problems.push(`${tag.key} not applied`);
    }
  }
  // The share card and the icons are separate files rather than tags, so a missing one would not
  // show up in any check above — and a broken og:image is invisible until someone shares a link.
  for (const [label, pattern] of [
    ['og:image', /property="og:image" content="[^"]+"/],
    ['icon link', /<link[^>]+rel="icon"/i],
  ]) {
    if (!pattern.test(html)) problems.push(`${label} missing`);
  }
  // Requirement: one shared bundle, still loaded by every prerendered page.
  if (!/<script[^>]+type="module"[^>]+src="[^"]+\.js"/.test(html)) problems.push('module bundle script missing');
  if (!html.includes('<div id="root">')) problems.push('#root mount point missing');

  if (problems.length > 0) {
    throw new Error(`prerender produced an invalid page for ${routePath}:\n  - ${problems.join('\n  - ')}`);
  }
}

function renderSitemap(entries) {
  const urls = entries
    .map((entry) => {
      const alternates = entry.alternates
        .filter((alternate) => alternate.hreflang !== 'x-default')
        .map(
          (alternate) =>
            `    <xhtml:link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" />`,
        )
        .join('\n');
      return `  <url>\n    <loc>${escapeHtml(entry.canonical)}</loc>\n${alternates}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

/**
 * robots.txt. Exists mainly to point crawlers at the sitemap — which is why it is generated:
 * the `Sitemap:` line needs the absolute origin, and SITE_ORIGIN above is the only place that
 * is written down. Everything is crawlable; there is no private area to exclude.
 */
function renderRobotsTxt() {
  return ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE_ORIGIN}/sitemap.xml`, ''].join('\n');
}

/**
 * site.webmanifest — what Android uses for a home-screen install, pointing at the icons
 * `scripts/generateIcons.mjs` produced.
 *
 * Generated for the same reason robots.txt is: `start_url` is origin-relative, and the name and
 * description would otherwise be a hand-typed second copy of `common:appName` and
 * `home:seoDescription`. Resolved in the default language only — a manifest is a single static
 * file with no per-language variant, and the app is at the unprefixed root in English.
 */
function renderWebManifest(t) {
  return `${JSON.stringify(
    {
      name: t('common:appName'),
      short_name: t('common:appName'),
      description: t('home:seoDescription'),
      start_url: '/',
      scope: '/',
      display: 'standalone',
      // Both track --color-canvas in src/index.css (oklch(95% 0.012 52)). The manifest
      // cannot read a CSS variable, so this is the one place the page background is
      // duplicated as a literal — change it here whenever that token changes.
      background_color: '#f5ece7',
      theme_color: '#f5ece7',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        // `purpose: maskable` lets Android crop to its own shape without clipping the artwork.
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  )}\n`;
}

/** `/vi/merge-pdf/` -> `dist/vi/merge-pdf/index.html`; `/` -> `dist/index.html`. */
function outputPathFor(routePath, fileName = 'index.html') {
  const relative = routePath.replace(/^\/+/, '').replace(/\/+$/, '');
  return relative ? join(distDir, relative, fileName) : join(distDir, fileName);
}

/**
 * Emits `dist/404.html` and `dist/vi/404.html` — the only way NotFoundPage.tsx is reachable in
 * production.
 *
 * Every one of the 24 known routes is a real file on disk, so those resolve without any host
 * routing config. An *unknown* URL matches no file, and a static host does not fall back to the
 * SPA shell on its own: Cloudflare's default `not_found_handling` ("none") answers a null-body
 * 404, so the app never boots and the user sees a blank page instead of NotFoundPage. Setting
 * `not_found_handling: "404-page"` in wrangler.jsonc makes the host serve the nearest 404.html —
 * walking up from the requested path — with a 404 status. These files are that target: the same
 * shell and the same bundle as every other page, so the SPA boots, `useRoute()` resolves the
 * unknown slug to `{ kind: 'notFound' }`, and NotFoundPage renders. The status stays a real 404.
 *
 * One per language because the lookup walks up the directory tree: `/vi/nonsense/` finds
 * `dist/vi/404.html`, and `parseLocation` reads 'vi' off that same path, so the static <head> and
 * the booted app agree on the language. Anything outside /vi/ falls through to `dist/404.html`.
 *
 * Nothing about these pages' tags is decided here. `buildPageMeta({ route: { kind: 'notFound' } })`
 * is the same call the running app makes for the same route, so the title, the `noindex`, and the
 * absence of a canonical come from one place and cannot drift — SPEC.md §7 pain point #2 again.
 * That matters more here than anywhere else: this file is served under every unknown URL, and the
 * app immediately re-derives its own <head> on top of the static one.
 */
async function emitNotFoundPages({ template, languages, buildPath, buildPageMeta, i18n }) {
  const emitted = [];

  for (const language of languages) {
    const meta = buildPageMeta({
      route: { kind: 'notFound', slug: '' },
      language,
      origin: SITE_ORIGIN,
      t: i18n.getFixedT(language),
    });

    const html = renderHtml(template, meta);
    const label = `${buildPath(undefined, language)} (404)`;
    assertWellFormed(html, meta, label);

    const outputPath = outputPathFor(buildPath(undefined, language), '404.html');
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, html, 'utf8');
    emitted.push(outputPath);
  }

  return emitted;
}

async function main() {
  // Read the built template ONCE, before anything is written — the English homepage overwrites
  // dist/index.html, and re-reading afterwards would template every later page off that output.
  const template = stripComments(await readFile(join(distDir, 'index.html'), 'utf8'));

  const server = await createServer({
    root: projectRoot,
    configFile: join(projectRoot, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  });

  try {
    // The app's own modules — not copies of them.
    setLocation('/');
    const { TOOLS, findToolBySlug } = await server.ssrLoadModule('/src/toolRegistry.ts');
    const { parseLocation, buildPath } = await server.ssrLoadModule('/src/shared/lib/routes.ts');
    const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } = await server.ssrLoadModule('/src/shared/lib/language.ts');
    const { getServerLocationSnapshot } = await server.ssrLoadModule('/src/shared/router/navigation.ts');
    const { buildPageMeta, routeInventory } = await server.ssrLoadModule('/src/shared/seo/pageMeta.ts');
    const i18n = (await server.ssrLoadModule('/src/shared/i18n/index.ts')).default;

    const inventory = routeInventory(TOOLS);
    const sitemapEntries = [];

    for (const entry of inventory) {
      // Drive the real router pipeline for this URL, exactly as useRoute does in the browser.
      setLocation(entry.path);
      const pathname = getServerLocationSnapshot();
      const { slug } = parseLocation(pathname);
      const tool = slug ? findToolBySlug(slug) : undefined;

      if (slug && !tool) {
        throw new Error(`Route inventory produced a slug the registry does not know: "${slug}"`);
      }
      const route = tool ? { kind: 'tool', tool } : { kind: 'home' };

      const meta = buildPageMeta({
        route,
        language: entry.language,
        origin: SITE_ORIGIN,
        // getFixedT pins the language without mutating the shared instance.
        t: i18n.getFixedT(entry.language),
      });

      const html = renderHtml(template, meta);
      assertWellFormed(html, meta, entry.path);

      const outputPath = outputPathFor(entry.path);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, html, 'utf8');

      sitemapEntries.push(meta);
      console.log(`  ${entry.path.padEnd(26)} -> ${outputPath.slice(distDir.length + 1)}`);
    }

    const notFoundPages = await emitNotFoundPages({
      template,
      languages: SUPPORTED_LANGUAGES,
      buildPath,
      buildPageMeta,
      i18n,
    });
    for (const outputPath of notFoundPages) {
      console.log(`  ${'(unmatched URL)'.padEnd(26)} -> ${outputPath.slice(distDir.length + 1)}`);
    }

    await writeFile(join(distDir, 'sitemap.xml'), renderSitemap(sitemapEntries), 'utf8');
    await writeFile(join(distDir, 'robots.txt'), renderRobotsTxt(), 'utf8');
    await writeFile(
      join(distDir, 'site.webmanifest'),
      renderWebManifest(i18n.getFixedT(DEFAULT_LANGUAGE)),
      'utf8',
    );

    console.log(
      `\nprerender: ${inventory.length} HTML files (${TOOLS.length} tools + homepage) x 2 languages` +
        `, ${notFoundPages.length} 404 pages, sitemap.xml with ${sitemapEntries.length} URLs` +
        `, robots.txt, site.webmanifest, origin ${SITE_ORIGIN}`,
    );
  } finally {
    await server.close();
  }
}

await main();
