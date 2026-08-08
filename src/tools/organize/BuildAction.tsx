import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { PreviewModal } from '../../shared/components/PreviewModal.tsx';
import { DownloadIcon } from '../../shared/components/icons.tsx';
import { toErrorKey } from '../../shared/lib/errorKeys.ts';
import { buildPdf, planBaseName } from '../../shared/lib/pdfCore.ts';
import { useStore } from '../../shared/state/store.tsx';
import type { AppError } from '../../shared/state/useAddSources.ts';

export interface BuildActionProps {
  /** i18n key for the button. */
  readonly labelKey: string;
  /** Filename suffix, following SPEC.md's `{baseName}_{suffix}.pdf` convention. */
  readonly suffix: string;
}

/**
 * "Assemble the current plan and let the user review it." Merge, Reorder, Delete pages and Rotate
 * all end in exactly this — they differ only in the button's wording and the output filename, so
 * they share one implementation rather than four copies.
 *
 * The result always goes to `PreviewModal` first: no code path auto-downloads (SPEC.md §5).
 */
export function BuildAction({ labelKey, suffix }: BuildActionProps) {
  const { t } = useTranslation();
  const { state } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError>();
  const [result, setResult] = useState<{ bytes: Uint8Array; fileName: string }>();

  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      const plan = { sources: state.sources, pages: state.pages };
      const bytes = await buildPdf(plan);
      setResult({ bytes, fileName: `${planBaseName(plan)}_${suffix}.pdf` });
    } catch (failure) {
      setError({ key: toErrorKey(failure) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || state.pages.length === 0}
          className="flex items-center gap-2 rounded-full bg-sky-600 px-7 py-3 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-sky-700 hover:shadow-lg disabled:translate-y-0 disabled:opacity-60"
        >
          <DownloadIcon className="size-5" />
          {busy ? t('workspace:actions.working') : t(labelKey)}
        </button>
      </div>

      {result && (
        <PreviewModal
          bytes={result.bytes}
          fileName={result.fileName}
          onClose={() => setResult(undefined)}
        />
      )}
    </>
  );
}
