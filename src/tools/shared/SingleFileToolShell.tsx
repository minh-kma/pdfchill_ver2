import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { FileDropzone } from '../../shared/components/FileDropzone.tsx';
import { formatBytes } from '../../shared/lib/formatBytes.ts';
import { toErrorKey } from '../../shared/lib/errorKeys.ts';
import type { AppError } from '../../shared/state/appError.ts';
import { SKIPPED, useUnlockGate } from '../../shared/state/useUnlockGate.tsx';
import type { ToolDefinition } from '../../toolRegistry.ts';

export interface LoadedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** Filename stem, for building the output name. */
  readonly baseName: string;
}

export interface SingleFileToolShellProps {
  readonly tool: ToolDefinition;
  /**
   * Unlock sets this: it is the one tool that *wants* the still-encrypted bytes, since decrypting
   * them is the whole job. Every other tool goes through the unlock gate first.
   */
  readonly acceptEncrypted?: boolean;
  readonly uploadTitleKey?: string;
  readonly uploadSubtitleKey?: string;
  readonly children: (file: LoadedFile, reset: () => void) => ReactNode;
}

/**
 * Layout for the single-file tools (Compress, OCR, Protect, Unlock): registry-driven heading,
 * one-file picker, then the tool's own config/running UI.
 *
 * Deliberately **not** wired to the Organize session store: these tools transform one uploaded
 * file and hand it back. They have no page plan, nothing to undo, and no reason to make a user's
 * in-progress merge session their input.
 *
 * Encrypted input is decrypted through the shared unlock gate before the tool ever sees it
 * (`spec/features.md` §1.7), so a tool body can assume plaintext — unless it opted into
 * `acceptEncrypted`.
 */
export function SingleFileToolShell({
  tool,
  acceptEncrypted = false,
  uploadTitleKey = 'workspace:upload.title',
  uploadSubtitleKey = 'workspace:upload.subtitle',
  children,
}: SingleFileToolShellProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<LoadedFile>();
  const [error, setError] = useState<AppError>();
  const [busy, setBusy] = useState(false);
  const { ensureDecrypted, passwordPrompt } = useUnlockGate();

  async function accept(files: readonly File[]) {
    const picked = files[0];
    if (!picked) return;
    setBusy(true);
    setError(undefined);
    try {
      const raw = new Uint8Array(await picked.arrayBuffer());
      const bytes = acceptEncrypted ? raw : await ensureDecrypted(raw, picked.name);
      if (bytes === SKIPPED) return;

      setFile({
        name: picked.name,
        bytes,
        baseName: picked.name.replace(/\.pdf$/i, '') || 'document',
      });
    } catch (failure) {
      setError({ key: toErrorKey(failure, `loading "${picked.name}"`), params: { file: picked.name } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6">
        {/* From the registry entry — never hardcoded per tool. */}
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t(tool.nameKey)}</h1>
        <p className="mt-2 text-slate-600">{t(tool.descriptionKey)}</p>
      </header>

      {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

      {!file ? (
        <FileDropzone
          multiple={false}
          busy={busy}
          title={t(uploadTitleKey)}
          subtitle={t(uploadSubtitleKey)}
          buttonLabel={t('workspace:upload.button')}
          onFiles={(files) => void accept(files)}
        />
      ) : (
        <>
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-500">{formatBytes(file.bytes.length)}</p>
            </div>
            <button
              type="button"
              onClick={() => setFile(undefined)}
              className="ms-auto shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              {t('workspace:actions.startOver')}
            </button>
          </div>
          {children(file, () => setFile(undefined))}
        </>
      )}

      {passwordPrompt}
    </div>
  );
}
