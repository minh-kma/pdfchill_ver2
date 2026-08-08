## 4. Routing & SEO Rules

**4 of the 11 tools have a real URL; the other 7 are menu-only** and never touch the browser URL
at all. `ROUTED_TOOLS` (`shared/lib/routes.ts`) is the single source of truth for the mapping:

| Slug | Tool intent |
|---|---|
| `merge-pdf` | `merge` |
| `split-pdf` | `split` |
| `compress-pdf` | `compress` |
| `images-to-pdf` | `imagesToPdf` |

**Ten static HTML entry points**, all loading the identical `src/main.tsx` so Rollup emits exactly
one shared JS/CSS bundle (`vite.config.ts: build.rollupOptions.input`, ten explicit named entries):
the homepage in each language (`index.html`, `vi/index.html`) plus one page per routed tool in each
language (`{slug}/index.html`, `vi/{slug}/index.html`). **Adding a routed tool requires updating
all of the following in lockstep, with no automated check that they stay consistent:**
1. `ROUTED_TOOLS` in `routes.ts`.
2. Two new static HTML files (`vite.config.ts`'s `input` map must also list them by name).
3. Two new rows in `public/sitemap.xml`.
4. A `merge`/`split`/etc.-shaped entry in the `seo` i18n namespace (both `en` and `vi`) — used by
   the client-side `document.title` effect.
5. The `<head>` content of the two new HTML files, independently authored, must match #4 by hand.

**URL shape parsing is centralized in exactly one place**, `routes.ts: parseLocation()`/
`buildPath()` — deliberately dependency-free (no React import) since `shared/i18n/index.ts`'s
language detector needs to call it at module-init time, before React exists. Parsing strips
segments from the end of the path: an optional tool slug, then an optional `vi` segment; whatever
remains is treated as the deploy's base path (supports a subfolder deploy, since
`vite.config.ts` sets `base: './'`). **Do not write a second path parser anywhere** — see §2 for
the exact bug class this rule prevents.

**Every static HTML `<head>` carries, identically shaped:**
- `<html lang="en"|"vi">`.
- Favicon links (`.ico` + 16/32 PNG + apple-touch-icon), with a relative path depth hand-set per
  file (`./` at root, `../` one level deep, `../../` two levels deep — Vite does not rewrite
  `public/`-sourced asset paths, so this is manual and must be kept correct by whoever adds a new
  entry point).
- `<meta name="description">`, matching that page's `seo.json` entry.
- `<link rel="canonical">` pointing at itself.
- Exactly three `<link rel="alternate" hreflang="...">` tags: `en`, `vi`, and `x-default`
  (`x-default` always points at the English URL).
- A `<title>`, matching `seo.json`.
- One `application/ld+json` `WebApplication` schema block (tool pages additionally nest
  `isPartOf` pointing at the homepage, and add a second `BreadcrumbList` schema block; the
  homepage has neither).
- An identical, hardcoded Google AdSense verification `<script>` tag (see §7 — this one is *not*
  centralized like the Adsterra units are).

**Language detection order is `path → localStorage → navigator → English`**
(`shared/i18n/index.ts`). The path detector is a positive-only signal — it returns `'vi'` on a
`/vi/...` path and `undefined` (not `'en'`) everywhere else, so the *root* path always falls
through to the unchanged `localStorage → navigator` chain rather than the path detector ever
asserting "this is English." Automatic detector-result caching is disabled
(`detection.caches: []`); only `LanguageSwitcher.tsx`'s explicit click writes to
`localStorage['pdfdemo:lang']`, and it does so via a **real page navigation**
(`window.location.assign`, preserving the current tool segment) rather than an in-memory locale
swap — because the crawlable static `<head>` genuinely differs per language and there is no
client-side way to change which static file was served.
