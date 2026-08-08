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
| 6 | `compress` | optimize | `/compress-pdf/` | `ComingSoonTool` | Placeholder |
| 7 | `ocr` | optimize | `/ocr-pdf/` | `ComingSoonTool` | Placeholder |
| 8 | `image-to-pdf` | convert | `/image-to-pdf/` | `ComingSoonTool` | Placeholder |
| 9 | `watermark` | edit | `/watermark-pdf/` | `ComingSoonTool` | Placeholder |
| 10 | `protect` | security | `/protect-pdf/` | `ComingSoonTool` | Placeholder |
| 11 | `unlock` | security | `/unlock-pdf/` | `ComingSoonTool` | Placeholder |

Vietnamese routes are the same slugs under `/vi/` — e.g. `/vi/merge-pdf/`.

**5 of 11 implemented.** All five are the `organize` category and share one pipeline
([pdf-pipeline.md](pdf-pipeline.md)) and one session store
([state-and-undo.md](state-and-undo.md)).

---

## What exists for the implemented five

- `src/tools/organize/` — `OrganizeToolShell`, `BuildAction`, and the five tool components
  (12–20 lines each; only `SplitTool` has its own settings panel).
- Full workspace: thumbnail grid, drag-to-reorder, per-page rotate/delete, zoom modal, undo/redo.
- `PreviewModal` before every download; Split downloads a zip directly.
- Locale files for these five carry an `action` key on top of the four registry keys
  (`name`, `description`, `seoTitle`, `seoDescription`); Split also carries its panel keys.

## What exists for the other six

Registry row, route, nav entry, homepage card, SEO metadata, and `{en,vi}` locale files with the
four registry keys. Nothing else. Their locale files have **no** `action` key yet.

---

## What is missing repo-wide

These are absent from `package.json` and from `src/` entirely — do not write code that assumes
them, and do not document them as present:

- **qpdf-wasm** — needed by Protect, Unlock, and Compress's structural pass.
- **tesseract.js** — needed by OCR.
- Session autosave / recovery (IndexedDB), prerendering + `sitemap.xml`, ad units, accounts.

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
   independent single-purpose transform (Compress, OCR, Image-to-PDF), it does not need the page
   plan — but its output still goes through `PreviewModal`, and it still throws typed errors mapped
   by `toErrorKey()`.
4. Add the `action` key (and any panel keys) to **both** `locales/en/<id>.json` and
   `locales/vi/<id>.json`.
5. Update this file.
