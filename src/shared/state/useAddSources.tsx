import { useCallback, useState } from 'react';
import { toErrorKey } from '../lib/errorKeys.ts';
import { readSource } from '../lib/pdfCore.ts';
import type { AppError } from './appError.ts';
import { useStore } from './store.tsx';
import { SKIPPED, useUnlockGate } from './useUnlockGate.tsx';

export type { AppError };

/**
 * Reads picked files into the page plan, one `ADD_SOURCE` per file so each is independently
 * undoable. A file that fails to parse is reported and the rest of the batch continues — one bad
 * file must not discard the good ones.
 *
 * Encrypted files are decrypted *before* they reach the store (`spec/features.md` §1.7), so a
 * `SourceDoc` always holds plaintext. Skipping a file at the prompt continues the rest of the batch.
 */
export function useAddSources() {
  const { dispatch } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError>();
  const { ensureDecrypted, passwordPrompt } = useUnlockGate();

  const addFiles = useCallback(
    async (files: readonly File[]) => {
      setBusy(true);
      setError(undefined);
      try {
        for (const file of files) {
          try {
            const raw = new Uint8Array(await file.arrayBuffer());
            const bytes = await ensureDecrypted(raw, file.name);
            if (bytes === SKIPPED) continue;

            const { source, pages } = await readSource(bytes, file.name);
            dispatch({ type: 'ADD_SOURCE', source, pages });
          } catch (failure) {
            setError({ key: toErrorKey(failure, `reading "${file.name}"`), params: { file: file.name } });
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [dispatch, ensureDecrypted],
  );

  return { addFiles, busy, error, clearError: () => setError(undefined), passwordPrompt };
}
