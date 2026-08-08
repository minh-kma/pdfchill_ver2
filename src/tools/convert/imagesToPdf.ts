/**
 * Images to PDF (`spec/features.md` §1.11).
 *
 * Layout math and embedding. Kept free of React so the geometry is testable on its own.
 */

import type { PDFDocument, PDFImage } from 'pdf-lib';

// Dynamic, so pdf-lib stays out of the homepage bundle. The layout math below needs none of it,
// which also keeps the geometry testable without loading the library.
const pdfLib = () => import('pdf-lib');

/* --- Options --------------------------------------------------------------------------------- */

export const PAGE_SIZE_IDS = ['fit', 'a4', 'letter', 'legal', 'a3', 'a5'] as const;
export type PageSizeId = (typeof PAGE_SIZE_IDS)[number];

export const ORIENTATION_IDS = ['auto', 'portrait', 'landscape'] as const;
export type OrientationId = (typeof ORIENTATION_IDS)[number];

export const MARGIN_IDS = ['none', 'small', 'big'] as const;
export type MarginId = (typeof MARGIN_IDS)[number];

/** Points, portrait (width × height). */
const PAGE_SIZES: Record<Exclude<PageSizeId, 'fit'>, readonly [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
};

export const MARGINS: Record<MarginId, number> = { none: 0, small: 18, big: 36 };

/**
 * Fit-to-image caps the longer edge at 2384pt (≈33.1in, A0's short side) and scales the whole
 * image down proportionally past that. Never upscaled.
 *
 * NOTE: `spec/features.md` §1.11 says "see §2 for why", but `spec/edge-cases.md` carries no such
 * entry — the rationale did not survive extraction from the old app. The *behaviour* is fully
 * specified and is implemented exactly as written; only the reasoning is missing. Do not change
 * the constant on the assumption it is arbitrary.
 */
export const FIT_MAX_EDGE_PT = 2384;

export interface LayoutOptions {
  readonly pageSize: PageSizeId;
  readonly orientation: OrientationId;
  readonly margin: MarginId;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  pageSize: 'a4',
  orientation: 'auto',
  margin: 'none',
};

/* --- Format sniffing -------------------------------------------------------------------------- */

/**
 * Format is sniffed from magic bytes at embed time, never trusted from the file extension or MIME
 * type — the picker's `accept` filter is advisory only (`spec/features.md` §1.11).
 */
export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  );
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export class UnsupportedImageError extends Error {
  constructor(readonly fileName: string) {
    super(`Not a PNG or JPEG: ${fileName}`);
    this.name = 'UnsupportedImageError';
  }
}

/* --- Geometry --------------------------------------------------------------------------------- */

export interface PlacedImage {
  /** Page dimensions in points. */
  readonly pageWidth: number;
  readonly pageHeight: number;
  /** Draw origin and unrotated draw size handed to pdf-lib. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** pdf-lib angle (counter-clockwise), i.e. the negation of the user's clockwise rotation. */
  readonly angle: number;
}

/**
 * Computes page size and draw placement for one image.
 *
 * Rotation is the fiddly part: pdf-lib's `degrees()` rotates **counter-clockwise about the draw
 * origin**, while the user's control is clockwise. So the angle is negated and the origin is
 * offset per quarter-turn, so the rotated bounding box still lands where the layout math expects.
 */
export function layoutImage(
  imageWidthPx: number,
  imageHeightPx: number,
  rotation: number,
  options: LayoutOptions,
): PlacedImage {
  const margin = MARGINS[options.margin];
  const quarter = (((rotation % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const swaps = quarter === 90 || quarter === 270;

  // Size of the image's bounding box after rotation.
  const rotatedW = swaps ? imageHeightPx : imageWidthPx;
  const rotatedH = swaps ? imageWidthPx : imageHeightPx;

  let pageWidth: number;
  let pageHeight: number;
  let boxW: number;
  let boxH: number;

  if (options.pageSize === 'fit') {
    // 1 image pixel = 1 PDF point, except the longer edge is capped and the whole image scaled
    // down proportionally past that. Never upscaled.
    const longest = Math.max(rotatedW, rotatedH);
    const scale = longest > FIT_MAX_EDGE_PT ? FIT_MAX_EDGE_PT / longest : 1;
    boxW = rotatedW * scale;
    boxH = rotatedH * scale;
    pageWidth = boxW + margin * 2;
    pageHeight = boxH + margin * 2;
  } else {
    const [portraitW, portraitH] = PAGE_SIZES[options.pageSize];
    // Auto picks landscape when the (rotated) image is wider than tall.
    const landscape =
      options.orientation === 'landscape' ||
      (options.orientation === 'auto' && rotatedW > rotatedH);
    pageWidth = landscape ? portraitH : portraitW;
    pageHeight = landscape ? portraitW : portraitH;

    // Contain-fit inside the margins: scaled to fit, never cropped or stretched.
    const availableW = Math.max(1, pageWidth - margin * 2);
    const availableH = Math.max(1, pageHeight - margin * 2);
    const scale = Math.min(availableW / rotatedW, availableH / rotatedH);
    boxW = rotatedW * scale;
    boxH = rotatedH * scale;
  }

  // Target position of the rotated bounding box, centred on the page.
  const targetX = (pageWidth - boxW) / 2;
  const targetY = (pageHeight - boxH) / 2;

  // Unrotated draw size: swap back, because `width`/`height` are pre-rotation.
  const drawW = swaps ? boxH : boxW;
  const drawH = swaps ? boxW : boxH;

  // Offset the origin so the rotated box lands on (targetX, targetY). Derived from rotating the
  // unrotated box's corners about (x, y) by -quarter degrees.
  let x = targetX;
  let y = targetY;
  if (quarter === 90) {
    y = targetY + drawW;
  } else if (quarter === 180) {
    x = targetX + drawW;
    y = targetY + drawH;
  } else if (quarter === 270) {
    x = targetX + drawH;
  }

  return { pageWidth, pageHeight, x, y, width: drawW, height: drawH, angle: -quarter };
}

/* --- Building ---------------------------------------------------------------------------------- */

export interface SourceImage {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** Clockwise, cumulative, already reduced mod 360. */
  readonly rotation: number;
}

async function embed(doc: PDFDocument, image: SourceImage): Promise<PDFImage> {
  if (isPng(image.bytes)) return doc.embedPng(image.bytes);
  if (isJpeg(image.bytes)) return doc.embedJpg(image.bytes);
  throw new UnsupportedImageError(image.name);
}

async function addImagePage(
  doc: PDFDocument,
  image: SourceImage,
  options: LayoutOptions,
): Promise<void> {
  const { degrees } = await pdfLib();
  const embedded = await embed(doc, image);
  const placed = layoutImage(embedded.width, embedded.height, image.rotation, options);
  const page = doc.addPage([placed.pageWidth, placed.pageHeight]);
  page.drawImage(embedded, {
    x: placed.x,
    y: placed.y,
    width: placed.width,
    height: placed.height,
    rotate: degrees(placed.angle),
  });
}

/** One PDF containing every image, in order. */
export async function buildMergedPdf(
  images: readonly SourceImage[],
  options: LayoutOptions,
): Promise<Uint8Array> {
  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.create();
  for (const image of images) await addImagePage(doc, image, options);
  return doc.save();
}

export interface ImagePdfPart {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/**
 * One PDF per image. Name collisions within the batch (e.g. `scan.jpg` and `scan.png` both
 * becoming `scan.pdf`) are suffixed `_2`, `_3`, … (`spec/features.md` §1.11).
 */
export async function buildSeparatePdfs(
  images: readonly SourceImage[],
  options: LayoutOptions,
): Promise<ImagePdfPart[]> {
  const { PDFDocument } = await pdfLib();
  const used = new Map<string, number>();
  const parts: ImagePdfPart[] = [];

  for (const image of images) {
    const doc = await PDFDocument.create();
    await addImagePage(doc, image, options);

    const stem = image.name.replace(/\.[^.]+$/, '') || 'image';
    const seen = used.get(stem) ?? 0;
    used.set(stem, seen + 1);
    const name = seen === 0 ? `${stem}.pdf` : `${stem}_${seen + 1}.pdf`;

    parts.push({ name, bytes: await doc.save() });
  }

  return parts;
}

/** Numeric-aware, so "img2" sorts before "img10". */
export function sortImagesByName<T extends { name: string }>(
  images: readonly T[],
  direction: 'asc' | 'desc',
): T[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const sorted = [...images].sort((a, b) => collator.compare(a.name, b.name));
  return direction === 'asc' ? sorted : sorted.reverse();
}
