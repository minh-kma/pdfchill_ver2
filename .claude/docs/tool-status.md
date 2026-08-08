# Tool status

What is actually implemented **today**, verified against `src/toolRegistry.ts` and the components it
references. Not a roadmap.

**Re-verify before trusting this file** — it is hand-maintained and the registry is not:

```bash
sed -n '/^const TOOL_SEEDS/,/satisfies readonly ToolSeed/p' src/toolRegistry.ts
```

Any row whose `Component` is `ComingSoonTool` is a placeholder: the route, nav entry, homepage card
and SEO metadata all exist and work, but the page renders "Coming soon — <Tool Name>".

---

## The 11 tools

| # | id | Category | Route | Component | Status |
|---|---|---|---|---|---|
| 1 | `merge` | organize | `/merge-pdf/` | `MergeTool` | **Implemented** |
| 2 | `split` | organize | `/split-pdf/` | `SplitTool` | **Implemented** |
| 3 | `reorder` | organize | `/reorder-pdf-pages/` | `ReorderTool` | **Implemented** |
| 4 | `delete-pages` | organize | `/delete-pdf-pages/` | `DeletePagesTool` | **Implemented** |
| 5 | `rotate` | organize | `/rotate-pdf/` | `RotateTool` | **Implemented** |
| 6 | `compress` | optimize | `/compress-pdf/` | `CompressTool` | **Implemented** |
| 7 | `ocr` | optimize | `/ocr-pdf/` | `OcrTool` | **Implemented** |
| 8 | `image-to-pdf` | convert | `/image-to-pdf/` | `ImageToPdfTool` | **Implemented** |
| 9 | `watermark` | edit | `/watermark-pdf/` | `ComingSoonTool` | Placeholder |
| 10 | `protect` | security | `/protect-pdf/` | `ComingSoonTool` | Placeholder |
| 11 | `unlock` | security | `/unlock-pdf/` | `ComingSoonTool` | Placeholder |

Vietnamese routes are the same slugs under `/vi/` — e.g. `/vi/merge-pdf/`.

**8 of 11 implemented.** They fall into two groups, deliberately built differently:

- **Organize (5)** — Merge, Split, Reorder, Delete pages, Rotate. Page-manipulation workflows
  sharing one pipeline ([pdf-pipeline.md](pdf-pipeline.md)) and one session store
  ([state-and-undo.md](state-and-undo.md)), so a user can merge, then delete pages, then rotate
  without re-uploading.
- **Optimize + Convert (3)** — Compress, OCR, Image to PDF. Single-purpose transforms: one file in,
  one result out. They are **not** wired to the session store — no page plan, nothing to undo. They
  reuse shared pieces only where behaviour genuinely overlaps (drag sensors, zoom-modal chrome,
  `PreviewModal`, typed errors).

---

## What exists for the Organize five

- `src/tools/organize/` — `OrganizeToolShell`, `BuildAction`, and the five tool components
  (12–20 lines each; only `SplitTool` has its own settings panel).
- Full workspace: thumbnail grid, drag-to-reorder, per-page rotate/delete, zoom modal, undo/redo.
- `PreviewModal` before every download; Split downloads a zip directly.

## What exists for Compress / OCR / Image to PDF

- `src/tools/shared/SingleFileToolShell.tsx` — one-file picker plus registry-driven heading, used
  by Compress and OCR. Rejects encrypted input up front rather than failing mid-run.
- **Compress** (`src/tools/optimize/compress/`) — both phases run in a Web Worker
  (`compressWorker.ts`): lossy image recompression via OffscreenCanvas, then the always-run
  lossless qpdf structural pass. All three "never bigger" floors are in place; `pickCompressResult`
  is a pure function, so the outermost floor is testable without mounting React. The result panel
  surfaces whether recompression actually ran (`imagesSupported`, `replaced`).
- **OCR** (`src/tools/optimize/ocr/`) — `ocrDocument.ts` recognizes sequentially, skipping pages
  that already have ≥20 non-whitespace characters, and never writes to a PDF;
  `bakeOcrTextLayer.ts` writes the invisible per-word text layer and never runs Tesseract.
  Tesseract workers are cached per language combination and terminated on unmount.
- **Image to PDF** (`src/tools/convert/`) — byte-sniffed format detection, the documented layout
  options, per-image rotation, and both output modes (one merged PDF, or one PDF per image zipped).
  Staged-image state is local to the screen, not in the global store.

## What exists for the other three

Watermark, Add password, Remove password: registry row, route, nav entry, homepage card, SEO
metadata, and `{en,vi}` locale files with the four registry keys. Nothing else. Their locale files
have **no** `action` key yet.

---

## What is missing repo-wide

- **qpdf-wasm** (`@jspawn/qpdf-wasm`) and **tesseract.js** are now installed, and both lazy-load
  into their own chunks (verified in the build output). Reach qpdf only through
  `shared/lib/qpdf.ts`'s `runQpdf` — Protect and Unlock will use it unchanged.
- Still absent, and not to be assumed present: session autosave / recovery (IndexedDB),
  prerendering + `sitemap.xml`, ad units, accounts.

`StoreProvider` already accepts an `initial` state, which is the hydration point session recovery
will use.

---

## Implementing a placeholder

1. Read that tool's behaviour in `spec/features.md`, plus every entry that names it in
   `spec/edge-cases.md`. The edge cases are not optional — each one exists because of a specific
   shipped bug or browser limitation.
2. Follow [architecture.md](architecture.md) §2 step 4: build the component, then flip that one
   registry row's `Component`. No other file changes.
3. If it manipulates pages, build on `OrganizeToolShell` + the shared pipeline. If it is an
   independent single-purpose transform, build on `SingleFileToolShell` — it does not need the page
   plan, but its output still goes through `PreviewModal`, and it still throws typed errors mapped
   by `toErrorKey()`. Watermark is the interesting remaining case: it is a page-level mark, so it
   belongs on the shared bake pipeline rather than being a one-off transform.
4. Add the `action` key (and any panel keys) to **both** `locales/en/<id>.json` and
   `locales/vi/<id>.json`.
5. Update this file.
