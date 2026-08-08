import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { DownloadIcon } from '../../shared/components/icons.tsx';
import { downloadBlob } from '../../shared/lib/download.ts';
import { toErrorKey } from '../../shared/lib/errorKeys.ts';
import { planBaseName, splitPdf } from '../../shared/lib/pdfCore.ts';
import { buildRanges, eachPageRanges } from '../../shared/lib/splitRanges.ts';
import { useStore } from '../../shared/state/store.tsx';
import type { AppError } from '../../shared/state/useAddSources.ts';
import type { ToolPageProps } from '../../toolRegistry.ts';
import { OrganizeToolShell } from './OrganizeToolShell.tsx';

type Mode = 'ranges' | 'pages';

/**
 * Split (SPEC.md §1.2).
 *
 * Ranges are cut out of the current page plan through the same `copyPagesToPdf` every other tool
 * uses, so each part carries whatever reordering/rotation/deletion the user has done. The plan
 * itself is never mutated.
 *
 * This is the one documented exception to "never auto-download" (SPEC.md §5): the result is a zip
 * of N PDFs, which has no single document to show in `PreviewModal`, so it downloads directly.
 */
export function SplitTool({ tool }: ToolPageProps) {
  return (
    <OrganizeToolShell tool={tool}>
      <SplitPanel />
    </OrganizeToolShell>
  );
}

function SplitPanel() {
  const { t } = useTranslation();
  const { state } = useStore();
  const [mode, setMode] = useState<Mode>('ranges');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError>();

  const total = state.pages.length;

  const parsed = useMemo(() => buildRanges(input, total), [input, total]);
  const ranges = mode === 'pages' ? eachPageRanges(total) : parsed.ranges;

  // At least one valid split point, i.e. two or more resulting files (SPEC.md §1.2).
  const canSplit = ranges.length >= 2;

  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      const plan = { sources: state.sources, pages: state.pages };
      const baseName = planBaseName(plan);
      const parts = await splitPdf(plan, ranges, baseName);

      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const part of parts) zip.file(part.name, part.bytes);
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${baseName}_split.zip`);
    } catch (failure) {
      setError({ key: toErrorKey(failure) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5">
      {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

      <div className="mb-4 flex gap-2">
        {(['ranges', 'pages'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === option
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t(`split:mode.${option}`)}
          </button>
        ))}
      </div>

      {mode === 'ranges' ? (
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">{t('split:splitAfterLabel')}</span>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('split:splitAfterPlaceholder')}
            inputMode="numeric"
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
          <span className="mt-1.5 block text-xs text-slate-500">
            {t('split:splitAfterHint', { total })}
          </span>
        </label>
      ) : (
        <p className="text-sm text-slate-600">{t('split:pagesHint', { count: total })}</p>
      )}

      {parsed.ignored.length > 0 && mode === 'ranges' && (
        // Out-of-range or unparseable entries are dropped and listed, never blocking (SPEC.md §1.2).
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('split:ignored', { values: parsed.ignored.join(', ') })}
        </p>
      )}

      <p className="mt-4 text-sm text-slate-600">{t('split:resultCount', { count: ranges.length })}</p>

      <button
        type="button"
        onClick={() => void run()}
        disabled={!canSplit || busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-sky-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
      >
        <DownloadIcon className="size-5" />
        {busy ? t('workspace:actions.working') : t('split:action')}
      </button>
    </div>
  );
}
