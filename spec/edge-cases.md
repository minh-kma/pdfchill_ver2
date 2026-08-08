## 2. Edge Cases and Quirks

Each item exists because of a specific past bug, browser limitation, or deliberate product
trade-off. Cite the file/function before changing anything in this list — several are the direct
fix for a regression that shipped once already.

### Compression pipeline
- **`imagesSupported` fallback.** `recompressImages.ts: canRecompressImages()` checks for
  `OffscreenCanvas.prototype.convertToBlob` and `createImageBitmap`. Both are missing on Safari
  <16.4. When false, `compressWorker.ts` skips the entire image-recompression phase and does a
  plain `PDFDocument.load()`+`save({useObjectStreams:true})` instead — the lossless structural
  pass (qpdf) **still runs** regardless, since it needs no canvas at all. The UI must check
  `result.imagesSupported` before concluding a small compression result is a bug.
- **Three independent "never bigger" floors, at three different layers — do not collapse them:**
  1. *Per-image* (`recompressImages.ts`): if a re-encoded image isn't smaller than its original
     stream, the original bytes are kept and the image doesn't count as "replaced."
  2. *Per-stage* (`compressWorker.ts`): qpdf's structural-pass output is discarded (falls back to
     the image-stage bytes) if it isn't smaller.
  3. *Per-document* (`CompressPanel.tsx: handleStart`): the final choice is
     `min(baseline, assembled, result.bytes)`. `baseline` is the **original uploaded file's raw
     bytes** if the current session is "pristine" (single source, untouched — no
     delete/rotate/reorder/merge, no watermark/page numbers), because `pdf-lib`'s re-assembly can
     duplicate shared resources (a font or image reused across pages) and actually *inflate* an
     untouched file; otherwise `baseline` is the freshly-assembled bytes.
- **Image screening (`recompressImages.ts: screen()`)** — an image XObject is only ever a
  recompression candidate if **all** of: it's `/Subtype /Image`; has no `/SMask`, `/Mask`, or
  `/ImageMask=true` (JPEG has no alpha channel — flattening a cut-out image onto white would
  visibly wreck it, at every level, not just gentle ones); is at least 64px on both sides and
  16KB; has a color space of DeviceGray, DeviceRGB, or 1/3-component ICCBased (Indexed/CMYK/
  Separation/DeviceN are skipped — color would shift); has exactly one filter, either `DCTDecode`
  (already a complete JPEG — decoded via the browser's own decoder) or one of
  `FlateDecode`/`LZWDecode`/`ASCII85Decode`/`ASCIIHexDecode` with 8-bit-per-component samples and
  no `/Decode` array. `JPXDecode` (JPEG 2000 — browsers can't decode it), `CCITTFaxDecode`, and
  `JBIG2Decode` (bitonal fax scans — already smaller than any JPEG re-encode) are always left
  alone. A filter *chain* (e.g. `[/ASCII85Decode /DCTDecode]`) is always skipped as "too fiddly."
- **DPI-cap estimate is deliberately approximate.** `mapImagesToPageWidths()` estimates an image's
  displayed resolution as "the width, in points, of the widest page that draws it" — pdf-lib gives
  no way to resolve the actual draw-time transform. This is near-exact for full-page scans (the
  common case this feature targets) and *under*-estimates DPI for a small logo on a big page,
  which the code deliberately treats as "safe" — it means downsampling less than theoretically
  possible, never more.
- **Object substitution, not a copy pipeline** (`recompressImages.ts`). pdf-lib's `embedJpg`/
  `embedPng` can only *add* a new image; they can't swap one that existing page content already
  draws. So recompression walks every indirect object, finds image `PDFRawStream`s, and
  `context.assign()`s a freshly-built dict + re-encoded bytes **onto the same `PDFRef`**. Because
  the reference is unchanged, every page drawing that image keeps working with zero page-copying
  and zero resource-dictionary rewriting. A copy-based pipeline was considered and rejected (would
  risk shared-resource duplication and require `pdfCore.copyPagesToPdf` to grow a hook nothing else
  needs).
- **qpdf command is exactly** `--compress-streams=y --recompress-flate --compression-level=9
  --object-streams=generate` (`optimizeStructure.ts`) — note `--compress-streams=y` is present;
  don't drop it when porting. `--remove-unreferenced-resources` is deliberately absent (it only
  applies alongside qpdf's own `--pages` mode, unused here).

### OCR
- **Skip threshold is exactly 20 non-whitespace characters** (`ocrDocument.ts:
  MIN_TEXT_LAYER_CHARS`). Chosen specifically because a genuinely scanned page can still carry a
  few real short text objects (a page-number stamp, a "Confidential" watermark, a signature block)
  that are only a handful of characters — treating those as "has text" would skip OCR and leave
  the actual scanned content unsearchable. 20 is comfortably above any such stray label but well
  below even a sparse paragraph of real body text.
- **OCR input render width is 2000px** (`ocrDocument.ts: RENDER_WIDTH`), independently chosen from
  the workspace's own thumbnail/preview render widths — described as "roughly 300dpi-equivalent"
  for a standard page.
- **Recognition and write-back are separately testable stages that happen to always run
  together in the UI.** `ocrDocument()` never writes to the PDF; `bakeOcrTextLayer()` never runs
  Tesseract. `OcrPanel.tsx` is the only caller that sequences both. A rewrite that keeps them
  separable preserves the ability to unit-test recognition without a write-back dependency.
- **Word rects use top-left-origin normalized coordinates (0..1)**, converted to pdf-lib's
  bottom-left-origin point space by `bakeOcrTextLayer.ts`'s own local `toRect()` — a byte-for-byte
  duplicate of `annotationBake.ts`'s conversion formula (see §7).

### Security / passwords
- **qpdf-wasm module instances are single-use, by design, not an oversight.** `pdfUnlock.ts`,
  `protectPdf.ts`, and `optimizeStructure.ts` each call `loadFactory()` (cached — the *factory*,
  not an instance) then create a **fresh module instance for every single invocation**. qpdf's
  `callMain()` internally calls Emscripten's `exit()`, which permanently kills that instance for
  any further use. Do not "optimize" this into one shared, reused instance.
- **Two-layer encryption detection** (`pdfUnlock.ts: probePdf`) — pdf.js's `PasswordException` for
  user-password files; a raw byte-scan for the ASCII marker `/Encrypt` (`[0x2f,0x45,0x6e,0x63,
  0x72,0x79,0x70,0x74]`) for owner-only/permissions-only files, which pdf.js opens without
  complaint. `pdf-lib` is never used for detection (throws generic parse errors on encrypted
  input).
- **Silent-password retry order** before ever prompting: session-cached password, then an empty
  string (unlocks owner-only files, which have no real user password) — see §1.7.
- **Protect's owner password always equals the user password** — one secret per file, no
  permissions layer, no restriction flags ever passed to qpdf's `--encrypt`.
- **The unlock password is cached in memory only** (`App.tsx: sessionPassword`, a `useRef`), never
  written to IndexedDB or localStorage, cleared on Start Over.

### Watermark / page numbers / rendering
- **Page-numbers' third "Style" option is the one deliberate exception to "logic never renders
  untranslated user-facing text at bake time."** The three format-picker buttons are themselves UI
  (translated), but whichever string the user picks is stored **verbatim** on the
  `DocAnnotation.format` field and printed into the output PDF as-is by `annotationBake.ts` — it is
  never re-translated again, even if the user later switches the UI language. `{n}`/`{total}` are
  safe as literal single braces because i18next only interpolates `{{…}}` double braces.
  (`PageNumbersPanel.tsx`'s in-file comment; `annotationBake.ts: drawDocAnnotation`.)
- **Page rotation is additive, not replaced.** `pdfCore.ts: copyPagesToPdf` computes
  `(copiedPage.getRotation().angle + pageItem.rotation) % 360` — a user's rotation stacks on top of
  whatever `/Rotate` value the page already had in its source PDF, it does not overwrite it.
- **Watermark image is always scaled to exactly 50% of page width**, centered — not user-
  adjustable (`annotationBake.ts: drawDocAnnotation`, the `d.assetId` branch). Text watermark
  defaults: size 48, color `#888888`, opacity 0.15, rotation 45°. Page-number defaults: size 12,
  color `#666666`, margin 24pt, corner bottom-right.
- **One shared bake pipeline, reached only through `copyPagesToPdf`.** `annotationBake.ts:
  bakePage()`/`drawDocAnnotation()` is the single place watermark/page-number marks are ever drawn
  for real output — `buildPdf`, `splitPdf`, and `extractPdf` all funnel through
  `pdfCore.copyPagesToPdf`, so a mark set once is guaranteed to appear identically everywhere the
  PDF is regenerated. **Never implement a new page-drawing feature as an isolated function** that
  bypasses this pipeline.
- **Three independent re-implementations of the exact same drawing geometry exist** (bake
  formula, the on-canvas `DocMarksOverlay.tsx`, and each panel's own inline live-preview JSX) —
  kept in sync only by code comments ("mirrors the bake"), not by a shared function. See §7.

### Asset storage & undo
- **Assets are content-hashed and deduplicated.** `store.tsx: hashBytes()` is a dependency-free
  FNV-1a hash over the raw bytes; `addAsset()` uses the hash string itself as the asset's id, so
  re-uploading byte-identical image data reuses the existing `Asset` entry rather than storing a
  duplicate, and the resulting id is stable across separate uploads of the same bytes.
- **`ADD_ASSET` is the one action deliberately excluded from undo history**
  (`store.tsx: UNDOABLE` Set) — assets are append-only and referenced by content hash, so there is
  nothing meaningful to "roll back" to.
- **Undo history is capped at 50 entries** (`store.tsx: HISTORY_LIMIT`), oldest entries silently
  dropped once exceeded.
- **A no-op action never touches history.** The reducer wrapper compares `nextState === state`
  (reference equality, cheap thanks to immer's structural sharing) before pushing a history entry
  — an action that produced no actual change (e.g. deleting a page id that no longer exists) does
  not create a throwaway undo step.

### Persistence
- **Session recovery window is exactly 5 minutes** (`App.tsx: RECOVER_MAX_AGE_MS`). A session
  older than that is **silently discarded** — the recover banner simply never appears, as if no
  session existed at all; it is not deleted from IndexedDB by the mere act of being stale (only an
  explicit Restore, Dismiss, or Start Over clears it).
- **Autosave is debounced 800ms** after any change to `sources`/`pages`/`docAnnotations`/`assets`
  (`App.tsx`), and is suspended entirely while the recover banner is still being offered (so
  accepting/declining the recovery prompt can't race with a fresh autosave of the not-yet-restored
  empty state).
- **The IndexedDB session key is versioned (`pdfdemo:session:v2`) specifically so an incompatible
  older save is simply ignored, never migrated** — sessions are treated as fully disposable state.
  A `v2` session saved before the (now fully removed) Annotate feature was dropped may still carry
  a leftover per-page `annotations` field on disk; this is harmless because nothing in the current
  schema declares or reads that field — the rest of the shape loads normally.
- **Only one thing is ever written to `localStorage` (not IndexedDB): the explicit language choice,
  under the literal key `pdfdemo:lang`.** It is kept separate from the IndexedDB session
  store specifically so a language preference survives "Start over," which wipes the working
  document but must not reset the UI language.
- **Not persisted anywhere, by design:** the unlock password (memory only, per §"Security" above);
  the undo/redo stacks (`past`/`future` — memory only; a reload restores the *current* page plan
  from the session store, but never the history that led to it).
- **`idb-keyval`'s structured clone can hand bytes back as a raw `ArrayBuffer` instead of a
  `Uint8Array`** — `storage.ts: asBytes()` re-wraps every source's and every asset's bytes on load
  to normalize this before they re-enter app state.

### Routing / i18n (see also §4)
- **`shared/lib/routes.ts` must remain the only path parser in the codebase.** Both the in-app
  router (`useRoute.ts`) and i18n's path-based language detector
  (`shared/i18n/index.ts: isVietnamesePath`) parse the current URL exclusively through
  `routes.ts: parseLocation()`. A prior version of the app had the router and the language detector
  each parsing the path independently, and they drifted out of agreement about what a given path
  meant — a real, shipped bug class. Do not add a second `pathname.split('/')` anywhere.
- **The stored language preference means "explicitly chosen," and *only* the switcher may ever
  write it.** i18next's own automatic detection-caching is disabled (`caches: []` in
  `shared/i18n/index.ts`) specifically because, before this fix, merely visiting `/vi/` (path
  detector) or having a Vietnamese browser locale (navigator detector) would silently stamp `'vi'`
  into storage as if the user had asked for it — permanently hiding the English option on the root
  path afterward for that visitor. `persistLanguagePreference()` is called by the switcher
  immediately before it navigates.
- **`i18n.language` can be a full region tag (`'vi-VN'`) that isn't in `SUPPORTED_LANGUAGES`.**
  Any code comparing the current language against the supported set must go through
  `toSupportedLanguage()` — a raw `===` comparison against `'en'`/`'vi'` previously caused the
  language switcher's own active-language badge to show the wrong value and made the English option
  appear to do nothing when clicked from a Vietnamese-browser visit to `/`.

### UI / interaction
- **`backdrop-blur` on an ancestor makes it a CSS containing block for `position: fixed`
  descendants.** `MegaMenu.tsx` and `LanguageSwitcher.tsx` both learned this the hard way: a
  `fixed inset-0` invisible backdrop meant to catch outside-clicks was, because `AppBar`'s header
  has `backdrop-blur`, actually confined to the header's own box — clicks on the page body below
  never reached it, leaving Escape as the only way to close the menu. Both now use a
  `document.addEventListener('mousedown', ...)` outside-click check instead (deliberately
  `mousedown`, not `click`, so the outside click still reaches whatever element is underneath it).
- **Hover feedback is intentionally three-tiered, not one style applied uniformly**
  (`index.css`): `.btn-motion` (scale + shadow) for large, clearly-labelled action buttons only;
  `.icon-btn` (color change only, no transform) for small/icon-only controls, because scale motion
  read oddly at that size; `.appbar-lift` (a small vertical translate, no color change) exclusively
  for the `AppBar`'s nav cluster (tool shortcuts, "All tools," language switcher), because those
  buttons sit in a tight row where a scale hover visibly nudges its neighbors.
- **Zoom state has three different scopes that look similar but aren't interchangeable**
  (`PageStage.tsx`): `usePageRender` is the stateless render core; `usePageStage` wraps it with its
  *own* zoom state that resets to 100% whenever the shown page changes (used by the single-page
  `PageZoom` modal); `useZoom` is bare zoom state with no reset behavior, shared across every page
  at once (used by `BrowseView`'s continuous-scroll layout, one zoom level for the whole document).
  Using the wrong one for a new caller silently produces either N independent zooms or a
  never-resetting shared zoom.
- **`RecoverBanner`'s relative-time text ("5 minutes ago") is produced via
  `Intl.RelativeTimeFormat`, not hand-built plurals** — it automatically follows whatever language
  is active, including Vietnamese's different pluralization rules, with no app-side translation
  table to maintain.

### SEO / ads
- **The `<title>`/`<meta description>` for every routed page exists in two independently-edited
  places that must be kept in sync by hand, with no build-time check that they agree**: the static
  HTML file's `<head>` (crawler-visible, baked at build time) and the `seo` i18n namespace
  (`shared/i18n/locales/{en,vi}/seo.json`, used by `App.tsx`'s `document.title` effect to keep the
  browser tab honest when the route/language changes client-side, without a reload). **This is the
  exact duplication class responsible for a real production bug** (a one-line SEO edit that broke
  the homepage's meta tags) — see §7 for the structural fix this needs.
- **`document.title` is the *only* thing `App.tsx` updates client-side; `<meta name="description">`
  is never updated after the initial static HTML load.** A client-side route change (e.g. picking
  "Split" from the mega-menu, which does not navigate to `/split-pdf/`) changes the tab title via
  i18n but the meta description tag stays whatever the current static HTML page baked in.
- **The two Adsterra Banner sizes (320×50 mobile, 468×60 desktop) share one global `atOptions`
  object and must never both be live in the DOM at once** — the second script's `invoke.js` would
  read whichever `atOptions` was written last, clobbering the first. `Footer.tsx` picks exactly one
  size **once, at mount**, from `window.innerWidth` against a 480px breakpoint, and deliberately
  never re-decides on resize.
- **The Google AdSense verification `<script>` tag is hand-duplicated, byte-identical, into all 10
  static HTML entry points** — unlike the Adsterra units (centralized, flag-gated in
  `adsConfig.ts` + injected once from `main.tsx`), AdSense's tag has no single source and no
  compiler/build check that all 10 copies still match. See §7.
- **`injectScriptOnce()` (`ads.ts`) is keyed by DOM element id and is a no-op if that id already
  exists** — this guards against React 18 StrictMode's dev-mode double-invocation of effects
  causing a script to be injected twice, not just against a hypothetical second real call.
