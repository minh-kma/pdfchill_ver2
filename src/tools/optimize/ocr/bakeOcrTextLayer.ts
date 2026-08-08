/**
 * OCR stage 2: write-back. **This module never runs Tesseract** — it only draws words that
 * recognition already found (`spec/edge-cases.md`).
 *
 * Words are drawn onto the **original** PDF as invisible text (PDF text rendering mode 3,
 * "neither fill nor stroke"), positioned per-word from its bounding box, using one embedded
 * Helvetica. Once baked they are ordinary page content and survive any later merge/split/rotate.
 */

import { toPdfRect } from '../../../shared/lib/geometry.ts';
import type { OcrPageResult } from './ocrDocument.ts';

/** Helvetica is WinAnsi-encoded; anything outside it would throw at encode time. */
const encodable = (text: string) => text.replace(/[^ -ÿ]/g, '');

export async function bakeOcrTextLayer(
  input: Uint8Array,
  results: readonly OcrPageResult[],
): Promise<Uint8Array> {
  // Dynamic, so pdf-lib stays out of the homepage bundle (see `.claude/docs/pdf-pipeline.md`).
  const {
    PDFDocument,
    StandardFonts,
    TextRenderingMode,
    beginText,
    endText,
    popGraphicsState,
    pushGraphicsState,
    setFontAndSize,
    setTextMatrix,
    setTextRenderingMode,
    showText,
  } = await import('pdf-lib');

  const doc = await PDFDocument.load(input);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const result of results) {
    // Skipped pages are left completely untouched — no pass over them at all.
    if (result.skipped || result.words.length === 0) continue;

    const page = pages[result.pageIndex];
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const operators = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];

    for (const word of result.words) {
      const text = encodable(word.text);
      if (!text) continue;

      // Normalized top-left rect -> pdf-lib's bottom-left point space, via the one shared
      // conversion (shared/lib/geometry.ts).
      const rect = toPdfRect(word.rect, pageWidth, pageHeight);
      if (rect.w <= 0 || rect.h <= 0) continue;

      // Size the glyphs so the word occupies roughly its recognized box: start from the box
      // height, then narrow if that would overflow the box width.
      const widthAtUnitSize = font.widthOfTextAtSize(text, 1);
      const size = widthAtUnitSize > 0 ? Math.min(rect.h, rect.w / widthAtUnitSize) : rect.h;
      if (!(size > 0)) continue;

      operators.push(
        setFontAndSize(font.name, size),
        // Baseline sits at the bottom of the box; descenders are close enough for a text layer
        // nobody sees — selection accuracy comes from the box, not the baseline.
        setTextMatrix(1, 0, 0, 1, rect.x, rect.y),
        showText(font.encodeText(text)),
      );
    }

    operators.push(endText(), popGraphicsState());
    page.pushOperators(...operators);
  }

  return doc.save();
}
