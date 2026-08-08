## 1. Feature List

Eleven tool *intents* are reachable from the UI (`ToolIntent` union,
`src/shared/lib/toolCatalog.ts`), grouped into 5 menu categories (Organize / Optimize / Edit /
Security / Convert). One of them ("Manage pages") bundles four distinct page-level operations
(rotate one, rotate all, delete, reorder) into a single tool screen, which is why the product is
described elsewhere as "11+ tools" or by an enumeration of 13+ operations. Every tool below is
live in production; none is feature-flagged off except the ad units (§6).

Every result-producing tool follows the same non-negotiable UX shape: build/transform bytes →
hand them to `PreviewModal` → the user reviews the rendered PDF in an `<iframe>` → only then can
they download. **No code path auto-downloads.** Every "logic-layer" error (a thrown `Error` from a
`.ts` module) is caught at the UI boundary and replaced with a translated string — `err.message`
itself is never rendered to a user; only typed error classes (e.g. `WrongPasswordError`,
`EmptyPasswordError`, `AlreadyEncryptedError`) are pattern-matched to pick which translated string
to show.

### 1.1 Merge
- **Entry point:** mega-menu "Merge" (`toolCatalog.ts`), or the routed URL `/merge-pdf/` (`/vi/merge-pdf/`).
- **Behavior:** Always opens a fresh multi-file picker — unlike every other tool, Merge never
  applies to a file that's already loaded (`App.tsx: applyTool`, the `intent === 'merge'` branch
  forces the picker path even when `hasPages` is true). Each picked file becomes a `SourceDoc`;
  its pages are appended, in file order, to the global page-plan array
  (`store.tsx: addSource`). If files are added on top of an existing session, the new file's pages
  are appended after the current pages.
- **Post-upload landing:** a merge upload always lands the user in **Manage pages**, not the
  default Browse view, "so the user immediately sees the combined order and can fix it"
  (`App.tsx`, the `pendingTool` effect: `intent === 'manage' || intent === 'merge'` both open
  `{ kind: 'manage' }`).
- **No merge-specific settings UI.** The only way to change the merged order/rotation/inclusion is
  via Manage pages (drag-reorder, rotate, delete) after upload.
- **Output:** produced only via the general Download action (§1.12), which assembles the current
  full page plan — merge has no separate "export" step of its own.

### 1.2 Split
- **Entry point:** mega-menu "Split", or the routed URL `/split-pdf/`.
- **UI:** modal (`SplitPanel.tsx`). Single text input for **split-after page numbers**, e.g. `3, 7`
  on a 10-page document → 3 files (pages 1–3, 4–7, 8–10).
- **Parsing (`buildRanges`, `SplitPanel.tsx`):** comma/whitespace-separated integers; deduplicated;
  filtered to `1 ≤ p < total`; sorted ascending; out-of-range points are dropped and listed as
  "ignored" in an inline validation message (not blocking). N valid split points produce N+1
  ranges.
- **Enable condition:** the Split button is disabled unless there are ≥2 resulting ranges (i.e. at
  least one valid split point).
- **Output:** one PDF per range, each named
  `{baseName}_part{index}_p{start}-{end}.pdf` (1-based `index`, 1-based inclusive page numbers),
  zipped via `jszip` into `{baseName}_split.zip` and downloaded directly (bypasses `PreviewModal`
  — `SplitPanel.tsx` calls `downloadBlob` itself, since a zip has no single PDF to preview).
- **Watermark/page-number marks are baked into every part** if any exist on the working document
  (`splitPdf()` accepts and forwards a `BakeInput`, same as `buildPdf`).
- **Does not mutate the working session** — `sources`/`pages` are read, not written.

### 1.3 Extract pages
- **Entry point:** mega-menu "Extract pages" (no routed URL — menu-only).
- **UI:** modal (`ExtractPanel.tsx`). Single text input, e.g. `1-3, 5, 8`.
- **Parsing (`parseSelection`):** comma/whitespace-separated tokens; a token matching `\d+-\d+` is
  expanded as an inclusive range (works in reverse too — `8-5` counts down 8,7,6,5); a bare number
  is a single page. Duplicates are dropped (first occurrence wins). Out-of-range values (outside
  `1..total`) are silently dropped. **The output page order is exactly the order the user typed**,
  not ascending plan order — typing `5, 1` produces page 5 then page 1.
- **Output:** a single PDF, `{baseName}_extracted.pdf`, handed to `PreviewModal` (not
  auto-downloaded, unlike Split).
- **Does not mutate the working session.**

### 1.4 Manage pages (Rotate / Delete / Reorder)
- **Entry point:** mega-menu "Manage pages" (`intent: 'manage'`); no routed URL. Also the implicit
  landing mode after a merge upload (§1.1).
- **Layout:** responsive grid of page thumbnails, 2 columns on mobile up to 5 on desktop
  (`Workspace.tsx`).
- **Rotate one page:** a rotate icon on each thumbnail adds 90° clockwise to that page's stored
  rotation, normalized into `0..359` (`store.tsx: normalizeRotation`). Cumulative across clicks.
- **Rotate all:** one toolbar button adds 90° to every page's rotation in one dispatch
  (`ROTATE_ALL`).
- **Delete page:** a trash icon removes the page from the plan (`DELETE_PAGE`). The page's
  *source file* is **not** removed from `sources` even if it was the source's last remaining page —
  intentional, so undo can restore the byte data without re-reading the file
  (`store.tsx` comment: "Sources are retained (undo/redo of a delete needs the bytes back)").
- **Reorder:** drag-and-drop via `@dnd-kit` (`DndContext` + `SortableContext`,
  `rectSortingStrategy`). Pointer activation requires 6px of movement before a drag starts (so
  clicking the rotate/delete buttons on a thumbnail never triggers a drag); touch activation
  requires a 150ms hold + 6px tolerance. Dropping calls `arrayMove` and dispatches `REORDER` with
  the full reordered array — the array order **is** the output order at export time.
- **Enlarge:** double-clicking a thumbnail opens `PageZoom.tsx`, a full-screen modal showing that
  one page with its own zoom control (20%–300%, 10% steps, or type an exact percentage — commits
  on blur or Enter, Escape cancels the edit). Zoom resets to 100% whenever the shown page changes.
- **Header:** shows a live page count and distinct source-file count
  (`"{pages} from {files}"`).
- All four sub-actions are individually undoable (§3.3).

### 1.5 Compress
- **Entry point:** mega-menu "Compress", or the routed URL `/compress-pdf/`.
- **UI:** modal (`CompressPanel.tsx`), two phases: a config screen (pick a level, one click to
  start) and a running screen (progress bar + status text). Cannot be cancelled mid-run; if the
  user closes the panel while it's running, a `cancelledRef` guard silently discards the eventual
  result instead of surprise-opening a preview.
- **Setting: compression level** — a 3-way radio (`Low` / `Medium` / `High`), each pairing a JPEG
  re-encode quality with a DPI cap the image is downsampled to if it exceeds it
  (`recompressImages.ts: COMPRESSION_LEVELS`):

  | Level | Quality | DPI cap | Intent |
  |---|---|---|---|
  | Low | 0.82 | 220 | "can't tell" threshold; capped at 220 not 300 on purpose — a level that visibly does nothing to a 300dpi scan reads as broken |
  | Medium (default) | 0.65 | 150 | matches Ghostscript's `/ebook` preset and Acrobat's "Reduce File Size"; halving a 300dpi scan to 150 drops 3/4 of the pixels before quality is even considered |
  | High | 0.45 | 110 | deliberately aggressive, "hitting an email limit" |

- **Pipeline (always both phases, not a user choice which phases run):**
  1. **Image recompression** (lossy, `recompressImages.ts`) — see §2 for the exact screening rules
     for which embedded images are eligible. Runs inside a Web Worker
     (`compressWorker.ts`), reporting `{done, total}` progress per candidate image.
  2. **Structural pass** (lossless, `optimizeStructure.ts`) — always runs, on every level,
     regardless of whether phase 1 ran at all. Invokes qpdf with
     `['--compress-streams=y', '--recompress-flate', '--compression-level=9',
     '--object-streams=generate', input, output]`. Recompresses every stream (not just images) at
     max Flate level, repacks small indirect objects into object streams, and drops objects
     unreachable from the trailer (qpdf's default GC behavior — reclaims anything orphaned by this
     app's own merge/delete/reorder edits). Progress UI shows a single "Optimizing file
     structure…" state (no per-item count available for this phase) and holds the progress bar at
     its last value rather than resetting it.
- **Three independent "never bigger" floors**, each described in §2 — per-image, per-stage,
  per-document.
- **Result info panel:** shows before/after size (`formatBytes`), percent reduction, and one of
  four detail messages depending on outcome (`imagesSupported` false / recompression was a no-op
  because images were already efficient / N images recompressed at level X / already optimal, 0%
  reduction).
- **Output:** `{baseName}_compressed.pdf`, via `PreviewModal`.

### 1.6 OCR
- **Entry point:** mega-menu "OCR" (labelled "Make scanned pages searchable"); no routed URL.
- **UI:** modal (`OcrPanel.tsx`), same config/running two-phase shape as Compress, same
  cancel-while-running guard.
- **Setting: document language(s)** — checkboxes, currently exactly two options: **English**
  (`eng`, checked by default) and **Vietnamese** (`vie`). At least one must stay checked (button
  disabled otherwise). Multiple selections are joined with `+` and passed to Tesseract as one
  multi-language recognition pass.
- **Disclosure text** is shown on the config screen before the user can start (client-side OCR is
  slower/less accurate than a cloud service; nothing leaves the browser).
- **Per-page behavior, sequential, never parallel** (`ocrDocument.ts`):
  1. Skip-detection: if the page's existing pdf.js text content already has ≥20 non-whitespace
     characters, skip it (see §2 for why 20).
  2. Otherwise render the page to a 2000px-wide PNG (~300dpi-equivalent for a standard page width)
     and recognize it via a cached, per-language-combination Tesseract Web Worker.
  3. Record per-word text, confidence, and a normalized (0..1, top-left origin) bounding box.
- **Write-back (`bakeOcrTextLayer.ts`):** a separate step, run immediately after recognition
  finishes, draws every recognized word back onto the **original** PDF as invisible text (PDF text
  rendering mode 3 — "neither fill nor stroke"), positioned per-word from its bounding box, using
  one embedded Helvetica. Skipped pages are left completely untouched (no pass over them at all).
  Once baked, the invisible words are ordinary page content and survive any later
  merge/split/rotate.
- **Progress UI:** "Page X of Y — already has text, skipping…" or "…recognizing…", then
  "Finishing up…" during bake.
- **Output:** `{baseName}_ocr.pdf`, via `PreviewModal`.

### 1.7 Unlock (remove password)
- **Entry points (two, functionally different):**
  1. **Dedicated mega-menu "Unlock" tool.** Has its own hidden file `<input>`, completely separate
     from the normal upload input. Picking a file here **never** calls `addSource` — the decrypted
     result goes straight to `PreviewModal` as `{baseName}_unlocked.pdf` and never touches the
     page-plan store or Browse/Manage views. If the picked file turns out not to be encrypted, an
     error is shown ("isn't password-protected — there's nothing to unlock") rather than silently
     succeeding.
  2. **Transparent on every normal upload.** `App.tsx: handleFiles` probes every file
     (`probePdf`) before adding it to the store; an encrypted file triggers the same password-entry
     flow inline, and only the *decrypted* bytes are ever added as a `SourceDoc` — every downstream
     operation (autosave, build, compress, etc.) is therefore always working with plaintext.
- **Detection (`pdfUnlock.ts: probePdf`), two-layered:** pdf.js is authoritative for
  user-password-protected files — opening one raises a `PasswordException`. Owner-only /
  permissions-only encrypted files open *silently* in pdf.js (no exception), so the raw file bytes
  are additionally scanned for the literal 8-byte ASCII marker `/Encrypt` (always present
  unencrypted in the trailer, even in an encrypted file, since a reader needs it to locate the
  Encrypt dictionary) — `hasEncryptMarker()`. `pdf-lib` is deliberately **not** used for detection:
  it throws generic parse errors on encrypted files rather than a clean "this is encrypted" signal.
- **Password prompt behavior (`App.tsx: unlockFile`):** before ever showing a prompt, two
  passwords are tried silently: the password cached from earlier in this session
  (`sessionPassword`, in-memory only), then an empty string (unlocks owner-only files, which have
  no user password at all). Only if both fail does the visible prompt appear. The prompt allows
  unlimited retries (wrong-password just re-shows the prompt with a hint) and a "Skip this file"
  action that continues the rest of a multi-file batch without that file. A successfully-tried
  password is cached in memory for the rest of the session (tried silently on subsequent encrypted
  uploads) and is **never** persisted to any storage — cleared on Start Over.
- **Decryption:** `qpdf --decrypt --password=<pw> infile outfile` via qpdf-wasm.

### 1.8 Protect (add password)
- **Entry point:** mega-menu "Protect" (labelled "Add a password to a PDF"); no routed URL.
- **UI:** modal (`ProtectPanel.tsx`) — deliberately its own form, not a mode of `PasswordPrompt`
  (that component verifies an *existing* password with a retry loop; this one collects a *new*
  password with confirmation — different enough validation/copy that unifying them was judged not
  worth the added branching).
- **Fields:** Password, Confirm password (both maskable via a show/hide eye toggle). Validates
  non-empty and that the two fields match; inline errors shown only after the first submit attempt.
- **Encryption:** `qpdf --encrypt <password> <password> 256 -- infile outfile` — AES-256. **The
  owner password is always set equal to the user password.** There is no separate
  owner/permissions layer and no restriction flags are ever passed — the file has exactly one
  secret, and opening it anywhere (including this app's own Unlock tool) takes just that password.
- **Rejects up front (before calling qpdf):** an empty/whitespace-only password
  (`EmptyPasswordError`), and an already-encrypted input file (`AlreadyEncryptedError`, reusing
  `hasEncryptMarker` from `pdfUnlock.ts`) — protecting an already-protected file would either fail
  confusingly or silently nest encryption under a second password.
- **Preview quirk:** the browser can only render an encrypted PDF as its own native password
  prompt inside an `<iframe>`, which would be confusing right after the user just chose that exact
  password. `PreviewModal`'s `overlay` prop is used here (and *only* here) to cover the iframe with
  a plain "Your PDF is now password-protected — download it below" confirmation instead. The
  Download button still works normally underneath.
- **Output:** `{baseName}_protected.pdf`.

### 1.9 Watermark
- **Entry point:** mega-menu "Watermark"; no routed URL.
- **UI:** modal (`WatermarkPanel.tsx`). **Exactly one watermark can exist at a time** — reopening
  the panel loads and edits the existing one (matched by `docAnnotations.find(d => d.type ===
  'watermark')`); there is no way to add a second, independent watermark.
- **Two mutually exclusive modes, chosen via tabs:**
  - **Text:** text string (required, trimmed); Size 8–144pt (default 48); Color (hex color picker,
    default `#888888`); Angle −90°..90° (default 45°, via a slider). Drawn centered on the page,
    rotated about that center point, semi-transparent.
  - **Image:** upload a PNG or JPEG. The image is content-hashed and stored as a reusable `Asset`
    (§2 — re-uploading identical bytes reuses the same asset, doesn't duplicate storage). Drawn
    centered, scaled to exactly 50% of the page's width (aspect-ratio preserved), at the same
    opacity control as text mode.
  - **Opacity** (shared by both modes): 5–100% slider, default 15%.
- **Page range:** "All pages" (default) or a custom 1-based **From/To** range (validated
  `from ≤ to`; invalid ranges block the Apply button).
- **Live preview:** renders page 1 of the current document and overlays a CSS approximation of the
  exact bake geometry (§2 — three independent implementations of the same formula exist; see §7
  pain point).
- **Remove:** when editing an existing watermark, a destructive "Remove watermark" action deletes
  the `DocAnnotation` entirely.
- Applying dispatches `ADD_DOC_ANNOTATION` or `UPDATE_DOC_ANNOTATION` directly to the global store
  — there is no separate "apply"/build step; every subsequent Download/Split/Extract/Compress/OCR
  bakes the current watermark automatically via the shared pipeline (§2).

### 1.10 Page numbers
- **Entry point:** mega-menu "Page numbers"; no routed URL.
- **UI:** modal (`PageNumbersPanel.tsx`), structural twin of Watermark — exactly one page-number
  mark can exist at a time, reopening edits it.
- **Setting: Style (format string)** — three preset buttons, not free text:
  1. `{n}` — bare page number.
  2. `{n} / {total}` — **default**.
  3. A full sentence in the current UI language ("Page {n} of {total}" in English, "Trang {n} /
     {total}" in Vietnamese). **This is the one place in the whole app where a value picked at UI
     time is stored verbatim and never re-translated afterward** — see §2.
- **Setting: Position** — one of 4 corners (Top-left / Top-right / Bottom-left / Bottom-right,
  default Bottom-right), chosen via a 2×2 icon grid.
- **Setting: Size** — 6–36pt, default 12.
- **Setting: Margin** — 4–96pt (distance from the chosen edges), default 24.
- **Setting: Color** — hex picker, default `#666666`.
- **Page range:** identical control to Watermark's (All pages / custom From-To).
- **Live preview:** same page-1 render + CSS overlay approach as Watermark.
- **Remove:** same destructive action as Watermark.

### 1.11 Images to PDF
- **Entry point:** mega-menu "Images to PDF", or the routed URL `/images-to-pdf/`. **The only tool
  that bypasses the "a PDF must already be loaded" gate** — `App.tsx: applyTool` special-cases
  `imagesToPdf` to open before the `hasPages` check, since it starts from images, not a PDF. It
  fully replaces the main content area (not a modal) and needs no PDF session at all; an
  in-progress PDF session (if any) survives switching into and back out of this tool untouched.
- **Input:** drag-and-drop or click-to-browse, JPG/PNG only. Format is sniffed from magic bytes at
  embed time (`imagesToPdf.ts: isPng`/`isJpeg`), not trusted from file extension/MIME at the
  picker stage (accept filter is advisory only).
- **Staged image grid:** reorderable via the same `@dnd-kit` pattern as Manage pages (independently
  re-implemented, see §7). Per-image controls: rotate left/right 90° (cumulative, mod 360),
  enlarge (zoom modal), remove. Sort-by-name buttons: A→Z / Z→A, numeric-aware (`"img2"` sorts
  before `"img10"`).
- **Setting: Merge into one PDF** — checkbox, **default ON**.
- **Setting: Page size** — `Fit to image` / `A4` (**default**) / `Letter` / `Legal` / `A3` / `A5`.
- **Setting: Orientation** — `Auto` (**default**, landscape chosen automatically if the image is
  wider than tall) / `Portrait` / `Landscape`. **Disabled (greyed out) whenever Page size = "Fit to
  image"**, since that mode always fits the page to the image's own shape.
- **Setting: Margin** — `No margin` (**default**, 0pt) / `Small` (18pt) / `Big` (36pt).
- **Layout math (`imagesToPdf.ts: addImagePage`):**
  - *Fit to image:* the page is sized to the image (plus margin), 1 image pixel = 1 PDF point,
    **except** the longer edge is capped at 2384pt (≈33.1in, A0's short side) and the whole image
    scaled down proportionally past that — see §2 for why. Never upscaled.
  - *Standard sizes:* the image is contain-fit (scaled to fit within the margins, never cropped or
    stretched) and centered on the chosen page size/orientation.
  - Per-image rotation is applied via pdf-lib's `degrees()`, which rotates counter-clockwise about
    the draw origin — since the user's rotation control is clockwise, the code negates the angle
    and computes an offset origin per rotation case so the rotated bounding box still lands where
    the layout math expects it (`imagesToPdf.ts`, the `if (rotation === 90/180/270)` block).
- **Output:**
  - Merge ON (or only one image staged): a single PDF, `PDFChill_images.pdf`, via `PreviewModal`.
  - Merge OFF with multiple images: one PDF per image (name collisions within the batch, e.g.
    `scan.jpg` and `scan.png`, are suffixed `_2`, `_3`, …), zipped. `PreviewModal` shows the first
    PDF as a stand-in preview but its Download button is overridden (`onDownload`/`downloadLabel`
    props) to download the whole `.zip` instead.
- **State:** entirely local to this screen (`useImageList.ts`, a plain `useState`, object URLs
  managed/revoked manually). **Not part of the global store** — no autosave, no undo/redo, survives
  nothing across a reload.

### 1.12 Cross-cutting actions
- **Download:** assembles the full current page plan (`buildPdf`, baking any watermark/page
  numbers) and opens `PreviewModal`. `PreviewModal`'s own Download button prefers the File System
  Access API (`showSaveFilePicker`, Chromium-only) so the user can choose the exact save location
  with the generated name pre-filled; on browsers without that API (Firefox, Safari) it falls back
  to a plain `<a download>` click. A user-cancelled save dialog (`AbortError`) is treated as "do
  nothing," not as a fallback trigger.
- **Undo / Redo:** `Ctrl/Cmd+Z` (undo), `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` (redo), plus toolbar buttons
  in the `AppBar` (rendered only once a file is loaded). Shortcuts are suppressed while focus is
  inside an `<input>`/`<textarea>`/`contentEditable` element. See §3 for exactly what is undoable.
- **Start over:** resets the entire session (`RESET` action), closes any open tool, forgets the
  cached unlock password, and clears the IndexedDB autosave. Confirmation is asked via a dialog
  **only if a file is currently loaded**; clicking the logo behaves identically (same underlying
  `handleReset`), also gated on the same confirm-if-loaded rule.
- **Session recovery:** on load, if an IndexedDB-saved session exists and is ≤5 minutes old, a
  banner offers to restore it; older or absent sessions are silently ignored (§2).
- **Language switcher:** English/Vietnamese dropdown in the `AppBar`, always rendered (even with no
  file loaded). Selecting a language does a **real page navigation** to that language's URL for the
  current tool (§4), not an in-memory toggle.
