# CLAUDE.md

Index and routing file. Deep detail lives in `.claude/docs/` — follow the links rather than
duplicating their content here.

## 1. Project Overview

PDFChill v2 is a from-scratch rewrite of pdfchill.online: a free PDF toolkit that runs entirely in
the browser — no backend, no accounts, no file byte ever leaving the device. It is a
registry-driven React SPA where `src/toolRegistry.ts` is the single source of truth per tool.
**All 11 tools are implemented**; `ComingSoonTool` is no longer referenced by the registry. Still
outstanding before launch: ad units. Prerendering + `sitemap.xml` / `robots.txt` /
`site.webmanifest` / the two `404.html` pages (`scripts/prerender.mjs`, run as `postbuild`) and
session autosave/recovery (`shared/state/persistence/`) are all built, as is the Cloudflare deploy
config (`wrangler.jsonc` + `public/_headers`). Accounts are
not a to-do — `spec/constraints.md` makes "no account system" permanent.
See [.claude/docs/tool-status.md](.claude/docs/tool-status.md).

## 2. Tech Stack

| Area | Choice |
|---|---|
| UI | React 19 + TypeScript 5.9 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| Build | Vite 7, `@vitejs/plugin-react` |
| Styling | Tailwind CSS 4 via `@tailwindcss/vite` (no `tailwind.config` file; `src/index.css` is the entry) |
| PDF assembly | `pdf-lib` 1.17 — the only thing that writes PDF bytes |
| PDF rendering | `pdfjs-dist` 6 — display only, never writes output |
| State | `immer` 11 + `useReducer` + context (no Redux/Zustand) |
| Drag & drop | `@dnd-kit/core` 6, `@dnd-kit/sortable` 10 |
| Zip | `jszip` 3 (Split output, and Image to PDF's separate-files mode) |
| Encryption / structure | `@jspawn/qpdf-wasm` 0.0.2 — via `shared/lib/qpdf.ts` only (Compress, Protect, Unlock) |
| OCR | `tesseract.js` 7 — recognition only; it never writes to a PDF |
| i18n | `i18next` 25 + `react-i18next` 16 — English + Vietnamese |
| Routing | Hand-rolled, ~100 lines. **No React Router** — see constraints below. |

`qpdf-wasm` and `tesseract.js` are installed and wired end-to-end. Both are dynamically imported,
so neither lands in the homepage bundle — see
[.claude/docs/pdf-pipeline.md](.claude/docs/pdf-pipeline.md).

## 3. Dev Commands

```bash
npm install          # Node ^20.19 || >=22.12 (Vite 7 requirement); developed on 24
npm run dev          # Vite dev server, http://localhost:5173
npm run build        # tsc -b && vite build  — typecheck + production build
npm run preview      # serve the built output
npm run typecheck    # tsc -b --noEmit
npm run icons        # regenerate public/ icons + og-image.png from images/logo.png (only when the logo changes)
npm run deploy       # wrangler deploy — runs the build first, per wrangler.jsonc
```

`dev` and `build` are both preceded by `scripts/copyTesseractAssets.mjs`, which populates the
gitignored `public/tesseract/`. A clean checkout has no OCR assets until one of those runs.

There is **no test framework installed.** `npm run build` is the gate — it typechecks the whole
project. Verify behaviour changes by exercising the real modules (the pipeline and reducer are pure
and can be driven from a Node script via Vite's `ssrLoadModule`).

## 4. Core Logic Summary

**Registry pattern:** `src/toolRegistry.ts` holds one row per tool (id, category, slug, icon,
component) and the routing table, nav dropdown, homepage grid/filters, i18n namespace and SEO
metadata are all *derived* from it — never hand-written a second time.

**Shared page pipeline:** Merge/Split/Reorder/Delete/Rotate are all edits to one page plan
(`SourceDoc[]` + `PageItem[]`) assembled by the single function `copyPagesToPdf()` in
`shared/lib/pdfCore.ts`, over one global undo-capable session store — so a user can merge, delete
pages, then rotate without re-uploading.

## 5. Key Constraints

Violating any of these silently breaks something. The full list is
[.claude/docs/architecture.md](.claude/docs/architecture.md) §4.

- **Never hand-duplicate tool info outside the registry.** Identity/category/slug/icon/component
  live in `toolRegistry.ts`; display and SEO copy live in that tool's locale files. Nowhere else.
  `grep -rn "merge-pdf" src/` must return exactly one line.
- **No backend, ever. No file byte leaves the device.** Every operation runs client-side. Do not
  add an upload, an analytics call carrying file data, or a CDN fetch for a worker — pdf.js's
  worker is a bundled `?url` import so the app works offline after first load. `public/_headers`
  enforces this at the edge: its `connect-src 'self'` turns a dependency that phones home into a
  blocked request instead of a silent leak. Deleting that file removes the guarantee.
- **tesseract.js must be handed all three of `workerPath`, `corePath` and `langPath`.** Leave any
  one unset and it silently falls back to cdn.jsdelivr.net for that asset — that is how the OCR
  tool shipped fetching its worker, its wasm core and a 3MB language model from a third party.
  `scripts/copyTesseractAssets.mjs` (a `predev`/`prebuild` step) puts them in `public/tesseract/`,
  and `ocrDocument.ts` pins `OEM.LSTM_ONLY` because the OEM decides which core *filename* the
  worker requests — change it there and that script's file list has to change with it.
- **One URL parser for routing *and* i18n.** `shared/lib/routes.ts` (`parseLocation`/`buildPath`)
  is the only code that interprets a URL. A second `pathname.split('/')` is the exact bug class
  that shipped in the old app. `routes.ts` and `lib/language.ts` stay React-free — detection runs
  at module-init.
- **`copyPagesToPdf()` is the only code that writes PDF bytes.** pdf.js never writes; pdf-lib never
  renders.
- **Rotation is additive**, never replacing: `source /Rotate + user rotation`, everywhere.
- **Deleting a page never drops its `SourceDoc`** — undo restores the bytes without re-reading the
  file. `sources` is append-only; only `RESET` empties it.
- **Nothing auto-downloads.** Every result goes through `PreviewModal` first. Split's zip is the
  one documented exception. Image to PDF's separate-files mode also produces a zip, but it is *not*
  an exception — it goes through `PreviewModal` (previewing the first PDF, downloading the whole
  zip via the modal's `onDownload`).
- **Users never see `err.message`.** Throw a typed error, map it with `toErrorKey()` /
  `toSecurityErrorKey()` to a translated string — and **always pass a context string**. Those
  mappers are the logging chokepoint: unrecognised errors go to `console.error` with the real
  object, recognised ones to `console.warn`. Never write a bare `catch {}` that shows a translated
  message; that is how four flows once failed with an empty console.
- **Only `LanguageSwitcher` writes the language preference** (`localStorage['pdfdemo:lang']` — a
  legacy key; renaming it drops every existing visitor's preference). Language detection is
  read-only. Never compare `i18n.language` with `===`; it can be `'vi-VN'`.
- **qpdf-wasm module instances are single-use.** `shared/lib/qpdf.ts`'s `runQpdf` is the only call
  site; it creates a fresh instance per invocation because `callMain()` calls Emscripten's
  `exit()`, which permanently kills that instance. Do not "optimise" this into one shared instance,
  and do not invoke qpdf anywhere else.
- **An encrypted upload is decrypted before it reaches the store.** Every upload path goes through
  `useUnlockGate`, so a `SourceDoc` always holds plaintext. The unlock password is memory-only,
  never persisted, cleared on Start Over.
- **`copyPagesToPdf` bakes document marks.** A watermark is a `DocAnnotation` on the page plan, not
  bytes produced by its own tool — that is what makes it survive a later merge/split/rotate. Never
  add a second page-drawing path.
- **Do not modify `spec/`.** It is the extracted behavioural spec, not implementation docs.

## 6. Additional Documentation

Implementation docs — how this codebase is built:

| File | Read it when |
|---|---|
| [.claude/docs/architecture.md](.claude/docs/architecture.md) | Adding or changing a tool; anything touching the registry, routing table, nav or homepage. Has the file map and the full invariant list. |
| [.claude/docs/pdf-pipeline.md](.claude/docs/pdf-pipeline.md) | Reading, assembling or writing PDF bytes; thumbnails; the shared workspace; download/preview rules. |
| [.claude/docs/state-and-undo.md](.claude/docs/state-and-undo.md) | Touching the store, the reducer, undo/redo, or keyboard shortcuts. |
| [.claude/docs/routing-i18n.md](.claude/docs/routing-i18n.md) | URLs, language detection, translation keys, `<title>`/meta tags. |
| [.claude/docs/tool-status.md](.claude/docs/tool-status.md) | Before assuming any tool works. Verified against the registry. |

Behaviour reference — what the product must *do*, extracted from the old production app.
**Read-only; never edit.** `SPEC.md` at the root is a 25-line index into it:

| File | Covers |
|---|---|
| [spec/features.md](spec/features.md) | Per-tool behaviour: entry points, settings, parsing rules, outputs |
| [spec/edge-cases.md](spec/edge-cases.md) | Every quirk and the bug that caused it — read before changing behaviour |
| [spec/data-model.md](spec/data-model.md) | Core shapes, page-plan model, what is undoable |
| [spec/routing-seo.md](spec/routing-seo.md) | URL scheme, language detection order, `<head>` requirements |
| [spec/constraints.md](spec/constraints.md) | What must never change |
| [spec/dead-code.md](spec/dead-code.md) | Old-app code that must **not** be carried forward |
| [spec/maintainability.md](spec/maintainability.md) | The old app's failure modes this rewrite exists to fix |

When implementing a placeholder tool, read its section in `spec/features.md` **and** every entry
naming it in `spec/edge-cases.md` before writing code.
