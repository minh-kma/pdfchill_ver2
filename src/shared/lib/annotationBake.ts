/**
 * The single place document-level marks are drawn for real output.
 *
 * `spec/edge-cases.md`: "One shared bake pipeline, reached only through `copyPagesToPdf`… a mark
 * set once is guaranteed to appear identically everywhere the PDF is regenerated. **Never
 * implement a new page-drawing feature as an isolated function** that bypasses this pipeline."
 *
 * Accordingly this module is called from exactly one place — `pdfCore.copyPagesToPdf` — and
 * `buildPdf`/`splitPdf` inherit it for free. Adding page numbers later means extending
 * `drawDocAnnotation`, not writing a second drawing path.
 *
 * All positions come from `watermarkGeometry.ts`; none are computed here.
 */

import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { parseHexColor } from './color.ts';
import {
  WATERMARK_DEFAULTS,
  centredRotatedOrigin,
  isPageInRange,
  watermarkImageBox,
} from './watermarkGeometry.ts';
import type { AssetMap, DocAnnotation } from '../state/types.ts';

export interface BakeInput {
  readonly docAnnotations: readonly DocAnnotation[];
  readonly assets: AssetMap;
}

type PdfLib = typeof import('pdf-lib');

/**
 * Per-output-document caches. A watermark image is embedded once, not once per page, and the
 * font once for the whole document.
 */
export interface BakeContext {
  readonly pdfLib: PdfLib;
  readonly out: PDFDocument;
  readonly input: BakeInput;
  font?: PDFFont;
  readonly images: Map<string, PDFImage | null>;
}

export function createBakeContext(pdfLib: PdfLib, out: PDFDocument, input: BakeInput): BakeContext {
  return { pdfLib, out, input, images: new Map() };
}

/** True when there is nothing to draw, so callers can skip the whole bake path. */
export function isBakeEmpty(input: BakeInput | undefined): boolean {
  return !input || input.docAnnotations.length === 0;
}

async function getFont(context: BakeContext): Promise<PDFFont> {
  context.font ??= await context.out.embedFont(context.pdfLib.StandardFonts.Helvetica);
  return context.font;
}

async function getImage(context: BakeContext, assetId: string): Promise<PDFImage | null> {
  const cached = context.images.get(assetId);
  if (cached !== undefined) return cached;

  const asset = context.input.assets[assetId];
  let embedded: PDFImage | null = null;
  if (asset) {
    try {
      embedded =
        asset.mimeType === 'image/png'
          ? await context.out.embedPng(asset.bytes)
          : await context.out.embedJpg(asset.bytes);
    } catch {
      // A corrupt asset must not fail the whole export; the page just gets no watermark.
      embedded = null;
    }
  }
  context.images.set(assetId, embedded);
  return embedded;
}

/**
 * Draws one annotation onto one page.
 *
 * Text mode: drawn centred on the page and rotated about that centre point, semi-transparent.
 * Image mode: drawn centred at exactly 50% of the page width, aspect preserved, same opacity.
 */
async function drawDocAnnotation(
  context: BakeContext,
  page: PDFPage,
  annotation: DocAnnotation,
): Promise<void> {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const opacity = annotation.opacity ?? WATERMARK_DEFAULTS.opacity;

  if (annotation.assetId) {
    const image = await getImage(context, annotation.assetId);
    if (!image) return;
    const box = watermarkImageBox(pageWidth, pageHeight, image.width / image.height);
    page.drawImage(image, { x: box.x, y: box.y, width: box.width, height: box.height, opacity });
    return;
  }

  const text = annotation.text?.trim();
  if (!text) return;

  const { degrees, rgb } = context.pdfLib;
  const font = await getFont(context);
  const fontSize = annotation.fontSize ?? WATERMARK_DEFAULTS.fontSize;
  const angle = annotation.rotationDeg ?? WATERMARK_DEFAULTS.rotationDeg;
  const colour = parseHexColor(annotation.color ?? WATERMARK_DEFAULTS.color);

  // Helvetica is WinAnsi-encoded; characters outside it would throw at encode time.
  const drawable = text.replace(/[^ -ÿ]/g, '');
  if (!drawable) return;

  const textWidth = font.widthOfTextAtSize(drawable, fontSize);
  const textHeight = font.heightAtSize(fontSize);
  const origin = centredRotatedOrigin(textWidth, textHeight, pageWidth, pageHeight, angle);

  page.drawText(drawable, {
    x: origin.x,
    y: origin.y,
    size: fontSize,
    font,
    color: rgb(colour.r, colour.g, colour.b),
    opacity,
    rotate: degrees(origin.angleDeg),
  });
}

/**
 * Bakes every applicable annotation onto one page of the output.
 *
 * `pageNumber` is 1-based **within the document being generated** — so a range on a split part is
 * evaluated against that part's own numbering, which follows from splitting reusing this same
 * pipeline. (`spec/features.md` §1.2 states only that marks are baked into every part; it does not
 * specify range re-indexing, so this is the behaviour that falls out of the shared path rather
 * than a separate rule.)
 */
export async function bakePage(
  context: BakeContext,
  page: PDFPage,
  pageNumber: number,
): Promise<void> {
  for (const annotation of context.input.docAnnotations) {
    if (!isPageInRange(pageNumber, annotation.range)) continue;
    await drawDocAnnotation(context, page, annotation);
  }
}
