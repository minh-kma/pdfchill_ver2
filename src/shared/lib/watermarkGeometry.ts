/**
 * THE watermark geometry. Position, scale and rotation are computed here and nowhere else.
 *
 * `spec/maintainability.md` pain point #6: the old app implemented this drawing geometry three
 * independent times — the real bake, an on-canvas overlay, and each panel's inline live-preview
 * JSX — kept in sync only by comments ("mirrors the bake"). Changing one visual rule meant finding
 * and correctly updating three unrelated files with nothing to catch a miss.
 *
 * The documented fix direction is followed here: the *numbers* are produced once, and both
 * consumers use them. The bake feeds them to pdf-lib; the live preview feeds the same numbers to
 * CSS. Neither recomputes a position.
 *
 * Pure, dependency-free, unit-space-agnostic: pass PDF points and get points back, pass preview
 * pixels and get pixels back.
 */

/** Defaults, per `spec/edge-cases.md` ("Watermark / page numbers / rendering"). */
export const WATERMARK_DEFAULTS = {
  fontSize: 48,
  color: '#888888',
  opacity: 0.15,
  rotationDeg: 45,
} as const;

export const WATERMARK_LIMITS = {
  fontSize: { min: 8, max: 144 },
  /** Angle slider range, degrees. */
  rotationDeg: { min: -90, max: 90 },
  /** Opacity slider range, percent. */
  opacityPercent: { min: 5, max: 100 },
} as const;

/**
 * A watermark image is always scaled to exactly 50% of the page width, centred — not
 * user-adjustable (`spec/edge-cases.md`).
 */
export const WATERMARK_IMAGE_WIDTH_RATIO = 0.5;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The centred, aspect-preserved box for an image watermark.
 *
 * Origin is bottom-left (PDF convention). A CSS consumer converts with
 * `top = pageHeight - y - height`.
 */
export function watermarkImageBox(
  pageWidth: number,
  pageHeight: number,
  imageAspect: number,
): Box {
  const width = pageWidth * WATERMARK_IMAGE_WIDTH_RATIO;
  const height = imageAspect > 0 ? width / imageAspect : width;
  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Draw origin for a box that must end up **centred on the page after being rotated about that
 * origin**.
 *
 * Both pdf-lib's `drawText`/`drawImage` and a CSS `transform: rotate()` with
 * `transform-origin: left bottom` rotate about the draw origin, not about the box's centre. So the
 * origin has to be pushed back by the rotated half-diagonal:
 *
 *   origin = pageCentre − R(θ) · (w/2, h/2)
 *
 * Returns bottom-left-origin coordinates and the angle to apply, counter-clockwise positive —
 * matching pdf-lib's `degrees()`.
 */
export function centredRotatedOrigin(
  boxWidth: number,
  boxHeight: number,
  pageWidth: number,
  pageHeight: number,
  angleDeg: number,
): { x: number; y: number; angleDeg: number } {
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const halfWidth = boxWidth / 2;
  const halfHeight = boxHeight / 2;

  return {
    x: pageWidth / 2 - (halfWidth * cos - halfHeight * sin),
    y: pageHeight / 2 - (halfWidth * sin + halfHeight * cos),
    angleDeg,
  };
}

/** Whether a 1-based page number falls inside an annotation's range. No range means every page. */
export function isPageInRange(
  pageNumber: number,
  range: { from: number; to: number } | undefined,
): boolean {
  if (!range) return true;
  return pageNumber >= range.from && pageNumber <= range.to;
}
