import { logExpectedError, logUnexpectedError } from './logError.ts';
import { EmptyPlanError, EncryptedPdfError, InvalidPdfError } from './pdfCore.ts';

/**
 * The UI boundary between logic-layer errors and what a user sees.
 *
 * `spec/constraints.md` §5: errors shown to users are always translated, never a raw
 * `Error.message`. Logic modules throw plain-English typed errors as developer diagnostics; this
 * maps the *class* to a translation key. Never render `err.message`.
 *
 * **This is also the logging chokepoint.** Every call logs the real error before returning a key,
 * so an unrecognised failure can never reach the user as "Something went wrong" while leaving the
 * console empty. Pass a `context` describing what was being attempted.
 */
export function toErrorKey(error: unknown, context = 'operation failed'): string {
  if (error instanceof EncryptedPdfError) {
    logExpectedError(context, error);
    return 'workspace:errors.encrypted';
  }
  if (error instanceof InvalidPdfError) {
    logExpectedError(context, error);
    return 'workspace:errors.invalidPdf';
  }
  if (error instanceof EmptyPlanError) {
    logExpectedError(context, error);
    return 'workspace:errors.emptyPlan';
  }

  // Anything reaching here is unmodelled — treat it as a bug and make it loud.
  logUnexpectedError(context, error);
  return 'workspace:errors.generic';
}
