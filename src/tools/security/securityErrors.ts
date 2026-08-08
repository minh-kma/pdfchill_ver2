import { toErrorKey } from '../../shared/lib/errorKeys.ts';
import { logExpectedError } from '../../shared/lib/logError.ts';
import { AlreadyEncryptedError, EmptyPasswordError, ProtectFailedError } from './protectPdf.ts';
import { NotEncryptedError, WrongPasswordError } from './pdfUnlock.ts';

/**
 * Extends the shared `toErrorKey()` with the security tools' own typed errors.
 *
 * Same rule as everywhere else (`spec/constraints.md`): the error *class* selects a translated
 * string; `err.message` is never rendered. Recognised errors are logged as expected; anything
 * unrecognised falls through to `toErrorKey`, which logs it as a bug.
 */
export function toSecurityErrorKey(error: unknown, context = 'security operation failed'): string {
  if (error instanceof EmptyPasswordError) {
    logExpectedError(context, error);
    return 'protect:errors.empty';
  }
  if (error instanceof AlreadyEncryptedError) {
    logExpectedError(context, error);
    return 'protect:errors.alreadyEncrypted';
  }
  if (error instanceof ProtectFailedError) {
    logExpectedError(context, error);
    return 'protect:errors.failed';
  }
  if (error instanceof NotEncryptedError) {
    logExpectedError(context, error);
    return 'unlock:errors.notEncrypted';
  }
  if (error instanceof WrongPasswordError) {
    logExpectedError(context, error);
    return 'unlock:errors.wrongPassword';
  }
  return toErrorKey(error, context);
}
