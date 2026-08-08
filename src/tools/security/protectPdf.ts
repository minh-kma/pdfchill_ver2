/**
 * Add password (`spec/features.md` §1.8).
 *
 * AES-256 via qpdf, through the shared `runQpdf` — same single-use-instance guarantee as every
 * other qpdf call site.
 */

import { hasEncryptMarker } from '../../shared/lib/pdfCore.ts';
import { runQpdf } from '../../shared/lib/qpdf.ts';

export class EmptyPasswordError extends Error {
  constructor() {
    super('Password is empty');
    this.name = 'EmptyPasswordError';
  }
}

export class AlreadyEncryptedError extends Error {
  constructor(readonly fileName: string) {
    super(`Already password-protected: ${fileName}`);
    this.name = 'AlreadyEncryptedError';
  }
}

export class ProtectFailedError extends Error {
  constructor() {
    super('qpdf produced no output');
    this.name = 'ProtectFailedError';
  }
}

/**
 * Encrypts with AES-256.
 *
 * **The owner password is always set equal to the user password** (`spec/edge-cases.md`): the file
 * has exactly one secret, there is no separate owner/permissions layer, and no restriction flags
 * are ever passed. Opening it anywhere — including this app's own Unlock tool — takes just that
 * password.
 *
 * Two rejections happen before qpdf is ever invoked:
 * - an empty or whitespace-only password;
 * - an already-encrypted input, which would either fail confusingly or silently nest encryption
 *   under a second password. Detected with the same `/Encrypt` byte scan Unlock uses.
 */
export async function protectPdf(
  bytes: Uint8Array,
  password: string,
  fileName: string,
): Promise<Uint8Array> {
  if (password.trim().length === 0) throw new EmptyPasswordError();
  if (hasEncryptMarker(bytes)) throw new AlreadyEncryptedError(fileName);

  // qpdf: --encrypt <user> <owner> 256 -- infile outfile
  const result = await runQpdf(bytes, ['--encrypt', password, password, '256', '--']);
  if (!result) throw new ProtectFailedError();
  return result;
}
