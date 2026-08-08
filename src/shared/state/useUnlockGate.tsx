import { useCallback, useRef, useState, type ReactNode } from 'react';
import { PasswordPrompt } from '../components/PasswordPrompt.tsx';
import { probeEncryption } from '../pdf/pdfRender.ts';
import { tryUnlock } from '../../tools/security/pdfUnlock.ts';
import { getSessionPassword, rememberSessionPassword } from './sessionPassword.ts';

/** The caller skipped this file; continue the rest of the batch without it. */
export const SKIPPED = Symbol('skipped');

export type UnlockResult = Uint8Array | typeof SKIPPED;

interface PendingPrompt {
  readonly fileName: string;
  readonly retrying: boolean;
  readonly resolve: (password: string | typeof SKIPPED) => void;
}

/**
 * Decrypts an encrypted upload *before* it reaches the store.
 *
 * `spec/features.md` §1.7, entry point 2: every upload path probes the file, and only the
 * decrypted bytes are ever added as a `SourceDoc` — so autosave, build, compress and everything
 * downstream always work with plaintext. This is why the gate lives in `shared/` and is used by
 * every upload path rather than only by the Unlock tool.
 *
 * Silent-password retry order before any prompt is shown:
 *   1. the password cached from earlier in this session;
 *   2. an empty string, which unlocks owner-only files (they have no user password at all).
 *
 * Only if both fail does the visible prompt appear, with unlimited retries and a Skip action. A
 * password that works is cached in memory for the rest of the session and never persisted.
 */
export function useUnlockGate() {
  const [pending, setPending] = useState<PendingPrompt>();
  // Kept in a ref so the resolver survives re-renders while the user types.
  const resolverRef = useRef<PendingPrompt['resolve']>(undefined);

  const ask = useCallback((fileName: string, retrying: boolean) => {
    return new Promise<string | typeof SKIPPED>((resolve) => {
      resolverRef.current = resolve;
      setPending({ fileName, retrying, resolve });
    });
  }, []);

  const ensureDecrypted = useCallback(
    async (bytes: Uint8Array, fileName: string): Promise<UnlockResult> => {
      const probe = await probeEncryption(bytes);
      if (!probe.encrypted) return bytes;

      // 1. Session-cached password, tried silently.
      const cached = getSessionPassword();
      if (cached !== undefined) {
        const unlocked = await tryUnlock(bytes, cached);
        if (unlocked) return unlocked;
      }

      // 2. Empty string, tried silently — this is what owner-only files need.
      const withEmpty = await tryUnlock(bytes, '');
      if (withEmpty) return withEmpty;

      // 3. Prompt, unlimited retries.
      let retrying = false;
      for (;;) {
        const answer = await ask(fileName, retrying);
        setPending(undefined);
        if (answer === SKIPPED) return SKIPPED;

        const unlocked = await tryUnlock(bytes, answer);
        if (unlocked) {
          rememberSessionPassword(answer);
          return unlocked;
        }
        retrying = true;
      }
    },
    [ask],
  );

  const element: ReactNode = pending ? (
    <PasswordPrompt
      fileName={pending.fileName}
      retrying={pending.retrying}
      onSubmit={(password) => pending.resolve(password)}
      onSkip={() => pending.resolve(SKIPPED)}
    />
  ) : null;

  return { ensureDecrypted, passwordPrompt: element };
}
