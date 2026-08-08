/**
 * The unlock password for the current session.
 *
 * **Memory only.** `spec/edge-cases.md`: it is never written to IndexedDB or localStorage, and is
 * cleared on Start Over. Deliberately kept out of `AppState` so it can never be captured in an
 * undo snapshot or, later, in a persisted session.
 *
 * Module-scoped rather than React state because the same cached password must be tried silently
 * across every upload path in the app, not just within one component tree.
 */
let sessionPassword: string | undefined;

export function getSessionPassword(): string | undefined {
  return sessionPassword;
}

/** Called only after a password has actually succeeded. */
export function rememberSessionPassword(password: string): void {
  sessionPassword = password;
}

/** Called on Start Over (`RESET`). */
export function clearSessionPassword(): void {
  sessionPassword = undefined;
}
