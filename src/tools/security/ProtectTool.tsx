import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { PreviewModal } from '../../shared/components/PreviewModal.tsx';
import { ProtectIcon } from '../../shared/components/icons.tsx';
import type { AppError } from '../../shared/state/appError.ts';
import type { ToolPageProps } from '../../toolRegistry.ts';
import { SingleFileToolShell, type LoadedFile } from '../shared/SingleFileToolShell.tsx';
import { protectPdf } from './protectPdf.ts';
import { toSecurityErrorKey } from './securityErrors.ts';

/** Add password (`spec/features.md` §1.8). */
export function ProtectTool({ tool }: ToolPageProps) {
  return (
    <SingleFileToolShell tool={tool}>
      {(file) => <ProtectPanel key={file.name} file={file} />}
    </SingleFileToolShell>
  );
}

function ProtectPanel({ file }: { file: LoadedFile }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError>();
  const [result, setResult] = useState<Uint8Array>();

  const emptyPassword = password.trim().length === 0;
  const mismatch = password !== confirm;
  // Inline errors appear only after the first submit attempt.
  const showEmpty = submitted && emptyPassword;
  const showMismatch = submitted && !emptyPassword && mismatch;

  async function run() {
    setSubmitted(true);
    if (emptyPassword || mismatch) return;

    setBusy(true);
    setError(undefined);
    try {
      setResult(await protectPdf(file.bytes, password, file.name));
    } catch (failure) {
      setError({ key: toSecurityErrorKey(failure, `protecting "${file.name}"`), params: { file: file.name } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

      <div className="space-y-4">
        <Field
          label={t('protect:password')}
          value={password}
          visible={visible}
          error={showEmpty ? t('protect:errors.empty') : undefined}
          onChange={setPassword}
          onToggleVisible={() => setVisible((value) => !value)}
          toggleLabel={t(visible ? 'unlock:prompt.hide' : 'unlock:prompt.show')}
        />
        <Field
          label={t('protect:confirm')}
          value={confirm}
          visible={visible}
          error={showMismatch ? t('protect:errors.mismatch') : undefined}
          onChange={setConfirm}
          onToggleVisible={() => setVisible((value) => !value)}
          toggleLabel={t(visible ? 'unlock:prompt.hide' : 'unlock:prompt.show')}
        />
      </div>

      <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-600">
        {t('protect:note')}
      </p>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-base font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        <ProtectIcon className="size-5" />
        {busy ? t('workspace:actions.working') : t('protect:action')}
      </button>

      {result && (
        <PreviewModal
          bytes={result}
          fileName={`${file.baseName}_protected.pdf`}
          onClose={() => setResult(undefined)}
          // The iframe would show the browser's own password prompt — confusing right after the
          // user picked that password. Cover it with a plain confirmation instead.
          overlay={t('protect:previewOverlay')}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  visible,
  error,
  onChange,
  onToggleVisible,
  toggleLabel,
}: {
  label: string;
  value: string;
  visible: boolean;
  error: string | undefined;
  onChange: (value: string) => void;
  onToggleVisible: () => void;
  toggleLabel: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-stone-700">{label}</span>
      <span className="mt-1.5 flex items-center gap-2">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete="new-password"
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand-500 ${
            error ? 'border-red-300' : 'border-stone-300'
          }`}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-stone-500 transition hover:bg-stone-100"
        >
          {toggleLabel}
        </button>
      </span>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
