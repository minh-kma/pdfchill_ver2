## 3. Data Model

### 3.1 Core shapes (`src/shared/state/types.ts`)

```
SourceDoc      { id, name, bytes: Uint8Array, pageCount }
PageItem       { id, sourceId, sourceIndex, rotation: 0|90|180|270 }
DocAnnotation  { id, type: 'watermark' | 'pageNumber', range?: {from,to},
                 // watermark fields:
                 text?, assetId?, fontSize?, color?, opacity?, rotationDeg?,
                 // pageNumber fields:
                 format?, corner?: 'tl'|'tr'|'bl'|'br', margin? }
Asset          { mimeType: 'image/png' | 'image/jpeg', bytes: Uint8Array, hash }
AssetMap       Record<assetId, Asset>          // assetId === content hash
EditSnapshot   { pages: PageItem[], docAnnotations: DocAnnotation[] }
AppState       { sources, pages, docAnnotations, assets,
                 past: EditSnapshot[], future: EditSnapshot[],
                 busy: boolean, busyMessage: string }
```

- **The "page plan" model.** The app never edits a source PDF's bytes in place. `sources` is an
  append-only list of originally-uploaded files; `pages` is a separately-ordered list of
  `{sourceId, sourceIndex, rotation}` references into those sources. Merge = pages from multiple
  sources sharing one `pages` array. Delete = a page's entry removed from `pages` (its source stays
  in `sources`, byte-for-byte, so undo can restore it). Reorder = `pages`' array order *is* the
  output order. Nothing is written to a real output file until Download/Split/Extract/Compress/OCR
  explicitly assembles one via `pdfCore.copyPagesToPdf`.
- **`Rect`** (`{x,y,w,h}`, normalized 0..1, top-left origin, relative to a page's *unrotated* crop
  box) is a shared coordinate convention used by the dead OCR-adjacent code (Crop, Edit Text, Form
  fields — §6) and, independently reimplemented rather than reused, by `bakeOcrTextLayer.ts`'s
  word placement. It exists as a named type in `types.ts` even though only the OCR bake path
  currently uses the convention live.

### 3.2 Reducer & undo/redo (`src/shared/state/store.tsx`)

A single `useReducer` + React Context store (`StoreProvider`/`useStore`), immutable updates via
`immer`'s `produce`. There is exactly one `coreReducer` (pure state transitions, no history
bookkeeping) wrapped by one `reducer` (adds/consumes undo history) — `UNDO`/`REDO` are handled
entirely in the wrapper and never reach `coreReducer`.

**Undo granularity is "the whole edit slice," not per-field.** `editSlice(state)` snapshots
`{pages, docAnnotations}` together — undoing a watermark edit and undoing a page delete share one
linear history; there's no way to undo just one axis independently. This is a deliberate,
documented design, cheap in practice because immer's structural sharing means an unchanged nested
array/object keeps its old reference in the snapshot (no deep copy cost).

| Action | Undoable? | Why |
|---|---|---|
| `ADD_SOURCE` | ✅ | uploading pages is an edit |
| `DELETE_PAGE`, `ROTATE_PAGE`, `ROTATE_ALL`, `REORDER` | ✅ | page-plan edits |
| `ADD_DOC_ANNOTATION`, `UPDATE_DOC_ANNOTATION`, `DELETE_DOC_ANNOTATION` | ✅ | watermark/page-number edits |
| `ADD_ASSET` | ❌ | append-only, content-hashed — nothing to roll back to |
| `SET_BUSY` | ❌ | transient UI flag, not a document edit |
| `RESET`, `RESTORE` | ❌ | whole-session replacement, not an incremental edit |
| `UNDO`, `REDO` | n/a | handled outside `coreReducer` entirely |

History cap: 50 entries (`HISTORY_LIMIT`), oldest dropped first. A fresh undoable action always
clears the `future` (redo) stack.

### 3.3 What's *not* in the global store

**Images to PDF's staged image list is entirely separate, local component state**
(`useImageList.ts`, plain `useState` + a `useRef<Set<string>>` of object URLs cleaned up on
unmount). It has no autosave, no undo/redo, and is not part of `AppState` at all — a deliberate
choice ("this is a one-shot tool with no autosave and no undo/redo, so none of it belongs in the
page-plan state or its history," per the file's own comment). The in-progress PDF session (if any)
is untouched while this tool is open.

**`busy`/`busyMessage` live in the same `AppState`/reducer as the document data**, despite being
pure transient UI state with no undo/session-persistence relationship to `sources`/`pages` — see
§7 for the coupling this creates.
