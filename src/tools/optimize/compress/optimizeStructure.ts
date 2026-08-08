import { runQpdf } from '../../../shared/lib/qpdf.ts';

/**
 * Phase 2 of Compress: the lossless structural pass (`spec/features.md` §1.5).
 *
 * **Always runs, at every level, regardless of whether phase 1 ran at all** — it needs no canvas,
 * so it is the one thing that still helps on a browser without OffscreenCanvas support.
 *
 * Recompresses every stream (not just images) at max Flate level, repacks small indirect objects
 * into object streams, and drops objects unreachable from the trailer — qpdf's default GC, which
 * reclaims anything orphaned by this app's own merge/delete/reorder edits.
 */
const QPDF_ARGS = [
  // `--compress-streams=y` is present deliberately; don't drop it (`spec/edge-cases.md`).
  '--compress-streams=y',
  '--recompress-flate',
  '--compression-level=9',
  '--object-streams=generate',
] as const;
// `--remove-unreferenced-resources` is deliberately absent: it only applies alongside qpdf's own
// `--pages` mode, which is unused here.

/** Returns null when qpdf produced nothing usable; the caller keeps the phase-1 bytes. */
export function optimizeStructure(
  input: Uint8Array,
  options?: { wasmUrl?: string },
): Promise<Uint8Array | null> {
  return runQpdf(input, QPDF_ARGS, options);
}
