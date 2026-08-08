/**
 * The per-document "never bigger" floor — the third and outermost of the three independent floors
 * (`spec/edge-cases.md`, "Compression pipeline").
 *
 * Pure and free of React on purpose: `spec/maintainability.md` pain point #4 is exactly this logic
 * being trapped inside `CompressPanel.tsx`, where "given these byte lengths, which one wins" could
 * not be tested without mounting a component.
 *
 * The three floors sit at three different layers and **must not be collapsed into one**:
 *   1. per-image  — `recompressImages.ts`, keeps original bytes if a re-encode isn't smaller
 *   2. per-stage  — `compressWorker.ts`, discards qpdf's output if it isn't smaller
 *   3. per-document — here
 */

export interface CompressCandidates {
  /**
   * The user's original uploaded bytes. In this app Compress is a standalone transform with no
   * page-plan session behind it, so the input is always the pristine upload — which is precisely
   * the case `spec/edge-cases.md` says must be used as the baseline, because pdf-lib's re-assembly
   * can duplicate shared resources and *inflate* an untouched file.
   */
  readonly baseline: number;
  /**
   * Bytes produced by re-assembling an edited page plan, when there is one. Undefined here today;
   * kept in the signature so wiring Compress to an edited session later is a caller change, not a
   * rewrite of the floor.
   */
  readonly assembled?: number;
  /** What the compression pipeline produced. */
  readonly compressed: number;
}

export type CompressWinner = 'baseline' | 'assembled' | 'compressed';

export interface CompressChoice {
  readonly winner: CompressWinner;
  readonly size: number;
  /** False when the pipeline could not beat what the user already had. */
  readonly usedOurs: boolean;
}

/** Picks the smallest candidate. Ties go to the user's existing bytes — never hand back a bigger file. */
export function pickCompressResult(candidates: CompressCandidates): CompressChoice {
  const entries: { winner: CompressWinner; size: number }[] = [
    { winner: 'baseline', size: candidates.baseline },
  ];
  if (candidates.assembled !== undefined) {
    entries.push({ winner: 'assembled', size: candidates.assembled });
  }
  entries.push({ winner: 'compressed', size: candidates.compressed });

  // Strict `<` so that on a tie the earlier (existing) candidate wins.
  let best = entries[0]!;
  for (const entry of entries.slice(1)) {
    if (entry.size < best.size) best = entry;
  }

  return { winner: best.winner, size: best.size, usedOurs: best.winner === 'compressed' };
}
