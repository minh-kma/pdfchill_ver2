## 7. Maintainability Pain Points

Concrete, file-anchored risk areas — what makes it easy to change A and silently break B in the
current code, and what a cleaner structure needs to prevent recurrence.

1. **`App.tsx` is a 730-line orchestrator God component with no enforced checklist for adding a
   tool.** It owns file upload, password/decrypt flow, session autosave/recovery wiring, global
   undo/redo keyboard handling, the entire `mainMode` tool-routing state machine, the
   build/download flow, reset/confirm logic, *and* inline-renders all ten-plus modal panels as
   JSX conditionals plus two separate hidden `<input type=file>` elements. Adding a new tool
   currently means editing this one file in at least four unrelated places (the `MainMode` union,
   the `pendingTool` effect's if/else chain, a new JSX conditional block, plus an import) —
   `toolCatalog.ts`'s `ToolIntent` union is exhaustiveness-checked by TypeScript, but none of these
   four App.tsx touchpoints are, so a new intent can compile cleanly while its panel silently never
   opens. **Fix direction:** a data-driven tool-panel registry (map `ToolIntent → { component,
   requiresPdf, opensAsModal }`) that `App.tsx` iterates over, so adding a tool is one entry in one
   table instead of four scattered edits.

2. **The SEO `<title>`/`<meta description>` duplication is exactly the bug class that motivated
   this rewrite, and it is still architecturally unresolved.** The same copy is authored
   independently in 10 static HTML `<head>` blocks and in `seo.json` (en/vi) — nothing links them,
   nothing warns if they drift, and the only enforcement is a code comment ("Edit both, or a tab
   title drifts"). **Fix direction:** generate both from one source (a small build-time script that
   reads `seo.json` and injects `<head>` values into HTML templates, or a template engine in the
   Vite build), so there is structurally only one place to edit.

3. **The Google AdSense verification tag is hand-duplicated, byte-for-byte, across all 10 static
   HTML files with zero centralization** — unlike the Adsterra units, which are correctly
   centralized behind `adsConfig.ts` flags and injected once from `ads.ts`. Changing the publisher
   ID means editing 10 files by hand with no build-time check they still match. Same failure shape
   as #2; same fix direction (template generation) would resolve both at once.

4. **`CompressPanel.tsx` contains non-trivial, untestable domain logic that belongs in
   `compressPdf.ts`.** The "is this session pristine" check, the three-way baseline/assembled/
   result size comparison, and the "which detail message to show" branching (`CompressPanel.tsx`,
   roughly lines 69–120) are pure logic wearing a React component as its only interface — there is
   no way to unit-test "given these three byte-lengths and this `pristine` flag, which one wins"
   without mounting the component. **Fix direction:** extract a pure `pickCompressResult(baseline,
   assembled, compressed): {bytes, usedOurs}` function into the logic layer.

5. **The exact same normalized-rect ↔ pdf-lib-rect coordinate conversion (`toRect`) is hand-copied
   into at least four files** (`annotationBake.ts`, `bakeOcrTextLayer.ts`, and the two dead modules
   `cropPages.ts`/`editText.ts`, plus an inverse-direction copy in the dead `formFields.ts`), each
   annotated "mirrors annotationBake.ts's toRect" rather than importing a shared function. Same
   pattern for a hex-color parser (`annotationBake.ts` and the dead `editText.ts` both hand-roll an
   identical one). Nothing would catch these silently drifting apart if the coordinate convention
   ever changed in one place but not the others. **Fix direction:** one shared
   `shared/lib/geometry.ts` (rect conversion) and `shared/lib/color.ts` (hex parsing), imported
   everywhere instead of copy-pasted.

6. **The exact same watermark/page-number drawing geometry is independently implemented three
   times**: the real bake (`annotationBake.ts`), the on-page CSS overlay
   (`DocMarksOverlay.tsx`), and *again*, separately, inline inside each of
   `WatermarkPanel.tsx`/`PageNumbersPanel.tsx`'s own live-preview JSX. A future change to a single
   visual rule (e.g. watermark image scale from 50% to 40% of page width, or a new corner option)
   requires finding and correctly updating three unrelated files with no shared constant, no shared
   function, and no test that would catch a miss — only prose comments ("mirrors the bake") holding
   them in sync. **Fix direction:** a single geometry-description function that both the bake path
   and any preview path consume (even if the preview renders it via CSS and the bake via pdf-lib,
   the *numbers* — position, scale, rotation — should be computed once).

7. **The qpdf-wasm invocation pattern (dynamic import behind code-splitting, single-use module
   instance, `FS.writeFile`/`readFile`, try/catch around Emscripten's `exit()`-via-`callMain()`) is
   deliberately triplicated** across `pdfUnlock.ts`, `protectPdf.ts`, and `optimizeStructure.ts`,
   each pointing at the others in a comment rather than sharing code. This was an explicit choice
   in the current codebase, not an oversight — but it means any future correction to how qpdf
   failure/success is detected (currently: "success is decided by whether `readFile(output)`
   returns non-empty bytes, since `callMain` always appears to throw") has to be manually applied
   in three places with no compiler or test enforcing they stay consistent. **Fix direction:** a
   shared `runQpdf(inputBytes, args): Promise<Uint8Array | null>` helper, with the three call sites
   reduced to "what args do I pass."

8. **`PageStage.tsx` exports three zoom-state hooks whose ownership semantics differ in ways only
   documented in prose, not in their type signatures**: `usePageStage` owns its own zoom and resets
   it whenever the shown page changes; `useZoom` is bare shared state with no reset behavior at
   all; `usePageRender` takes zoom as a plain prop and owns none of it. A future caller reaching
   for the "obviously right" hook by name alone can easily get N independent zooms where one shared
   zoom was wanted, or vice versa. **Fix direction:** rename to make the ownership explicit in the
   API (e.g. `useOwnZoomResetOnPageChange` vs `useSharedZoom`), or split into clearly separate
   modules.

9. **`features/convert/images-to-pdf/{ImageCard,ImageZoom}.tsx` intentionally duplicate
   `features/page-management/workspace/{PageThumb,PageZoom}.tsx`'s entire drag-and-drop-thumbnail-
   with-toolbar pattern** rather than sharing it, per an explicit in-file comment reasoning that
   sibling feature modules must not import from each other. That module-boundary rule is
   reasonable, but it currently means the *same* dnd-kit sensor configuration (6px pointer
   activation distance, 150ms/6px touch activation), the *same* zoom-modal chrome (Escape-to-close,
   body-scroll-lock, backdrop-click-to-close), and the *same* hover-icon-toolbar layout live as two
   independently-maintained copies with no shared base — a UX tweak to one (e.g. changing the drag
   activation distance) has to be remembered and manually repeated in the other, with nothing to
   catch a miss. **Fix direction:** if per-feature isolation is worth keeping, extract the
   *generic* pieces (a `useDragSensors()` hook, a `ZoomModalChrome` shell) into `shared/`, which
   both feature modules may depend on without depending on each other.

10. **`AppState` mixes two unrelated lifecycles behind one reducer/context/hook.** The
    document-editing slice (`sources`/`pages`/`docAnnotations`/`assets` — autosaved, undoable, the
    actual product state) and a purely transient UI flag (`busy`/`busyMessage`) are stored,
    dispatched, and subscribed to identically via one `useStore()`. Any component that only cares
    about the busy spinner re-renders on every page-plan mutation and vice versa, and nothing in
    the type system stops a future action from being added to `UNDOABLE` (a runtime `Set` literal,
    checked only by string comparison against `action.type`) incorrectly, or from being left out of
    it by mistake. **Fix direction:** split transient UI state into its own small store/hook,
    separate from the persisted, undoable document-session store.
