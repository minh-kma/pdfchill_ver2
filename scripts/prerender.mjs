/**
 * Build-time prerender + sitemap generation. Runs as `postbuild`, over `dist/`.
 *
 * WHY THIS EXISTS
 * PDFChill is a client-side SPA with one index.html, so a crawler that does not run JS sees the
 * placeholder <head> for every URL. SPEC.md §4 requires a real <title>/<meta description>/canonical/
 * hreflang set per (tool × language). This emits one static HTML file per route carrying those tags.
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

function renderHtml(template, meta) {
  let html = template;

  html = html.replace(/<html([^>]*)\slang="[^"]*"/i, '<html$1').replace(/<html([^>]*)>/i, `<html$1 lang="${escapeHtml(meta.htmlLang)}">`);


  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);

  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
  );

  const links = [
    `    <link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    ...meta.alternates.map(
      (alternate) =>
        `    <link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" />`,
    ),
  ].join('\n');

  return html.replace(/([ \t]*)<\/head>/i, `${links}\n$1</head>`);
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
  if (!html.includes(`rel="canonical" href="${escapeHtml(meta.canonical)}"`)) problems.push('canonical not applied');
  for (const alternate of meta.alternates) {
    if (!html.includes(`hreflang="${escapeHtml(alternate.hreflang)}"`)) {
      problems.push(`hreflang ${alternate.hreflang} missing`);
    }
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

/** `/vi/merge-pdf/` -> `dist/vi/merge-pdf/index.html`; `/` -> `dist/index.html`. */
function outputPathFor(routePath) {
  const relative = routePath.replace(/^\/+/, '').replace(/\/+$/, '');
  return relative ? join(distDir, relative, 'index.html') : join(distDir, 'index.html');
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
    const { parseLocation } = await server.ssrLoadModule('/src/shared/lib/routes.ts');
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

    await writeFile(join(distDir, 'sitemap.xml'), renderSitemap(sitemapEntries), 'utf8');

    console.log(
      `\nprerender: ${inventory.length} HTML files (${TOOLS.length} tools + homepage) x 2 languages` +
        `, sitemap.xml with ${sitemapEntries.length} URLs, origin ${SITE_ORIGIN}`,
    );
  } finally {
    await server.close();
  }
}

await main();
