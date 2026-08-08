import { useCallback, useState } from 'react';
import { toErrorKey } from '../lib/errorKeys.ts';
import { readSource } from '../lib/pdfCore.ts';
import { useStore } from './store.tsx';

export interface AppError {
  readonly key: string;
  readonly params?: Record<string, string>;
}

/**
 * Reads picked files into the page plan, one `ADD_SOURCE` per file so each is independently
 * undoable. A file that fails to parse is reported and the rest of the batch continues — one bad
 * file must not discard the good ones.
 */
export function useAddSources() {
  const { dispatch } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError>();

  const addFiles = useCallback(
    async (files: readonly File[]) => {
      setBusy(true);
      setError(undefined);
      try {
        for (const file of files) {
          try {
            const { source, pages } = await readSource(file);
            dispatch({ type: 'ADD_SOURCE', source, pages });
          } catch (failure) {
            setError({ key: toErrorKey(failure), params: { file: file.name } });
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [dispatch],
  );

  return { addFiles, busy, error, clearError: () => setError(undefined) };
}
