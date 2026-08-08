# PDF pipeline

How PDF bytes are read, assembled and written. Session state and undo live in
[state-and-undo.md](state-and-undo.md).

Libraries, strictly separated:

- **pdf-lib** — assembly. Produces output bytes for everything except the qpdf pass.
- **pdf.js (`pdfjs-dist`)** — display. Never produces output bytes.
- **qpdf-wasm** — lossless structural rewriting only, via `shared/lib/qpdf.ts`.
- **tesseract.js** — OCR recognition only; it never touches a PDF.

All four are dynamically imported so none lands in the homepage bundle. If you add a static
`import … from 'pdf-lib'` to a module the registry reaches, pdf-lib is pulled into the entry
chunk — check the build output after changing imports.

---

## 1. The page-plan model (`shared/state/types.ts`)

Source bytes are never edited in place (`spec/data-model.md` §3.1):

- `SourceDoc { id, name, bytes, pageCount }` — an uploaded file, kept verbatim. **Append-only.**
- `PageItem { id, sourceId, sourceIndex, rotation }` — one entry in the plan, referencing a page of
  a source plus the rotation the user added.

The five page-manipulation tools are each just an edit to that plan:

| Tool | What it actually is |
|---|---|
| Merge | pages from several sources sharing one plan |
| Reorder | the plan array's order |
| Delete pages | an entry absent from the plan |
| Rotate | an entry's `rotation` |
| Split | the same build, run once per contiguous slice of the plan |

That is why they share one pipeline and one store rather than being five separate features: a user
can merge, delete pages, then rotate without re-uploading, because all three are edits to the same
plan.

---

## 2. Reading a file — `readSource(file: File): Promise<LoadedSource>`

Parses an upload into the plan model exactly once and returns `{ source, pages }`. Callers keep
`SourceDoc.bytes` for the rest of the session; nothing re-reads the `File`.

Failure is typed, never a raw message:

- `EncryptedPdfError` — pdf-lib failed to load **and** `hasEncryptMarker(bytes)` found the ASCII
  `/Encrypt` trailer marker.
- `InvalidPdfError` — pdf-lib failed to load and no marker, or the file has zero pages.

`hasEncryptMarker()` is exported for the future Unlock tool. It is used only to *explain* a load
failure, never to reject a file that loaded fine: those literal bytes could occur inside an ordinary
content stream, and a false reject is worse than a vague error. The authoritative detection layer
(pdf.js's `PasswordException`, per `spec/edge-cases.md`) belongs to Unlock when it is built.

`useAddSources()` (`shared/state/useAddSources.ts`) wraps this for the UI: one `ADD_SOURCE` per
file so each is independently undoable, and a file that fails to parse is reported while the rest
of the batch continues.

---

## 3. One assembly function — `copyPagesToPdf(plan)`

`shared/lib/pdfCore.ts`. **The only code that writes PDF bytes.** `spec/edge-cases.md`: "Never
implement a new page-drawing feature as an isolated function that bypasses this pipeline."

```ts
interface PagePlan { sources: readonly SourceDoc[]; pages: readonly PageItem[] }

copyPagesToPdf(plan: PagePlan): Promise<Uint8Array>
buildPdf(plan): Promise<Uint8Array>                              // = copyPagesToPdf
splitPdf(plan, ranges: PageRange[], baseName): Promise<SplitPart[]>
planBaseName(plan): string                                       // first source's name, minus .pdf
```

`buildPdf()` and `splitPdf()` are thin wrappers, so a split part is byte-identical to what Download
would have produced for those pages.

Two behaviours it must keep:

- **Pages are copied one at a time, in plan order.** The plan array order *is* the output order.
  Do not batch-copy per source "for speed" — that reorders output.
- **Rotation is additive.** `(sourcePage./Rotate + item.rotation) % 360`. The user's rotation stacks
  on whatever the source page already carried; it does not replace it (`spec/edge-cases.md`).

Deleted pages need no handling — they are simply not in the plan. An empty plan throws
`EmptyPlanError`.

Loaded source documents are cached per call in a local `Map`, so a 40-page merge parses each file
once.

### Split ranges — `shared/lib/splitRanges.ts`

Pure, no React, unit-testable in isolation:

- `buildRanges(input, total)` — parses "split after page numbers" (`3, 7` on 10 pages → 3 ranges).
  Comma/whitespace separated, deduplicated, kept only where `1 <= p < total`, sorted ascending.
  Anything dropped comes back in `ignored` and is shown inline — a typo never blocks the rest.
  N valid split points produce N+1 ranges.
- `eachPageRanges(total)` — one single-page range per page.

Output names follow `{baseName}_part{index}_p{start}-{end}.pdf`, 1-based throughout
(`spec/features.md` §1.2).

---

## 4. pdf.js is display-only (`shared/pdf/pdfRender.ts`)

Thumbnails and the zoom view render through pdf.js; **nothing in that module ever produces output
bytes.**

- Parsed documents cached by source id; `releaseDocumentsExcept(activeIds)` destroys the rest via
  `doc.loadingTask.destroy()` (the proxy has no `destroy()` in pdf.js v6). `Workspace` calls it
  whenever `state.sources` changes.
- **Byte arrays are copied (`bytes.slice()`) before being handed to pdf.js**, which transfers
  buffers to its worker and would otherwise detach the array the store keeps for pdf-lib.
- Render queue capped at 4 concurrent renders; `renderPage()` takes an `AbortSignal` and cancels
  the pdf.js render task on abort, so a stale frame never lands in a reused canvas.
- The worker is a bundled `?url` import, not a CDN, so the app still works offline after first load
  (`spec/constraints.md`).
- `getViewport({ rotation })` takes an **absolute** angle, so the same
  `source /Rotate + user rotation` sum the bake uses is what gets passed.

---

## 4b. qpdf (`shared/lib/qpdf.ts`)

`runQpdf(input, args)` is the only place qpdf-wasm is invoked. Call sites reduce to "what args do
I pass" — `spec/maintainability.md` pain point #7 is the old app triplicating this.

**A fresh module instance is created per call and never cached or shared.** qpdf's `callMain()`
internally calls Emscripten's `exit()`, which permanently kills that instance. Only the dynamic
import is cached. Success is decided by whether the output file reads back non-empty — not by
`callMain`'s return value and not by the absence of a throw, since `callMain` can throw on a
successful run.

The wasm is a same-origin `?url` asset, and `wasmUrl` is injectable so the module works outside a
browser (tests, a future prerender step).

Compress uses it today; Protect and Unlock will use it unchanged.

---

## 5. The shared workspace (`shared/components/workspace/`)

| File | Role |
|---|---|
| `Workspace.tsx` | The page grid: dnd-kit reorder, toolbar (rotate-all, undo, redo, start over), zoom modal host |
| `PageThumb.tsx` | Sortable card + per-page rotate / delete / enlarge |
| `PageZoom.tsx` | Full-screen single page, 20–300% zoom in 10% steps |
| `PageCanvas.tsx` | The one place a page is drawn to a canvas |

One component, used by all five tools — `spec/features.md` §1.4 bundles those operations into a
single screen. Tools differ only in the action rendered *below* it. **Do not fork it per tool.**

`onDragEnd` dispatches `REORDER` with the full reordered array.

### Generic pieces shared with the images-to-PDF grid

`spec/maintainability.md` pain point #9: the old app maintained two independent copies of the
drag-thumbnail-with-toolbar pattern, so a UX tweak to one silently diverged from the other. The
*generic* parts live in `shared/` and both grids depend on them without depending on each other:

| Module | What it owns |
|---|---|
| `shared/components/dnd/useDragSensors.ts` | The one sensor config: 6px pointer activation (so clicking a thumbnail's rotate/delete button never starts a drag), 150ms hold + 6px tolerance for touch |
| `shared/components/ZoomModalChrome.tsx` | Escape-to-close, body-scroll-lock, backdrop-click-to-close |
| `shared/components/ZoomStepper.tsx` | 20–300% zoom in 10% steps, typed percentage committing on blur/Enter, reset-on-subject-change |

What stays per-feature is the content: `PageThumb`/`PageCanvas` render PDF pages, `ImageCard`
renders an `<img>`.

---

## 6. Tool composition

`src/tools/organize/` holds the two pieces every page-manipulation tool is built from:

- `OrganizeToolShell.tsx` — registry-driven heading, file input, `Workspace`, then the tool's own
  action area as `children`. Props: `multiple` (multi-file picker), `keepUploader` (Merge only —
  it exists to combine an additional file in, so it must never be gated behind "a document is
  already loaded"), `uploadButtonKey`.
- `BuildAction.tsx` — assemble the plan → `PreviewModal`. Shared by Merge, Reorder, Delete and
  Rotate, which differ only in button wording and filename suffix.

`SplitTool.tsx` is the only one with its own panel, because it has settings.

`src/tools/shared/SingleFileToolShell.tsx` is the equivalent for the single-purpose transforms
(Compress, OCR): registry-driven heading, a one-file picker, then the tool's own config/running UI.
It is deliberately **not** wired to the session store — those tools have no page plan and nothing
to undo, and a user's in-progress merge session is not their input.

### Compress specifics (`src/tools/optimize/compress/`)

Two phases, both in a Web Worker. The three "never bigger" floors sit at three layers and **must
not be collapsed**: per-image (`recompressImages.ts`), per-stage (`compressPipeline.ts` discards
qpdf output that isn't smaller), per-document (`pickCompressResult.ts`, pure and React-free per
`spec/maintainability.md` #4). Phase 2 always runs, even when phase 1 was skipped for lack of
OffscreenCanvas — surface `imagesSupported` in the UI or a small result reads as a bug.

Image recompression uses **object substitution**: a rebuilt stream is assigned onto the same
`PDFRef`, so every page already drawing that image keeps working with no page-copying. `embedJpg`
can only add an image, never swap one.

### OCR specifics (`src/tools/optimize/ocr/`)

`ocrDocument.ts` recognizes and never writes; `bakeOcrTextLayer.ts` writes and never runs
Tesseract. Keep them separable — that is what makes recognition testable without a write-back
dependency (`spec/edge-cases.md`). The bake goes through `shared/lib/geometry.ts`'s `toPdfRect`,
the one normalized-rect ↔ PDF-rect conversion (pain point #5).

---

## 7. Output rules

Every result goes through `PreviewModal` before it can be saved: **no code path auto-downloads**
(`spec/constraints.md`). Saving prefers `showSaveFilePicker` and falls back to an `<a download>`;
a cancelled save dialog (`AbortError`) means "do nothing", never "fall back".

Split is the one documented exception (`spec/features.md` §1.2): its result is a zip of N PDFs
(jszip, dynamically imported), which has no single document to preview, so it downloads directly.

Errors reaching the UI are always translated. Logic modules throw typed errors
(`InvalidPdfError`, `EncryptedPdfError`, `EmptyPlanError`); `toErrorKey()` in
`shared/lib/errorKeys.ts` maps the *class* to an i18n key. Never render `err.message`.
