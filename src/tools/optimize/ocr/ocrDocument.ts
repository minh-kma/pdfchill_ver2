/**
 * OCR stage 1: recognition. **This module never writes to a PDF** — it only reads pages and
 * returns what it found.
 *
 * `spec/edge-cases.md`: recognition and write-back are separately testable stages that happen to
 * always run together in the UI. Keeping them separable preserves the ability to test recognition
 * without a write-back dependency. `bakeOcrTextLayer.ts` is the other half.
 */

// Bundled and served same-origin, exactly like pdf.js's worker and qpdf's wasm. See the three
// `*Path` options below for why this one is a `?url` import while the other two are directories.
import tesseractWorkerUrl from 'tesseract.js/dist/worker.min.js?url';
import type { NormalizedRect } from '../../../shared/lib/geometry.ts';
import { getPageCount, getPageTextLength, renderPage } from '../../../shared/pdf/pdfRender.ts';

/**
 * A genuinely scanned page can still carry a few real short text objects — a page-number stamp, a
 * "Confidential" watermark, a signature block. Treating those as "has text" would skip OCR and
 * leave the actual scanned content unsearchable. 20 is comfortably above any such stray label but
 * well below even a sparse paragraph of real body text (`spec/edge-cases.md`).
 */
export const MIN_TEXT_LAYER_CHARS = 20;

/** ~300dpi-equivalent for a standard page width. Chosen independently of thumbnail widths. */
export const RENDER_WIDTH = 2000;

export const OCR_LANGUAGES = ['eng', 'vie'] as const;
export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

export interface OcrWord {
  readonly text: string;
  readonly confidence: number;
  /** Normalized 0..1, top-left origin — converted to PDF space by the bake stage. */
  readonly rect: NormalizedRect;
}

export interface OcrPageResult {
  readonly pageIndex: number;
  /** True when the page already had a text layer and was left alone. */
  readonly skipped: boolean;
  readonly words: readonly OcrWord[];
}

export interface OcrProgress {
  (update: { pageNumber: number; totalPages: number; skipped: boolean }): void;
}

/* --- Tesseract worker cache ----------------------------------------------------------------- */

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

/**
 * tesseract.js resolves its three runtime assets against cdn.jsdelivr.net unless every path is
 * given explicitly, so all three are set here. Leaving any one unset silently reintroduces a CDN
 * fetch — the exact thing CLAUDE.md §5 forbids, and the reason the app would otherwise stop
 * working offline and leak "this visitor ran OCR" to a third party.
 *
 * The directories are produced by `scripts/copyTesseractAssets.mjs` (a `predev`/`prebuild` step),
 * not by the bundler: the worker builds `${corePath}/tesseract-core-{variant}.wasm.js` and
 * `${langPath}/{lang}.traineddata.gz` by string concatenation, so those filenames must survive
 * verbatim and cannot be hashed `?url` imports. `worker.min.js` is referenced as one whole path,
 * so it can be — and is, which gets it content-hashed caching for free.
 *
 * All three are absolutised against the page. tesseract runs its worker from a `blob:` URL
 * (`workerBlobURL` defaults to true), and both `importScripts()` and `fetch()` inside that worker
 * resolve relative to the opaque blob URL rather than to the site root — so a root-relative
 * `/tesseract/...` would not resolve. This also keeps a sub-path deploy (Vite's `base`) working,
 * since BASE_URL is already baked into the strings below.
 *
 * Resolved on first use rather than at module scope, because `location` does not exist in Node and
 * this module is reachable from an import of the tool registry — which `scripts/prerender.mjs`
 * does, in Node, for every build. Module-init work here crashes the build.
 */
function tesseractPaths() {
  const sameOrigin = (path: string) => new URL(path, location.href).href;
  return {
    workerPath: sameOrigin(tesseractWorkerUrl),
    corePath: sameOrigin(`${import.meta.env.BASE_URL}tesseract/core`),
    langPath: sameOrigin(`${import.meta.env.BASE_URL}tesseract/tessdata`),
  };
}

/** Cached per language *combination* — switching languages must not reuse the wrong worker. */
const workers = new Map<string, Promise<TesseractWorker>>();

function getWorker(languages: readonly OcrLanguage[]): Promise<TesseractWorker> {
  // Multiple selections are joined with '+' and passed as one multi-language pass.
  const key = [...languages].sort().join('+');
  let worker = workers.get(key);
  if (!worker) {
    worker = import('tesseract.js').then(({ createWorker, OEM }) =>
      // The OEM is passed explicitly even though LSTM_ONLY is already the default: it decides
      // which core filename the worker asks for, and `copyTesseractAssets.mjs` ships only the
      // matching `-lstm` cores and `4.0.0_best_int` models. Changing it here without changing
      // that script's lists produces a 404 at the first OCR run, so the two are kept visible to
      // each other rather than one depending on an invisible default.
      createWorker(key, OEM.LSTM_ONLY, tesseractPaths()),
    );
    workers.set(key, worker);
    worker.catch(() => workers.delete(key));
  }
  return worker;
}

/** Frees every cached Tesseract worker. Called when the OCR screen unmounts. */
export async function releaseOcrWorkers(): Promise<void> {
  const pending = [...workers.values()];
  workers.clear();
  await Promise.all(
    pending.map((promise) => promise.then((worker) => worker.terminate()).catch(() => undefined)),
  );
}

/* --- Recognition ---------------------------------------------------------------------------- */

interface RenderedPage {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

async function renderPageToPng(
  sourceId: string,
  bytes: Uint8Array,
  pageIndex: number,
): Promise<RenderedPage> {
  const canvas = document.createElement('canvas');
  const controller = new AbortController();
  await renderPage({
    sourceId,
    bytes,
    pageIndex,
    rotation: 0,
    width: RENDER_WIDTH,
    canvas,
    signal: controller.signal,
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('page render produced no image');
  // Tesseract's bboxes are in this canvas's pixel space, so normalize against the real canvas
  // size — the renderer applies a device-pixel-ratio multiplier, so it is not RENDER_WIDTH.
  return { blob, width: canvas.width, height: canvas.height };
}

interface RawWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** tesseract.js only populates `words` when block output is requested. */
function extractWords(data: unknown): RawWord[] {
  const root = data as { words?: RawWord[]; blocks?: unknown[] };
  if (root.words?.length) return root.words;

  const words: RawWord[] = [];
  const walk = (nodes: unknown[] | undefined) => {
    for (const node of nodes ?? []) {
      const item = node as { words?: RawWord[]; paragraphs?: unknown[]; lines?: unknown[] };
      if (item.words?.length) words.push(...item.words);
      walk(item.paragraphs);
      walk(item.lines);
    }
  };
  walk(root.blocks);
  return words;
}

/**
 * Recognizes every page that needs it, **sequentially — never in parallel**
 * (`spec/features.md` §1.6). Pages that already carry a text layer are skipped outright.
 */
export async function ocrDocument(
  sourceId: string,
  bytes: Uint8Array,
  languages: readonly OcrLanguage[],
  onProgress?: OcrProgress,
  shouldStop?: () => boolean,
): Promise<OcrPageResult[]> {
  const totalPages = await getPageCount(sourceId, bytes);
  const results: OcrPageResult[] = [];

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    if (shouldStop?.()) break;

    const textLength = await getPageTextLength(sourceId, bytes, pageIndex);
    const skipped = textLength >= MIN_TEXT_LAYER_CHARS;
    onProgress?.({ pageNumber: pageIndex + 1, totalPages, skipped });

    if (skipped) {
      results.push({ pageIndex, skipped: true, words: [] });
      continue;
    }

    const { blob, width: imageWidth, height: imageHeight } = await renderPageToPng(
      sourceId,
      bytes,
      pageIndex,
    );
    const worker = await getWorker(languages);
    const { data } = await worker.recognize(blob, {}, { blocks: true });

    const words: OcrWord[] = extractWords(data)
      .filter((word) => word.text.trim().length > 0)
      .map((word) => ({
        text: word.text,
        confidence: word.confidence,
        rect: {
          x: word.bbox.x0 / imageWidth,
          y: word.bbox.y0 / imageHeight,
          w: (word.bbox.x1 - word.bbox.x0) / imageWidth,
          h: (word.bbox.y1 - word.bbox.y0) / imageHeight,
        },
      }));

    results.push({ pageIndex, skipped: false, words });
  }

  return results;
}
