/**
 * The one normalized-rect ↔ PDF-rect conversion.
 *
 * `spec/maintainability.md` pain point #5: the same `toRect` was hand-copied into at least four
 * files in the old app, each annotated "mirrors annotationBake.ts" rather than importing a shared
 * function, with nothing to catch them drifting if the coordinate convention ever changed.
 *
 * OCR's text-layer bake uses it today; watermark and page-number baking will use it unchanged.
 */

/** Normalized 0..1, **top-left origin**, relative to a page's unrotated crop box. */
export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Absolute PDF points, **bottom-left origin** — what pdf-lib draws in. */
export interface PdfRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Converts a top-left-origin normalized rect into pdf-lib's bottom-left-origin point space.
 *
 * The y flip is the whole point: `pageHeight - (y + h)` puts the rect's *bottom* edge at the right
 * distance from the page's bottom.
 */
export function toPdfRect(rect: NormalizedRect, pageWidth: number, pageHeight: number): PdfRect {
  return {
    x: rect.x * pageWidth,
    y: pageHeight - (rect.y + rect.h) * pageHeight,
    w: rect.w * pageWidth,
    h: rect.h * pageHeight,
  };
}
