/**
 * A user-facing error, as a translation key plus interpolation params.
 *
 * `spec/constraints.md`: users never see a raw `Error.message`. Logic modules throw typed errors;
 * `toErrorKey()` maps the class to a key, and this carries it to the UI.
 */
export interface AppError {
  readonly key: string;
  readonly params?: Record<string, string>;
}
