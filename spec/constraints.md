**Purpose.** This document is the sole source of truth for a ground-up rewrite of PDFChill
(pdfchill.online) in a new, separate repository. It was produced by reading the entire current
source tree (`src/`, config files, static HTML entry points, `public/`), the full git history
(49 commits), and the project's own internal design-decision log (`decisions.md`, since
consolidated/removed from the working tree but recovered from `git show HEAD:.claude/docs/decisions.md`).
Every behavioral claim below was verified directly against the current source, not assumed from
comments or prior documentation. File/function citations use the current path layout so the
rewrite team can diff against the old repo if a rule seems surprising — no other file needs to be
consulted to resolve an ambiguity in this document.

**What PDFChill is.** A 100%-in-browser PDF toolkit: no backend, no accounts, no file byte ever
sent over the network. React 18 + TypeScript + Vite, styled with Tailwind, all PDF editing done
with `pdf-lib`, all rendering-only work done with `pdf.js`, encryption/decryption and one lossless
compression stage done with `qpdf` compiled to WebAssembly, OCR done with `tesseract.js`. There is
no test suite in the current repo (no test framework is even installed) — every behavior described
below was verified by reading the implementation, not by running assertions.

---

## 5. Constraints That Must Never Change

- **No backend, ever.** Every read/edit/encrypt/OCR operation runs in the visitor's browser. No
  file byte is transmitted over the network under any circumstance. The **only** three sanctioned
  network calls in the entire app, none of which ever carry user file content: (1) Tesseract's
  per-language `.traineddata` model files, fetched from Tesseract's default CDN on first OCR use
  in a given language; (2) the Google Fonts (Nunito) stylesheet/font files; (3) the Google AdSense
  and Adsterra ad-network scripts. Everything else — pdf.js's worker, qpdf's wasm, Tesseract's own
  worker/core scripts — is bundled and served same-origin via Vite `?url` imports specifically so
  the app keeps functioning offline after first load.
- **100% free.** No paywall, no feature gating, no account system, no usage limits, no server costs
  that would require introducing a charge.
- **Never auto-download.** Every tool's result goes through `PreviewModal` for the user to review
  before a download action is taken; no code path saves a file without that step.
- **Compress can never hand back a file bigger than what the user effectively started with** (the
  three-tier floor in §2) — a quality loss is a trade the user explicitly opts into via the level
  picker; a size *increase* is never acceptable at any level.
- **Routes, the routed-tool set, and deploy config are load-bearing for SEO and the live deploy**:
  `routes.ts`'s `ROUTED_TOOLS`, `vite.config.ts`'s entry list, `netlify.toml`, and
  `wrangler.jsonc` must not be changed incidentally — they must always agree with each other and
  with `public/sitemap.xml`.
- **Storage keys must not be renamed without an explicit migration.** `pdfdemo:session:v2`
  (IndexedDB) and `pdfdemo:lang` (localStorage) are both legacy names (predating the product's
  rename from "PDFdemo" to "PDFChill") but renaming either would silently drop every existing
  visitor's in-progress session or language preference on the next deploy.
- **Errors shown to users are always translated, never a raw `Error.message`.** Logic-layer
  modules throw plain English `Error`s (or typed subclasses) as developer diagnostics only; the UI
  boundary always maps them to a translated string via `t()`, matched either generically or by
  error class.
