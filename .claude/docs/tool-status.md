# Tool status

What is actually implemented **today**, verified against `src/toolRegistry.ts` and the components it
references. Not a roadmap.

**Re-verify before trusting this file** — it is hand-maintained and the registry is not:

```bash
sed -n '/^const TOOL_SEEDS/,/satisfies readonly ToolSeed/p' src/toolRegistry.ts
```

All 11 rows now point at a real component. `src/tools/ComingSoonTool.tsx` still exists as the
placeholder for a future tool #12, but nothing in the registry references it.

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
| 9 | `watermark` | edit | `/watermark-pdf/` | `WatermarkTool` | **Implemented** |
| 10 | `protect` | security | `/protect-pdf/` | `ProtectTool` | **Implemented** |
| 11 | `unlock` | security | `/unlock-pdf/` | `UnlockTool` | **Implemented** |

Vietnamese routes are the same slugs under `/vi/` — e.g. `/vi/merge-pdf/`.

**11 of 11 implemented.** They fall into two groups, deliberately built differently:

- **Page-plan tools (6)** — Merge, Split, Reorder, Delete pages, Rotate, **Watermark**. They share
  one pipeline ([pdf-pipeline.md](pdf-pipeline.md)) and one session store
  ([state-and-undo.md](state-and-undo.md)), so a user can merge, delete pages, then rotate without
  re-uploading. Watermark belongs here rather than with the transforms: it stores a
  `DocAnnotation` on the plan and the mark is drawn by the shared bake, which is what makes it
  survive a later merge/split/rotate.
- **Single-file transforms (5)** — Compress, OCR, Image to PDF, Add password, Remove password. One
  file in, one result out. **Not** wired to the session store — no page plan, nothing to undo. They
  reuse shared pieces only where behaviour genuinely overlaps (`SingleFileToolShell`, drag sensors,
  zoom-modal chrome, `PreviewModal`, `runQpdf`, typed errors).

---

## What exists for the page-plan tools

- `src/tools/organize/` — `OrganizeToolShell`, `BuildAction`, and the five Organize components
  (12–20 lines each; only `SplitTool` has its own settings panel).
- Full workspace: thumbnail grid, drag-to-reorder, per-page rotate/delete, zoom modal, undo/redo.
- `PreviewModal` before every download; Split downloads a zip directly.
- **Watermark** (`src/tools/edit/`) — text or image mode, applied by dispatching a `DocAnnotation`
  rather than by producing bytes. `shared/lib/annotationBake.ts` draws it from inside
  `copyPagesToPdf`, and `shared/lib/watermarkGeometry.ts` is the one formula the bake *and* the
  live preview both consume. Exactly one watermark can exist at a time; reopening edits it.

## What exists for the single-file transforms

- `src/tools/shared/SingleFileToolShell.tsx` — one-file picker plus registry-driven heading, used by
  **four** of the five: Compress, OCR, Add password, Remove password. Encrypted input is decrypted
  through the shared unlock gate before the tool body sees it; `acceptEncrypted` opts out, and only
  Unlock sets it.
  **Image to PDF deliberately does not use it** — that is not an oversight. It ingests images, not a
  PDF, so a one-file picker and the unlock gate are both inapplicable; it builds its own dropzone and
  sortable grid, sharing only the generic drag/zoom pieces (`useDragSensors`, `ZoomModalChrome`,
  `ZoomStepper`).
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

- **Add password** (`src/tools/security/protectPdf.ts`) — AES-256 via `runQpdf`, owner password set
  equal to the user password. Rejects an empty/whitespace password and an already-encrypted input
  before qpdf is invoked. Its preview uses `PreviewModal`'s `overlay` — the only user of that prop,
  because a browser renders an encrypted PDF as its own password prompt.
- **Remove password** (`src/tools/security/pdfUnlock.ts`) — two-layered detection
  (`probeEncryption` in `shared/pdf/pdfRender.ts`), then `qpdf --decrypt`. Result goes to
  `PreviewModal` and never touches the page-plan store.

## Encrypted uploads are handled app-wide

`shared/state/useUnlockGate.tsx` sits in **every** upload path — `useAddSources` (page-plan tools)
and `SingleFileToolShell` (transforms). An encrypted file is decrypted before it can become a
`SourceDoc`, so everything downstream works on plaintext (`spec/features.md` §1.7). Retry order is
session-cached password, then empty string, then a prompt with unlimited retries and Skip. The
password lives in `shared/state/sessionPassword.ts` — memory only, cleared on Start Over.

---

## What is missing repo-wide

Every tool is built. Still absent, and not to be assumed present: session autosave / recovery
(IndexedDB), ad units, accounts. Prerendering + `sitemap.xml` is now built
(`scripts/prerender.mjs`, wired as `postbuild`).

`StoreProvider` already accepts an `initial` state, which is the hydration point session recovery
will use.

---

## Adding tool #12

1. Read the behaviour in `spec/features.md`, plus every entry naming it in `spec/edge-cases.md`.
   The edge cases are not optional — each exists because of a specific shipped bug or browser
   limitation.
2. Follow [architecture.md](architecture.md) §2: build the component, add one registry row and two
   locale files. No other file changes.
3. Pick the right base. Does it change which pages exist, their order, or what is drawn on them?
   Build on `OrganizeToolShell` + the shared pipeline, and if it draws on pages, extend
   `annotationBake.ts` rather than writing a second drawing path. Otherwise build on
   `SingleFileToolShell`. Either way the output goes through `PreviewModal` and errors are typed.
4. Add `action` (and any panel keys) to **both** `locales/en/<id>.json` and `locales/vi/<id>.json`.
5. Update this file.
