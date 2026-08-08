/**
 * Remove password (`spec/features.md` §1.7).
 *
 * Detection lives in `shared/pdf/pdfRender.ts: probeEncryption` (pdf.js `PasswordException` plus
 * the raw `/Encrypt` byte scan); decryption is qpdf via the shared `runQpdf`.
 */

import { runQpdf } from '../../shared/lib/qpdf.ts';

export class NotEncryptedError extends Error {
  constructor(readonly fileName: string) {
    super(`Not password-protected: ${fileName}`);
    this.name = 'NotEncryptedError';
  }
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password');
    this.name = 'WrongPasswordError';
  }
}

/**
 * Decrypts with the given password. Returns `null` when the password is wrong — qpdf produces no
 * output file, which is how the shared helper reports failure.
 *
 * An empty password is meaningful here, not an error: owner-only files have no user password at
 * all, so `--password=` is exactly what unlocks them.
 */
export function tryUnlock(bytes: Uint8Array, password: string): Promise<Uint8Array | null> {
  return runQpdf(bytes, ['--decrypt', `--password=${password}`]);
}

/** Same operation, but throwing the typed error the UI maps to a translated string. */
export async function unlockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const result = await tryUnlock(bytes, password);
  if (!result) throw new WrongPasswordError();
  return result;
}
