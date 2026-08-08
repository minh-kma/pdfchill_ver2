# Architecture — the registry pattern

Cross-cutting structure and the rules that keep it from drifting. Domain detail lives in the
sibling docs: [pdf-pipeline.md](pdf-pipeline.md), [state-and-undo.md](state-and-undo.md),
[routing-i18n.md](routing-i18n.md). Current implementation status:
[tool-status.md](tool-status.md).

---

## 1. The registry

`src/toolRegistry.ts` is the single source of truth for every tool's identity. One row per tool:

```ts
{ id: 'merge', category: 'organize', slug: 'merge-pdf', icon: MergeIcon, Component: MergeTool }
```

Everything else about that tool is **derived**, not restated:

| Derived thing | Derived how | Consumer |
|---|---|---|
| Route `/merge-pdf/`, `/vi/merge-pdf/` | `slug` + `buildPath()` | `shared/router/useRoute.ts`, `App.tsx` |
| Nav dropdown entry, under its category | `toolsByCategory()` | `shared/components/AllToolsMenu.tsx` |
| Homepage filter tabs | `CATEGORIES` | `pages/HomePage.tsx` |
| Homepage card | `TOOLS` | `pages/HomePage.tsx` → `ToolCard.tsx` |
| Display name / description | `nameKey`/`descriptionKey` = `` `${id}:name` `` etc. | anywhere via `t()` |
| `<title>` / `<meta description>` / canonical / hreflang | `seoTitleKey`/`seoDescriptionKey` | `shared/seo/useDocumentMeta.ts` |
| i18n namespace | `i18nNamespace` = `id` | `locales/{en,vi}/{id}.json` |
| The page component | `Component`, given `{ tool }` as props | `App.tsx` |

Exported lookups: `TOOLS`, `CATEGORIES`, `TOOL_CATEGORY_IDS`, `findToolBySlug()`,
`findToolById()`, `toolsByCategory()`. `ToolId` and `ToolCategory` are derived types — you cannot
add a tool id or category without the registry knowing about it.

The rule this enforces: **a tool's id, category, slug, display copy or icon must never appear in a
second place.** `grep -rn "merge-pdf" src/` returns exactly one line — the registry row. If a change
you are making would make it return two, the change is wrong.

Why it matters: in the old codebase, adding a tool meant four unchecked edits to a 730-line
`App.tsx` plus lockstep updates to `routes.ts`, two static HTML files, `sitemap.xml` and
`seo.json`, with nothing verifying they agreed (`spec/routing-seo.md`, `spec/maintainability.md`
pain points #1 and #2). A tool could compile cleanly and still never open, and SEO copy drifted
between its two homes and shipped a production bug. Here there is one home per fact.

---

## 2. Adding a tool

Four steps. No other file needs to be touched — not `App.tsx`, not the nav bar, not the homepage.

**1. Add an icon** to `src/shared/components/icons.tsx`:

```tsx
export const CropIcon: IconComponent = (props) => (
  <Svg {...props}>{/* 24×24 stroke paths */}</Svg>
);
```

**2. Add one row** to `TOOL_SEEDS` in `src/toolRegistry.ts` (position in the array = display order
within its category):

```ts
{ id: 'crop', category: 'edit', slug: 'crop-pdf', icon: CropIcon, Component: ComingSoonTool },
```

- `id` — kebab-case, stable forever; it names the i18n namespace, so renaming it renames a file.
- `category` — must be one of `TOOL_CATEGORY_IDS`. TypeScript enforces this.
- `slug` — the URL segment. Lowercase, no slashes. It is public and indexable: changing it later
  costs a redirect.
- `Component` — leave as `ComingSoonTool` until the real implementation exists.

**3. Add the two locale files.** Both are required and must have all four keys — a missing `vi`
file silently falls back to English copy:

`src/shared/i18n/locales/en/crop.json`
```json
{
  "name": "Crop PDF",
  "description": "Trim the margins off your pages.",
  "seoTitle": "Crop a PDF online — free | PDFChill",
  "seoDescription": "Trim page margins from a PDF. Free, no uploads — everything runs in your browser."
}
```

`src/shared/i18n/locales/vi/crop.json` — same four keys, Vietnamese values.

No registration step: namespaces are discovered from the filenames by `import.meta.glob` in
`src/shared/i18n/index.ts`.

**4. When the real tool is built**, create `src/tools/<category>/CropTool.tsx`:

```tsx
import type { ToolPageProps } from '../../toolRegistry.ts';

export function CropTool({ tool }: ToolPageProps) { /* … */ }
```

and change that one registry row's `Component` to it. A tool page receives its own registry entry
as a prop, so it never restates its own name, icon or id.

If the tool edits pages, build it on the shared pipeline ([pdf-pipeline.md](pdf-pipeline.md))
rather than from scratch — a page-manipulation tool is usually ~15 lines:

```tsx
<OrganizeToolShell tool={tool}>
  <BuildAction labelKey="crop:action" suffix="cropped" />
</OrganizeToolShell>
```

It will also need `action` in its locale files, plus any keys its own settings panel uses.

**Verify:** `npm run build` (typechecks and builds). Then check the tool appears in the "All PDF
Tools" dropdown under the right category, on the homepage grid, under its category filter tab, and
that `/crop-pdf/` and `/vi/crop-pdf/` both render it with the right language and `<title>`.

### Adding a new category

Two edits: append the id to `TOOL_CATEGORY_IDS` in `src/toolRegistry.ts` (array order = tab and
dropdown order), and add `categories.<id>` to `locales/en/common.json` and
`locales/vi/common.json`. An empty category is skipped automatically by `toolsByCategory()`.

---

## 3. File map

```
src/
  toolRegistry.ts              ← THE registry: 11 rows, categories, derived lookups
  App.tsx                      ← the entire routing table (home / registry entry / not-found)
  main.tsx                     ← i18n bootstrap, then render
  index.css                    ← Tailwind entry
  pages/
    HomePage.tsx               ← hero + client-side filter tabs + card grid (from registry)
    NotFoundPage.tsx
  tools/
    ComingSoonTool.tsx         ← placeholder for the six unimplemented tools
    organize/
      OrganizeToolShell.tsx    ← heading + file input + Workspace + the tool's action area
      BuildAction.tsx          ← assemble the plan → PreviewModal (Merge/Reorder/Delete/Rotate)
      MergeTool.tsx  SplitTool.tsx  ReorderTool.tsx  DeletePagesTool.tsx  RotateTool.tsx
  shared/
    lib/
      routes.ts                ← THE path parser: parseLocation / buildPath. React-free.
      language.ts              ← SUPPORTED_LANGUAGES, toSupportedLanguage, preference storage
      pdfCore.ts               ← THE assembly pipeline: readSource / copyPagesToPdf / splitPdf
      splitRanges.ts           ← pure "split after pages" parsing (spec/features.md §1.2)
      rotation.ts              ← normalizeRotation, dependency-free
      download.ts              ← savePdf (File System Access + fallback), downloadBlob
      errorKeys.ts             ← typed error class → translation key
      ids.ts                   ← session-local id generation
    state/
      types.ts                 ← SourceDoc, PageItem, EditSnapshot, AppState
      store.tsx                ← immer reducer + undo/redo history + context
      useUndoRedoShortcuts.ts  ← global Ctrl/Cmd+Z / Shift+Z / Ctrl+Y
      useAddSources.ts         ← file → readSource → ADD_SOURCE, with translated errors
    pdf/
      pdfRender.ts             ← pdf.js: display only. Doc cache + release + render queue.
    router/
      navigation.ts            ← history push + subscribe (no URL interpretation)
      useRoute.ts              ← URL → { home | tool | notFound }
      Link.tsx
    i18n/
      index.ts                 ← i18next init; namespaces auto-discovered from locale filenames
      detectLanguage.ts        ← path → localStorage → navigator → en
      useLanguage.ts           ← the only sanctioned reader of the active language
      locales/{en,vi}/*.json   ← one file per tool (id.json) + common / nav / home / workspace
    seo/useDocumentMeta.ts
    components/
      AppBar.tsx               ← logo + the one dropdown + language links
      AllToolsMenu.tsx         ← "All PDF Tools", grouped by category, from registry
      ToolCard.tsx
      LanguageSwitcher.tsx
      Footer.tsx
      FileDropzone.tsx         ← drag-drop / click-to-browse PDF input
      PreviewModal.tsx         ← the mandatory review step before any download
      ErrorBanner.tsx
      icons.tsx                ← one icon per tool + chrome icons
      workspace/
        Workspace.tsx          ← THE page grid: dnd reorder, toolbar, undo/redo buttons
        PageThumb.tsx          ← sortable card + per-page rotate/delete/enlarge
        PageZoom.tsx           ← full-screen single page, 20–300% zoom
        PageCanvas.tsx         ← the one place a page is drawn to a canvas
```

---

## 4. Invariants

Break these and something silently drifts:

1. **One path parser.** `shared/lib/routes.ts`. No second `pathname.split('/')`.
2. **One home per tool fact.** Identity/category/slug/icon/component in `toolRegistry.ts`; display
   and SEO copy in that tool's locale files. Nowhere else.
3. **`buildPath()` builds every URL.** No hand-concatenated paths.
4. **Only `LanguageSwitcher` writes the language preference.** Detection is read-only.
5. **Language comparisons go through `toSupportedLanguage()` / `useLanguage()`**, never raw
   `i18n.language`.
6. **The homepage filter never touches the URL.**
7. **The nav bar has exactly one dropdown.** No featured or quick-access tool links beside it.
8. **No `position: fixed` click-catching backdrops inside `AppBar`** — its `backdrop-blur` makes it
   the containing block for fixed descendants, so such a backdrop is trapped in the header's own box
   and never receives clicks on the page below (`spec/edge-cases.md`). Use a `mousedown` document
   listener, as `AllToolsMenu` does.
9. **`copyPagesToPdf()` is the only code that writes PDF bytes.** No tool assembles a document on
   its own.
10. **pdf.js never writes output**, and pdf-lib never renders. Display and assembly stay separate.
11. **Rotation is additive, never replacing**, everywhere — the bake and the thumbnail viewport
    compute the same `source /Rotate + user rotation`.
12. **Deleting a page never removes its `SourceDoc`.**
13. **Nothing auto-downloads.** Results go through `PreviewModal`; Split's zip is the one
    documented exception.
14. **Users never see `err.message`.** Throw a typed error; map it with `toErrorKey()`.

---

## 5. Deliberately not built yet

Compress, OCR, Image to PDF, Watermark, Add/Remove password (still `ComingSoonTool`); session
autosave and recovery; prerendering + `sitemap.xml`; ads; accounts. Nothing above assumes their
absence — a login feature, for instance, would slot into `AppBar` without touching the registry,
and `StoreProvider` already takes an `initial` state for session recovery to hydrate.
