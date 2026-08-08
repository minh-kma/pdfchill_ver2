import { EmptyPlanError, EncryptedPdfError, InvalidPdfError } from './pdfCore.ts';

/**
 * The UI boundary between logic-layer errors and what a user sees.
 *
 * SPEC.md §5: errors shown to users are always translated, never a raw `Error.message`. Logic
 * modules throw plain-English typed errors as developer diagnostics; this maps the *class* to a
 * translation key. Never render `err.message`.
 */
export function toErrorKey(error: unknown): string {
  if (error instanceof EncryptedPdfError) return 'workspace:errors.encrypted';
  if (error instanceof InvalidPdfError) return 'workspace:errors.invalidPdf';
  if (error instanceof EmptyPlanError) return 'workspace:errors.emptyPlan';
  return 'workspace:errors.generic';
}
