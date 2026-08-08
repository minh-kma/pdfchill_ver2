import type { CompressionLevel } from './compressLevels.ts';
import { optimizeStructure } from './optimizeStructure.ts';
import {
  canRecompressImages,
  recompressImages,
  resaveWithoutImageWork,
} from './recompressImages.ts';

/**
 * Both compression phases, in order. Lives apart from the worker wrapper so the pipeline can be
 * driven directly (tests, and any future non-worker caller) without a `postMessage` round trip.
 */

export interface CompressPipelineProgress {
  (update: { phase: 'images' | 'structure'; done: number; total: number }): void;
}

export interface CompressPipelineResult {
  readonly bytes: Uint8Array;
  /** False on browsers without OffscreenCanvas/createImageBitmap — phase 1 was skipped entirely. */
  readonly imagesSupported: boolean;
  readonly candidates: number;
  readonly replaced: number;
  /** True when qpdf's output was kept; false when it was discarded for not being smaller. */
  readonly structuralHelped: boolean;
}

export async function runCompressPipeline(
  input: Uint8Array,
  level: CompressionLevel,
  onProgress?: CompressPipelineProgress,
  options?: { wasmUrl?: string },
): Promise<CompressPipelineResult> {
  const imagesSupported = canRecompressImages();

  // --- Phase 1: lossy image recompression (skipped entirely when unsupported) ---
  let staged: Uint8Array;
  let candidates = 0;
  let replaced = 0;

  if (imagesSupported) {
    const result = await recompressImages(input, level, (done, total) =>
      onProgress?.({ phase: 'images', done, total }),
    );
    staged = result.bytes;
    candidates = result.candidates;
    replaced = result.replaced;
  } else {
    staged = await resaveWithoutImageWork(input);
  }

  // --- Phase 2: lossless structural pass (always) ---
  // No per-item count is available for this phase, so the UI holds the bar at its last value
  // rather than resetting it.
  onProgress?.({ phase: 'structure', done: 0, total: 0 });
  const structural = await optimizeStructure(staged, options);

  // FLOOR 2 (per-stage): qpdf's output is discarded if it isn't smaller than what phase 1 produced.
  const structuralHelped = structural !== null && structural.length < staged.length;
  const bytes = structuralHelped && structural ? structural : staged;

  return { bytes, imagesSupported, candidates, replaced, structuralHelped };
}
