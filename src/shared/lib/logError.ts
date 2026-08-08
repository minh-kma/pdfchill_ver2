/**
 * Diagnostic logging for anything that becomes a user-facing error.
 *
 * This exists because of a real, silent production failure: qpdf-wasm threw a `ReferenceError`
 * inside `runQpdf`, and Compress / Add password / Remove password / the unlock gate each caught it
 * with a bare `catch {}` and showed "Something went wrong." The browser console stayed completely
 * empty, so four broken flows had to be diagnosed by hand.
 *
 * The rule now: a translated string is what the *user* sees, never what the *developer* gets.
 * Every path that maps an exception to a translation key logs the real error first.
 *
 * Keep these logs. They are not debug leftovers.
 */

const PREFIX = '[PDFChill]';

/**
 * An error we did not anticipate — a bug until proven otherwise. Logged loudly, with the real
 * error object so the stack survives.
 */
export function logUnexpectedError(context: string, error: unknown): void {
  console.error(`${PREFIX} ${context}:`, error);
}

/**
 * An error we model deliberately (wrong password, encrypted input, unreadable PDF). Not a bug, but
 * still worth a console trail when someone is working out why a file was rejected.
 */
export function logExpectedError(context: string, error: unknown): void {
  console.warn(`${PREFIX} ${context}:`, error);
}

/** Non-fatal detail worth recording — e.g. a tool's own stderr, or a skipped item in a batch. */
export function logDiagnostic(context: string, detail: unknown): void {
  console.warn(`${PREFIX} ${context}:`, detail);
}
