/**
 * THE PDF assembly pipeline. Every tool that produces PDF bytes goes through `copyPagesToPdf()`.
 *
 * SPEC.md §2: "One shared bake pipeline, reached only through `copyPagesToPdf`… Never implement a
 * new page-drawing feature as an isolated function that bypasses this pipeline." Merge, Reorder,
 * Delete pages, Rotate and Split are all the *same* operation over a page plan — they differ only
 * in how the plan was edited beforehand and how the result is packaged:
 *
 *   merge   = pages from several sources sharing one plan
 *   reorder = the plan's array order
 *   delete  = a page simply absent from the plan
 *   rotate  = a page's `rotation`, added to its source /Rotate
 *   split   = the same build, run once per contiguous slice of the plan
 *
 * pdf-lib is imported dynamically so it stays out of the homepage bundle.
 */

import type { PDFDocument } from 'pdf-lib';
import { normalizeRotation } from './rotation.ts';
import { createId } from './ids.ts';
import { type BakeInput, bakePage, createBakeContext, isBakeEmpty } from './annotationBake.ts';
import type { PageItem, SourceDoc } from '../state/types.ts';

/* --- Errors -------------------------------------------------------------------------------- */

/**
 * Typed errors, per SPEC.md §5: logic-layer modules throw these as developer diagnostics; the UI
 * boundary pattern-matches the class to pick a translated string and never renders `err.message`.
 */
export class InvalidPdfError extends Error {
  constructor(readonly fileName: string) {
    super(`Not a readable PDF: ${fileName}`);
    this.name = 'InvalidPdfError';
  }
}

export class EncryptedPdfError extends Error {
  constructor(readonly fileName: string) {
    super(`Password-protected PDF: ${fileName}`);
    this.name = 'EncryptedPdfError';
  }
}

export class EmptyPlanError extends Error {
  constructor() {
    super('No pages to assemble');
    this.name = 'EmptyPlanError';
  }
}

/* --- Encryption detection ------------------------------------------------------------------ */

/** ASCII "/Encrypt". */
const ENCRYPT_MARKER = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74] as const;

/**
 * Raw byte-scan for the `/Encrypt` trailer marker (SPEC.md §2). It is present unencrypted even in
 * an encrypted file, because a reader needs it to locate the Encrypt dictionary — which makes it
 * the only signal that catches owner-only/permissions-only files.
 *
 * Used here strictly to *explain* a load failure, never to reject a file that loaded fine: the
 * literal bytes could in principle occur inside an ordinary content stream, and a false reject
 * would be worse than a slightly vague error. The Unlock tool (later step) will pair this with
 * pdf.js's `PasswordException` as SPEC.md describes.
 */
export function hasEncryptMarker(bytes: Uint8Array): boolean {
  const first = ENCRYPT_MARKER[0];
  outer: for (let i = 0; i <= bytes.length - ENCRYPT_MARKER.length; i += 1) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < ENCRYPT_MARKER.length; j += 1) {
      if (bytes[i + j] !== ENCRYPT_MARKER[j]) continue outer;
    }
    return true;
  }
  return false;
}

/* --- Reading a source ---------------------------------------------------------------------- */

export interface LoadedSource {
  readonly source: SourceDoc;
  /** One plan entry per page of the file, in file order, unrotated. */
  readonly pages: readonly PageItem[];
}

/**
 * Parses uploaded bytes into the page-plan model exactly once. Callers keep the returned
 * `SourceDoc.bytes` for the rest of the session; nothing re-reads the file.
 *
 * Takes bytes rather than a `File` because the upload path has already read them to probe for
 * encryption — and, when the file was encrypted, what arrives here is the *decrypted* bytes.
 */
export async function readSource(bytes: Uint8Array, fileName: string): Promise<LoadedSource> {
  const { PDFDocument } = await import('pdf-lib');

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch {
    // pdf-lib throws generic parse errors on encrypted input (SPEC.md §2), so the marker decides
    // which of the two user-facing messages is right.
    throw hasEncryptMarker(bytes) ? new EncryptedPdfError(fileName) : new InvalidPdfError(fileName);
  }

  const pageCount = doc.getPageCount();
  if (pageCount === 0) throw new InvalidPdfError(fileName);

  const source: SourceDoc = { id: createId('src'), name: fileName, bytes, pageCount };
  const pages: PageItem[] = Array.from({ length: pageCount }, (_, index) => ({
    id: createId('pg'),
    sourceId: source.id,
    sourceIndex: index,
    rotation: 0,
  }));

  return { source, pages };
}

/* --- Assembly ------------------------------------------------------------------------------ */

export interface PagePlan {
  readonly sources: readonly SourceDoc[];
  readonly pages: readonly PageItem[];
  /**
   * Document-level marks to bake in. Required, not optional, on purpose: making it optional would
   * let a new export path silently omit the watermark, which is exactly the guarantee
   * `spec/edge-cases.md` asks the shared pipeline to enforce. Pass `EMPTY_BAKE` when there are none.
   */
  readonly bake: BakeInput;
}

/** No marks. Explicit so a caller states its intent rather than forgetting a field. */
export const EMPTY_BAKE: BakeInput = { docAnnotations: [], assets: {} };

/**
 * Copies the plan's pages into a fresh document, **one page at a time, in plan order**.
 *
 * Order matters: the plan array order *is* the output order (SPEC.md §1.4), so pages are appended
 * individually rather than batch-copied per source. Deleted pages need no handling — they are
 * simply not in the plan.
 *
 * Rotation is **additive, not replacing** (SPEC.md §2): the user's rotation stacks on top of
 * whatever /Rotate the source page already carried.
 */
export async function copyPagesToPdf(plan: PagePlan): Promise<Uint8Array> {
  if (plan.pages.length === 0) throw new EmptyPlanError();

  const pdfLib = await import('pdf-lib');
  const { PDFDocument, degrees } = pdfLib;
  const out = await PDFDocument.create();

  const sourcesById = new Map(plan.sources.map((source) => [source.id, source]));
  const loaded = new Map<string, PDFDocument>();

  // The bake runs inside this loop, so every regenerated output — Download, Split, anything built
  // later — carries the same marks. There is no second drawing path (`spec/edge-cases.md`).
  const bakeContext = isBakeEmpty(plan.bake)
    ? undefined
    : createBakeContext(pdfLib, out, plan.bake);

  for (const item of plan.pages) {
    let doc = loaded.get(item.sourceId);
    if (!doc) {
      const source = sourcesById.get(item.sourceId);
      if (!source) continue; // Plan entry pointing at a source that is gone: skip, don't crash.
      doc = await PDFDocument.load(source.bytes);
      loaded.set(item.sourceId, doc);
    }

    const [copied] = await out.copyPages(doc, [item.sourceIndex]);
    if (!copied) continue;
    copied.setRotation(degrees(normalizeRotation(copied.getRotation().angle + item.rotation)));
    out.addPage(copied);

    // Marks are drawn after rotation is applied, so they sit on the page as the user sees it.
    if (bakeContext) await bakePage(bakeContext, copied, out.getPageCount());
  }

  if (out.getPageCount() === 0) throw new EmptyPlanError();
  return out.save();
}

/** The whole plan as one document — what every tool's Download action produces. */
export function buildPdf(plan: PagePlan): Promise<Uint8Array> {
  return copyPagesToPdf(plan);
}

/** 1-based, inclusive page range over the *plan*, not over any single source. */
export interface PageRange {
  readonly start: number;
  readonly end: number;
}

export interface SplitPart {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/**
 * One document per range, each built through `copyPagesToPdf` so split output is identical to what
 * Download would have produced for those pages. Does not mutate the plan (SPEC.md §1.2).
 *
 * Naming is SPEC.md §1.2's: `{baseName}_part{index}_p{start}-{end}.pdf`, 1-based throughout.
 */
export async function splitPdf(
  plan: PagePlan,
  ranges: readonly PageRange[],
  baseName: string,
): Promise<SplitPart[]> {
  const parts: SplitPart[] = [];
  for (const [index, range] of ranges.entries()) {
    const bytes = await copyPagesToPdf({
      sources: plan.sources,
      pages: plan.pages.slice(range.start - 1, range.end),
      // Marks are baked into every part, same as Download would produce for those pages.
      bake: plan.bake,
    });
    parts.push({ name: `${baseName}_part${index + 1}_p${range.start}-${range.end}.pdf`, bytes });
  }
  return parts;
}

/** Filename stem of the first source, used for every generated name. */
export function planBaseName(plan: PagePlan): string {
  const first = plan.sources[0];
  if (!first) return 'document';
  return first.name.replace(/\.pdf$/i, '') || 'document';
}
