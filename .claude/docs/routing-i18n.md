# Routing, i18n & SEO

These three share one module by design: `src/shared/lib/routes.ts` is the only code in the repo
that interprets a URL. Required behaviour: `spec/routing-seo.md`.

---

## 1. One path parser — `shared/lib/routes.ts`

The router and the i18n language detector both call `parseLocation()`. The old app parsed the path
independently in each, and they drifted about what a given URL meant — a real, shipped bug class
(`spec/edge-cases.md`, "Routing / i18n").

**Never write a second `pathname.split('/')`.** If you need something new out of a URL, add a field
to `ParsedLocation`.

```ts
interface ParsedLocation { basePath: string; lang: Language | undefined; slug: string | undefined }

parseLocation(pathname?): ParsedLocation
buildPath(slug: string | undefined | null, lang: Language): string
buildLanguageSwitchPath(lang: Language): string
```

`routes.ts` and `lib/language.ts` are deliberately **dependency-free** (no React, no i18next):
detection runs at module-init time, before React exists.

`lang` is a **positive-only** signal: `'vi'` for a `/vi/...` path, `undefined` everywhere else —
never `'en'`. The root path must fall through to the localStorage/navigator chain rather than
asserting "this visitor wants English" (`spec/routing-seo.md`).

`parseLocation` does not validate the slug against the registry; the router resolves it, which is
what keeps `routes.ts` registry-independent. The deploy base path comes from
`import.meta.env.BASE_URL` (set by `vite.config.ts`'s `base`), so a subfolder deploy needs one value
changed.

### URL scheme

| URL | Meaning |
|---|---|
| `/` | English homepage |
| `/vi/` | Vietnamese homepage |
| `/{slug}/` | English tool page |
| `/vi/{slug}/` | Vietnamese tool page |

English is the default and has no prefix; `/en/...` is not a route. Trailing slashes are optional
on input and always emitted by `buildPath()`. **`buildPath()` builds every URL** — nothing
concatenates path segments by hand.

---

## 2. Router — `shared/router/`, hand-rolled (~100 lines)

Not React Router. React Router brings its own matcher, which would be a second URL interpreter
sitting beside `parseLocation()` — the drift the spec forbids — and the language-prefix and
base-path stripping would have to be restated in its route patterns. The route space is 11 flat
routes plus a homepage: no nesting, no loaders, no params.

- `navigation.ts` — `pushState` + a custom event; `subscribeToLocation`, `getLocationSnapshot`, and
  `getServerLocationSnapshot` (reads `location.pathname` with no live `window`, for prerendering).
  No URL interpretation happens here.
- `useRoute.ts` — `useSyncExternalStore` over the above, then `parseLocation()` →
  `findToolBySlug()`. Returns `{ kind: 'home' | 'tool' | 'notFound' }`. **The routing table is the
  registry** — there is no route list anywhere.
- `Link.tsx` — a real `<a href>` that intercepts plain left-clicks. Middle-click, ctrl-click and
  "copy link address" behave normally, and crawlers see real hrefs.

`App.tsx` renders `route.tool.Component` directly, so adding a tool touches it zero times.

---

## 3. i18n — `shared/i18n/`

i18next + react-i18next, English and Vietnamese.

**One namespace per tool**, named after its registry id, plus chrome namespaces: `common` (app
name, category labels, footer, not-found), `nav`, `home`, `workspace`. Namespaces are discovered
from `locales/{lng}/*.json` filenames via `import.meta.glob` — there is no namespace list to
maintain. Keys are referenced as `merge:name`, `workspace:actions.undo`, etc.

**Detection order: path → localStorage → navigator → English** (`detectLanguage.ts`).

- **Detection never writes.** `persistLanguagePreference()` in `lib/language.ts` is the only writer
  of `localStorage['pdfdemo:lang']`, and only `LanguageSwitcher` calls it. The stored value means
  "the user explicitly chose this". In the old app, i18next's detector caching stamped `'vi'` into
  storage merely because someone loaded `/vi/` or had a Vietnamese browser locale, which then
  permanently hid the English option on the root path for them (`spec/edge-cases.md`). That is why
  we use our own chain rather than `i18next-browser-languagedetector` with `caches: []` — here
  there is structurally no write path to disable.
- The storage key `pdfdemo:lang` is a legacy name kept deliberately (`spec/constraints.md`):
  renaming it would drop every existing visitor's language preference on the first deploy.

**Never compare `i18n.language` directly against `'en'`/`'vi'`.** It can be a full region tag
(`'vi-VN'`); a raw `===` was a real shipped bug. Use `useLanguage()` (components) or
`toSupportedLanguage()` (everywhere else).

**Switching language is a real page navigation** (`window.location.assign`), preserving the current
tool slug — not an in-memory locale swap (`spec/routing-seo.md`). Language is therefore fixed for
the lifetime of a page load, and nothing calls `changeLanguage()` at runtime.

### Pluralisation gotcha

i18next keys carry a single `count`. A phrase with two independent counts cannot use plural
suffixes — resolve each count separately and compose. `workspace:header` does this:
`summary` = `"{{pages}} from {{files}}"`, with `pages_one/pages_other` and `files_one/files_other`
resolved first. Writing `summary_one`/`summary_other` and passing `{ pages, files }` renders the
raw key.

Copy is currently first-draft in both languages; translation review is a later step.

---

## 4. SEO — `shared/seo/useDocumentMeta.ts`

Owns `<title>`, `<meta name="description">`, `<html lang>`, `<link rel="canonical">` and the three
`hreflang` alternates (`en`, `vi`, `x-default`→English), driven off the current route's registry
entry.

The copy lives only in the tool's i18n namespace (`seoTitle`, `seoDescription`). `index.html`
deliberately carries no per-page copy. The old app authored each page's title and description twice
— in a static HTML `<head>` and again in `seo.json` — with no check that they agreed; that
duplication shipped a production bug and is `spec/maintainability.md` pain point #2.
**Do not reintroduce hand-written `<head>` copy.**

### Prerendering — `scripts/prerender.mjs` (built)

This is a client-side SPA with one `index.html`, so crawlers would get the placeholder head until JS
runs. A `postbuild` step therefore emits one static HTML file per URL: `routeInventory()` iterates
`TOOLS` × `SUPPORTED_LANGUAGES`, giving **24 files** (11 tools + homepage, × en/vi) plus
`sitemap.xml` from the same iteration.

The tag computation is **not duplicated** in the script. `buildPageMeta()` in `shared/seo/pageMeta.ts`
is the one function that maps a route to its tags; `useDocumentMeta` calls it at runtime and the
prerenderer calls it at build time, both resolving the same i18n keys through the app's own i18next
instance (`getFixedT(lang)`). That is the whole reason `pageMeta.ts` exists as a separate module —
a build script re-deriving "tool → seoTitleKey" is pain point #2 reappearing.

Route resolution reuses the real pipeline: the script assigns `globalThis.location`, then goes
`getServerLocationSnapshot()` → `parseLocation()` → `findToolBySlug()`. There is no second matcher.

Only the `<head>` is generated — the body stays `<div id="root">` and every file loads the same one
JS/CSS bundle, so the page still boots into the full SPA. The app is **not** server-rendered:
`main.tsx` uses `createRoot()`, not `hydrateRoot()`, and emitting server markup would mean changing
how the live app boots. Because the prerendered tags use the same selectors `useDocumentMeta`
queries, the runtime hook *updates* them in place rather than appending duplicates.

Absolute URLs need an origin a static file cannot know: `PDFCHILL_SITE_ORIGIN` env var, defaulting
to `https://pdfchill.online`. Set it if the deploy origin differs, or canonicals will point at the
wrong host.

Every generated page is asserted before it is written (tags applied, comments balanced, bundle and
`#root` still present) — a regex-templated `<head>` fails silently otherwise, which it did once
during development.
