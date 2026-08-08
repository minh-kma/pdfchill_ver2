# PDFChill — Behavioral & Technical Specification

PDFChill is a 100%-in-browser PDF toolkit: no backend, no accounts, and no file byte ever sent over
the network. This spec is the authoritative description of the product's behavior for the ground-up
rewrite in this repository. It is split by topic below so a task can load only the sections it
needs; section numbers are the original ones, so a cross-reference like "see §2" resolves via this
table.

| § | File | Covers |
|---|---|---|
| 1 | [spec/features.md](spec/features.md) | Every tool's entry points, UI, settings, parsing rules, outputs, and the cross-cutting Download / undo / start-over / session-recovery / language-switch actions. |
| 2 | [spec/edge-cases.md](spec/edge-cases.md) | The quirks each behavior depends on — compression floors and image screening, OCR thresholds, encryption detection, watermark geometry, asset hashing, persistence windows, routing/i18n traps, UI interaction rules, SEO/ad wiring. |
| 3 | [spec/data-model.md](spec/data-model.md) | Core shapes (`SourceDoc`, `PageItem`, `DocAnnotation`, `Asset`, `AppState`), the page-plan model, the reducer, and exactly what is undoable. |
| 4 | [spec/routing-seo.md](spec/routing-seo.md) | `ROUTED_TOOLS`, the static entry points, URL parsing, what every `<head>` carries, and language-detection order. |
| 5 | [spec/constraints.md](spec/constraints.md) | What must never change (no backend, never auto-download, storage keys, translated errors) — plus the original document preamble: how this spec was produced, and what PDFChill is built from. |
| 6 | [spec/dead-code.md](spec/dead-code.md) | Code present in the old tree that is unreachable and must not be carried forward or reconstructed from git history. |
| 7 | [spec/maintainability.md](spec/maintainability.md) | The ten file-anchored pain points in the old codebase, each with a fix direction the rewrite should follow. |

Notes on the split:

- Content was moved verbatim; every line of the original lives in exactly one file above.
- The preamble's claim that "no other file needs to be consulted" was written before this split and
  now means the spec set as a whole.
- `ARCHITECTURE.md` is the companion document: it describes how the *rewrite* is structured and how
  to extend it, whereas this spec describes what the product must do.
