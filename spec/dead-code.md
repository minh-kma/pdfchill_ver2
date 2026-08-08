## 6. Known Dead Code / Things NOT to Carry Forward

These exist in the current tree but are **not reachable from any UI** and are not part of the
shipped product. Do not resurrect them from old commit history, memory, or by inference from their
presence in the repo — treat them purely as historical false starts.

- **`src/features/edit/crop/cropPages.ts`** — a complete, working `cropPages()` function
  (pdf-lib `setCropBox`, with degenerate-rect/overlap validation and per-page apply/fail
  reporting). Zero imports from anywhere else in the codebase. No corresponding UI file exists in
  its folder. Not in `toolCatalog.ts`'s `ToolIntent` union.
- **`src/features/edit/edit-text/editText.ts`** — complete `extractEditableText()` (pdf.js text
  run extraction) and `applyTextEdits()` (opaque-white-rectangle-then-redraw, same technique as the
  now-fully-removed Eraser annotation tool — the original text is *not* actually erased from the
  content stream, only visually covered). Zero imports elsewhere. Carries the one user-facing
  string in the codebase still hard-coded in English rather than routed through i18n
  (`EDIT_TEXT_DISCLOSURE`), specifically because there is no UI to render it through.
- **`src/features/edit/forms/formFields.ts`** — complete AcroForm read (`extractFormFields`),
  fill (`fillFormFields`), and create (`createFormFields`, covering text/checkbox/radio-group/
  dropdown/list-box) logic, pure pdf-lib. Zero imports elsewhere. No UI file in its folder.
- **The former `features/edit/annotate/` tree does not exist in the current codebase at all** —
  nine sub-tools (Shapes, Eraser, Highlight, Add text, Note, Draw, Image, Sign, Text highlight;
  ~1,076 lines total), their shared authoring context/toolbar/overlay infrastructure, a per-page
  `Annotation` discriminated union with its own reducer actions and autosave field, and an
  `annotate` mode in `App.tsx`/`BrowseView` were all built partway then **fully deleted** on
  2026-07-20. This note exists purely so the rewrite doesn't mistakenly reconstruct it from old git
  history or from stale documentation that predates the deletion. Watermark and Page numbers are
  unaffected by this — they are separate, live features (§1.9, §1.10) that were never part of the
  Annotate tree.
- **`ToolGrid.tsx`** (an old landing-page tool-selection grid, predating the persistent `AppBar` +
  `MegaMenu` redesign) has been fully deleted; zero references remain anywhere in `src/`.
- **Three unused icon exports in `shared/components/icons.tsx`: `EditIcon`, `ChevronLeftIcon`,
  `ChevronRightIcon`.** Defined, never imported anywhere — leftovers from the dead Edit Text
  feature and from an older prev/next-arrow single-page Browse view that was later replaced by the
  current continuous-scroll + thumbnail-sidebar layout.
- **`shared/lib/download.ts`'s `downloadPdf()` export is not literally dead** — it's the fallback
  branch `savePdf()` calls on browsers without the File System Access API — but no panel or
  component calls it directly; every result flow goes through `savePdf()`.
- **There is no `beforeunload` confirmation dialog anywhere in the app** — grep-confirmed absent.
  A stale internal doc once claimed one existed; it does not. IndexedDB autosave (§2, §3) is the
  *only* protection against losing work on an accidental reload/close.
- **All four Adsterra ad units (Native Banner, Banner strip, Popunder, Social Bar) are currently
  disabled** (`shared/lib/adsConfig.ts` — all four `ENABLE_*` flags are `false` as of the most
  recent commit on the branch). This is a feature flag, not dead code: the injection logic
  (`ads.ts`, `Footer.tsx`, `NativeBanner.tsx`) is live and correct, just currently inert pending
  Google AdSense approval. Do not treat these files as safe to delete.
