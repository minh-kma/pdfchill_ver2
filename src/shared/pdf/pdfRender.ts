/**
 * pdf.js — **display only**. Nothing in this module ever produces output bytes; every PDF the app
 * writes comes from pdf-lib via `shared/lib/pdfCore.ts` (SPEC.md: pdf.js is "rendering-only work").
 *
 * Parsed documents are cached by source id so a 40-page thumbnail grid parses each file once, and
 * released when their source leaves the session.
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';
// Bundled and served same-origin (a `?url` import, not a CDN) so the app keeps working offline
// after first load — SPEC.md §5.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | undefined;

async function getPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return pdfjsPromise;
}

/* --- Document cache ------------------------------------------------------------------------ */

const documents = new Map<string, Promise<PDFDocumentProxy>>();

function loadDocument(sourceId: string, bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const existing = documents.get(sourceId);
  if (existing) return existing;

  const promise = getPdfjs().then((pdfjs) =>
    // A copy: pdf.js transfers the buffer to its worker, which would detach the Uint8Array the
    // store keeps for pdf-lib.
    pdfjs.getDocument({ data: bytes.slice() }).promise,
  );

  documents.set(sourceId, promise);
  // A failed parse must not poison the cache for a later retry.
  promise.catch(() => documents.delete(sourceId));
  return promise;
}

/** Destroys every cached document whose source is no longer in the session. */
export function releaseDocumentsExcept(activeSourceIds: ReadonlySet<string>): void {
  for (const [sourceId, promise] of documents) {
    if (activeSourceIds.has(sourceId)) continue;
    documents.delete(sourceId);
    // Tearing down the loading task is what shuts the worker's copy of the file down; the proxy
    // itself has no destroy() in pdf.js v6.
    void promise.then((doc) => doc.loadingTask.destroy()).catch(() => undefined);
  }
}

export function releaseAllDocuments(): void {
  releaseDocumentsExcept(new Set());
}

/** Page count, via the same cached document the renderer uses. */
export async function getPageCount(sourceId: string, bytes: Uint8Array): Promise<number> {
  const doc = await loadDocument(sourceId, bytes);
  return doc.numPages;
}

/**
 * Non-whitespace character count of a page's existing text layer.
 *
 * OCR's skip-detection reads this. Still display-side work: it inspects the document, it never
 * writes one.
 */
export async function getPageTextLength(
  sourceId: string,
  bytes: Uint8Array,
  pageIndex: number,
): Promise<number> {
  const doc = await loadDocument(sourceId, bytes);
  const page = await doc.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  let count = 0;
  for (const item of content.items) {
    if ('str' in item) count += item.str.replace(/\s/g, '').length;
  }
  return count;
}

/* --- Render queue -------------------------------------------------------------------------- */

/**
 * Rendering every thumbnail at once floods the worker and makes the first paint slower than
 * rendering them in a short queue does.
 */
const MAX_CONCURRENT_RENDERS = 4;
let active = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT_RENDERS) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
}

function releaseSlot(): void {
  active -= 1;
  waiting.shift()?.();
}

export interface RenderPageOptions {
  readonly sourceId: string;
  readonly bytes: Uint8Array;
  /** 0-based index within the source document. */
  readonly pageIndex: number;
  /** User-added rotation; combined with the page's own /Rotate, matching the bake (SPEC.md §2). */
  readonly rotation: number;
  /** Target CSS width in px; the canvas is rendered at device pixel ratio above that. */
  readonly width: number;
  readonly canvas: HTMLCanvasElement;
  readonly signal: AbortSignal;
}

/**
 * Renders one page into a canvas. Aborting cancels the pdf.js render task rather than letting a
 * stale frame land in a canvas that has since been reused for another page.
 */
export async function renderPage(options: RenderPageOptions): Promise<void> {
  const { sourceId, bytes, pageIndex, rotation, width, canvas, signal } = options;

  const doc = await loadDocument(sourceId, bytes);
  if (signal.aborted) return;

  const page = await doc.getPage(pageIndex + 1);
  if (signal.aborted) return;

  // `rotation` on getViewport is absolute (it defaults to the page's own /Rotate), so the total
  // is what gets passed — the same addition `copyPagesToPdf` performs when writing the real file.
  const total = ((page.rotate + rotation) % 360 + 360) % 360;
  const unscaled = page.getViewport({ scale: 1, rotation: total });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: (width * dpr) / unscaled.width, rotation: total });

  await acquireSlot();
  try {
    if (signal.aborted) return;

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;

    const task = page.render({ canvas, viewport });
    const onAbort = () => task.cancel();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      await task.promise;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  } catch (error) {
    // A cancelled render is the expected outcome of aborting, not a failure worth surfacing.
    if (!signal.aborted) throw error;
  } finally {
    releaseSlot();
  }
}
