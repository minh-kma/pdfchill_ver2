import type { PageRange } from './pdfCore.ts';

export interface SplitParseResult {
  /** N valid split points produce N+1 ranges. Empty input produces one whole-document range. */
  readonly ranges: readonly PageRange[];
  /** Tokens that yielded no usable split point — shown inline, never blocking (SPEC.md §1.2). */
  readonly ignored: readonly string[];
}

/**
 * Parses "split-after page numbers" into ranges, per SPEC.md §1.2.
 *
 * `3, 7` on a 10-page document -> 3 files: pages 1–3, 4–7, 8–10.
 *
 * Comma/whitespace-separated integers; deduplicated; kept only where `1 <= p < total`; sorted
 * ascending. Anything dropped is reported in `ignored` rather than rejecting the input — a typo
 * must not block the rest of a valid list.
 *
 * Pure and side-effect free so the parsing rules are testable without mounting the panel
 * (SPEC.md §7 pain point #4 is the same complaint about logic trapped in a component).
 */
export function buildRanges(input: string, total: number): SplitParseResult {
  const ignored: string[] = [];
  const points = new Set<number>();

  for (const token of input.split(/[\s,]+/).filter((part) => part.length > 0)) {
    const value = Number(token);
    if (!Number.isInteger(value) || value < 1 || value >= total) {
      ignored.push(token);
      continue;
    }
    points.add(value);
  }

  const sorted = [...points].sort((a, b) => a - b);
  const ranges: PageRange[] = [];
  let start = 1;
  for (const point of sorted) {
    ranges.push({ start, end: point });
    start = point + 1;
  }
  if (total >= start) ranges.push({ start, end: total });

  return { ranges, ignored };
}

/** "Split into individual pages": one single-page range per page of the plan. */
export function eachPageRanges(total: number): readonly PageRange[] {
  return Array.from({ length: total }, (_, index) => ({ start: index + 1, end: index + 1 }));
}
