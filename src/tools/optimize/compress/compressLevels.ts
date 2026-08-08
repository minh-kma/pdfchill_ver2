/**
 * Compression levels (`spec/features.md` §1.5). Each pairs a JPEG re-encode quality with a DPI cap
 * that images are downsampled to if they exceed it.
 *
 * The values are deliberate, not tuning knobs:
 * - Low is capped at 220 rather than 300 on purpose — a level that visibly does nothing to a
 *   300dpi scan reads as broken.
 * - Medium matches Ghostscript's `/ebook` preset and Acrobat's "Reduce File Size"; halving a
 *   300dpi scan to 150 drops 3/4 of the pixels before quality is even considered.
 * - High is deliberately aggressive — the "hitting an email limit" case.
 */
export const COMPRESSION_LEVEL_IDS = ['low', 'medium', 'high'] as const;

export type CompressionLevel = (typeof COMPRESSION_LEVEL_IDS)[number];

export const DEFAULT_LEVEL: CompressionLevel = 'medium';

export interface LevelSettings {
  readonly quality: number;
  readonly dpiCap: number;
}

export const COMPRESSION_LEVELS: Record<CompressionLevel, LevelSettings> = {
  low: { quality: 0.82, dpiCap: 220 },
  medium: { quality: 0.65, dpiCap: 150 },
  high: { quality: 0.45, dpiCap: 110 },
};
