/**
 * Phase 1 of Compress: lossy re-encoding of embedded images (`spec/features.md` §1.5).
 *
 * Runs inside `compressWorker.ts`, never on the main thread.
 *
 * The screening rules and the object-substitution approach are both load-bearing — read
 * `spec/edge-cases.md` ("Compression pipeline") before changing either.
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from 'pdf-lib';
import { COMPRESSION_LEVELS, type CompressionLevel } from './compressLevels.ts';

/** Screening thresholds (`spec/edge-cases.md`). */
const MIN_SIDE_PX = 64;
const MIN_STREAM_BYTES = 16 * 1024;

/**
 * Both APIs are missing on Safari <16.4. When unsupported the whole image phase is skipped, but
 * the lossless structural pass still runs — it needs no canvas at all. The UI must surface this,
 * or a small result looks like a bug (`spec/edge-cases.md`).
 */
export function canRecompressImages(): boolean {
  return (
    typeof OffscreenCanvas !== 'undefined' &&
    typeof OffscreenCanvas.prototype.convertToBlob === 'function' &&
    typeof createImageBitmap === 'function'
  );
}

export interface RecompressResult {
  readonly bytes: Uint8Array;
  /** Images that passed screening. */
  readonly candidates: number;
  /** Images actually swapped — i.e. where the re-encode came out smaller. */
  readonly replaced: number;
}

interface Candidate {
  readonly ref: PDFRef;
  readonly stream: PDFRawStream;
  readonly width: number;
  readonly height: number;
  readonly isJpeg: boolean;
  readonly components: number;
}

const name = (dict: PDFDict, key: string) => dict.get(PDFName.of(key));

function numberOf(dict: PDFDict, key: string): number | undefined {
  const value = dict.get(PDFName.of(key));
  return value instanceof PDFNumber ? value.asNumber() : undefined;
}

/** Resolves a colour space to its component count, or undefined if it is not one we may touch. */
function screenColorSpace(doc: PDFDocument, dict: PDFDict): number | undefined {
  const raw = name(dict, 'ColorSpace');
  const resolved = raw instanceof PDFRef ? doc.context.lookup(raw) : raw;

  if (resolved instanceof PDFName) {
    if (resolved === PDFName.of('DeviceGray')) return 1;
    if (resolved === PDFName.of('DeviceRGB')) return 3;
    return undefined; // Indexed / Separation / DeviceN / CMYK — colour would shift.
  }

  // [/ICCBased <stream>] with N of 1 or 3.
  if (resolved instanceof PDFArray && resolved.size() === 2) {
    const family = resolved.get(0);
    if (!(family instanceof PDFName) || family !== PDFName.of('ICCBased')) return undefined;
    const streamRef = resolved.get(1);
    const stream = streamRef instanceof PDFRef ? doc.context.lookup(streamRef) : streamRef;
    if (!(stream instanceof PDFRawStream)) return undefined;
    const n = numberOf(stream.dict, 'N');
    return n === 1 || n === 3 ? n : undefined;
  }

  return undefined;
}

/**
 * An image XObject is a candidate only if **all** of the screening rules pass. Every exclusion
 * below exists for a stated reason (`spec/edge-cases.md`) — none is an optimisation.
 */
function screen(doc: PDFDocument, ref: PDFRef, object: unknown): Candidate | undefined {
  if (!(object instanceof PDFRawStream)) return undefined;
  const dict = object.dict;

  if (name(dict, 'Subtype') !== PDFName.of('Image')) return undefined;

  // JPEG has no alpha channel — flattening a cut-out image onto white would visibly wreck it, at
  // every level, not just the gentle ones.
  if (name(dict, 'SMask') || name(dict, 'Mask')) return undefined;
  const imageMask = name(dict, 'ImageMask');
  if (imageMask && imageMask.toString() === 'true') return undefined;

  const width = numberOf(dict, 'Width');
  const height = numberOf(dict, 'Height');
  if (!width || !height || width < MIN_SIDE_PX || height < MIN_SIDE_PX) return undefined;
  if (object.getContents().length < MIN_STREAM_BYTES) return undefined;

  const components = screenColorSpace(doc, dict);
  if (components === undefined) return undefined;

  const filter = name(dict, 'Filter');
  // A filter *chain* (e.g. [/ASCII85Decode /DCTDecode]) is always skipped as too fiddly.
  if (!(filter instanceof PDFName)) return undefined;

  if (filter === PDFName.of('DCTDecode')) {
    // Already a complete JPEG — decoded by the browser's own decoder.
    return { ref, stream: object, width, height, isJpeg: true, components };
  }

  // JPXDecode (browsers cannot decode JPEG 2000), CCITTFaxDecode and JBIG2Decode (bitonal fax
  // scans, already smaller than any JPEG re-encode) are always left alone.
  const decodable = ['FlateDecode', 'LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode'];
  if (!decodable.some((f) => filter === PDFName.of(f))) return undefined;

  if (numberOf(dict, 'BitsPerComponent') !== 8) return undefined;
  if (name(dict, 'Decode')) return undefined;

  return { ref, stream: object, width, height, isJpeg: false, components };
}

/**
 * Estimates each image's displayed resolution as "the width, in points, of the widest page that
 * draws it".
 *
 * Deliberately approximate (`spec/edge-cases.md`): pdf-lib gives no way to resolve the actual
 * draw-time transform. Near-exact for full-page scans — the case this feature targets — and it
 * *under*-estimates DPI for a small logo on a big page, which is the safe direction: it means
 * downsampling less than theoretically possible, never more. An image with no page mapping gets no
 * cap applied at all, for the same reason.
 */
function mapImagesToPageWidths(doc: PDFDocument): Map<string, number> {
  const widths = new Map<string, number>();

  for (const page of doc.getPages()) {
    const pageWidth = page.getSize().width;
    const resources = page.node.Resources();
    const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjects) continue;

    for (const [, value] of xobjects.entries()) {
      if (!(value instanceof PDFRef)) continue;
      const key = value.toString();
      widths.set(key, Math.max(widths.get(key) ?? 0, pageWidth));
    }
  }

  return widths;
}

/** Raw samples → RGBA, so any screened colour space can reach a canvas. */
function samplesToRgba(samples: Uint8Array, width: number, height: number, components: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; p < width * height; p += 1) {
    const r = samples[i] ?? 0;
    const g = components === 1 ? r : (samples[i + 1] ?? 0);
    const b = components === 1 ? r : (samples[i + 2] ?? 0);
    i += components;
    rgba[p * 4] = r;
    rgba[p * 4 + 1] = g;
    rgba[p * 4 + 2] = b;
    rgba[p * 4 + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}

async function toBitmap(candidate: Candidate): Promise<ImageBitmap> {
  if (candidate.isJpeg) {
    const bytes = candidate.stream.getContents();
    return createImageBitmap(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/jpeg' }));
  }
  const samples = decodePDFRawStream(candidate.stream).decode();
  return createImageBitmap(
    samplesToRgba(samples, candidate.width, candidate.height, candidate.components),
  );
}

export interface RecompressProgress {
  (done: number, total: number): void;
}

/**
 * Every image in the document that passes screening.
 *
 * Exported so the screening rules can be asserted directly: they are a documented rule set
 * (`spec/edge-cases.md`) where each exclusion prevents a specific visible defect, and verifying
 * them through `recompressImages` would need a canvas.
 */
export function collectRecompressCandidates(doc: PDFDocument): Candidate[] {
  const candidates: Candidate[] = [];
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    const candidate = screen(doc, ref, object);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

export async function recompressImages(
  input: Uint8Array,
  level: CompressionLevel,
  onProgress?: RecompressProgress,
): Promise<RecompressResult> {
  const { quality, dpiCap } = COMPRESSION_LEVELS[level];
  const doc = await PDFDocument.load(input);

  const pageWidths = mapImagesToPageWidths(doc);
  const candidates = collectRecompressCandidates(doc);

  let replaced = 0;
  onProgress?.(0, candidates.length);

  for (const [index, candidate] of candidates.entries()) {
    try {
      const original = candidate.stream.getContents();

      // Downsample only if the estimated DPI exceeds the cap.
      const drawnWidthPt = pageWidths.get(candidate.ref.toString());
      const estimatedDpi = drawnWidthPt ? (candidate.width / drawnWidthPt) * 72 : 0;
      const scale = estimatedDpi > dpiCap ? dpiCap / estimatedDpi : 1;
      const targetWidth = Math.max(1, Math.round(candidate.width * scale));
      const targetHeight = Math.max(1, Math.round(candidate.height * scale));

      const bitmap = await toBitmap(candidate);
      const canvas = new OffscreenCanvas(targetWidth, targetHeight);
      const context = canvas.getContext('2d');
      if (!context) {
        bitmap.close();
        continue;
      }
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      bitmap.close();

      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      const encoded = new Uint8Array(await blob.arrayBuffer());

      // FLOOR 1 (per-image): if the re-encode isn't smaller, keep the original bytes and don't
      // count it as replaced.
      if (encoded.length >= original.length) continue;

      // Object substitution, not a copy pipeline (`spec/edge-cases.md`): pdf-lib's embedJpg can
      // only *add* an image, never swap one that page content already draws. Assigning a rebuilt
      // stream onto the SAME PDFRef means every page drawing it keeps working, with zero
      // page-copying and zero resource-dictionary rewriting.
      const dict = doc.context.obj({
        Type: 'XObject',
        Subtype: 'Image',
        Width: targetWidth,
        Height: targetHeight,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        Filter: 'DCTDecode',
        Length: encoded.length,
      });
      doc.context.assign(candidate.ref, PDFRawStream.of(dict, encoded));
      replaced += 1;
    } catch {
      // A single undecodable image must not fail the whole document.
    } finally {
      onProgress?.(index + 1, candidates.length);
    }
  }

  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, candidates: candidates.length, replaced };
}

/** The no-canvas fallback: a plain reload+resave, so the structural pass still has something to do. */
export async function resaveWithoutImageWork(input: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input);
  return doc.save({ useObjectStreams: true });
}
