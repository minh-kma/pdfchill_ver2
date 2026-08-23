import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { PreviewModal } from '../../shared/components/PreviewModal.tsx';
import { UnlockIcon } from '../../shared/components/icons.tsx';
import { probeEncryption, type EncryptionProbe } from '../../shared/pdf/pdfRender.ts';
import type { AppError } from '../../shared/state/appError.ts';
import { rememberSessionPassword } from '../../shared/state/sessionPassword.ts';
import type { ToolPageProps } from '../../toolRegistry.ts';
import { SingleFileToolShell, type LoadedFile } from '../shared/SingleFileToolShell.tsx';
import { NotEncryptedError, tryUnlock } from './pdfUnlock.ts';
import { toSecurityErrorKey } from './securityErrors.ts';

/**
 * Remove password (`spec/features.md` §1.7), entry point 1: the dedicated tool.
 *
 * `acceptEncrypted` is what makes this tool different from every other single-file tool — it wants
 * the still-encrypted bytes, because decrypting them is the job. Everywhere else the shared unlock
 * gate has already decrypted the upload before the tool sees it.
 *
 * The result goes straight to `PreviewModal` and never touches the page-plan store.
 */
export function UnlockTool({ tool }: ToolPageProps) {
  return (
    <SingleFileToolShell
      tool={tool}
      acceptEncrypted
      uploadTitleKey="unlock:uploadTitle"
      uploadSubtitleKey="unlock:uploadSubtitle"
    >
      {(file) => <UnlockPanel key={file.name} file={file} />}
    </SingleFileToolShell>
  );
}

function UnlockPanel({ file }: { file: LoadedFile }) {
  const { t } = useTranslation();
  const [probe, setProbe] = useState<EncryptionProbe>();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError>();
  const [result, setResult] = useState<Uint8Array>();

  // Two-layered detection runs as soon as the file lands, so an unencrypted file is reported
  // rather than silently "succeeding" (`spec/features.md` §1.7).
  useEffect(() => {
    let active = true;
    void probeEncryption(file.bytes).then((outcome) => {
      if (!active) return;
      setProbe(outcome);
      if (!outcome.encrypted) {
        setError({ key: toSecurityErrorKey(new NotEncryptedError(file.name)), params: { file: file.name } });
      }
    });
    return () => {
      active = false;
    };
  }, [file]);

  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      const bytes = await tryUnlock(file.bytes, password);
      if (!bytes) {
        setError({ key: 'unlock:errors.wrongPassword' });
        return;
      }
      // Cached in memory only, for the rest of the session.
      if (password) rememberSessionPassword(password);
      setResult(bytes);
    } catch (failure) {
      setError({ key: toSecurityErrorKey(failure), params: { file: file.name } });
    } finally {
      setBusy(false);
    }
  }

  if (!probe) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-500">
        {t('unlock:checking')}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

      {probe.encrypted && (
        <>
          <p className="text-sm text-stone-600">
            {t(probe.needsUserPassword ? 'unlock:needsPassword' : 'unlock:ownerOnly')}
          </p>

          <label className="mt-4 block">
            <span className="text-sm font-bold text-stone-700">{t('unlock:prompt.label')}</span>
            <span className="mt-1.5 flex items-center gap-2">
              <input
                type={visible ? 'text' : 'password'}
                value={password}
                autoComplete="off"
                onChange={(event) => setPassword(event.target.value)}
                // Owner-only files have no user password at all, so an empty box is valid input.
                placeholder={probe.needsUserPassword ? '' : t('unlock:ownerOnlyPlaceholder')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void run();
                }}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={() => setVisible((value) => !value)}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-stone-500 transition hover:bg-stone-100"
              >
                {t(visible ? 'unlock:prompt.hide' : 'unlock:prompt.show')}
              </button>
            </span>
          </label>

          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-base font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            <UnlockIcon className="size-5" />
            {busy ? t('workspace:actions.working') : t('unlock:action')}
          </button>
        </>
      )}

      {result && (
        <PreviewModal
          bytes={result}
          fileName={`${file.baseName}_unlocked.pdf`}
          onClose={() => setResult(undefined)}
        />
      )}
    </div>
  );
}
