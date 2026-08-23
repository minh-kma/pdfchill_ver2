import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { CheckIcon, DownloadIcon } from '../../shared/components/icons.tsx';
import { downloadBlob } from '../../shared/lib/download.ts';
import { toErrorKey } from '../../shared/lib/errorKeys.ts';
import { planBaseName, splitPdf } from '../../shared/lib/pdfCore.ts';
import { buildRanges, eachPageRanges } from '../../shared/lib/splitRanges.ts';
import { useStore } from '../../shared/state/store.tsx';
import type { AppError } from '../../shared/state/useAddSources.tsx';
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
  /**
   * Set only after the zip was actually built and handed to the browser. Never cleared on a timer:
   * it resets when what-you-would-download genuinely changes — a different split configuration, or
   * a different document (new file / Start Over, both of which change `state.pages`).
   *
   * This is Split's own path: it bypasses `PreviewModal` (SPEC.md §1.2), so it needs its own
   * done-state rather than inheriting the modal's.
   */
  const [done, setDone] = useState(false);

  const total = state.pages.length;

  const parsed = useMemo(() => buildRanges(input, total), [input, total]);
  const ranges = mode === 'pages' ? eachPageRanges(total) : parsed.ranges;

  // Re-arm the button when the output would genuinely differ: a changed split configuration, or a
  // changed document (a new file or Start Over both move `total`). Deliberately not a timeout.
  useEffect(() => {
    setDone(false);
  }, [mode, input, total]);

  // At least one valid split point, i.e. two or more resulting files (SPEC.md §1.2).
  const canSplit = ranges.length >= 2;

  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      const plan = {
        sources: state.sources,
        pages: state.pages,
        // Marks are baked into every part, exactly as Download would produce them.
        bake: { docAnnotations: state.docAnnotations, assets: state.assets },
      };
      const baseName = planBaseName(plan);
      const parts = await splitPdf(plan, ranges, baseName);

      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const part of parts) zip.file(part.name, part.bytes);
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${baseName}_split.zip`);
      // Only reached when the zip was built and the download was triggered without throwing.
      setDone(true);
    } catch (failure) {
      setError({ key: toErrorKey(failure, 'splitting document') });
    } finally {
      setBusy(false);
    }
  }

  return (
    /* Fills the shell's action column (it was a centred max-w-xl block under the grid before). */
    <div className="w-full rounded-2xl border border-stone-200 bg-white p-5">
      {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

      <div className="mb-4 flex gap-2">
        {(['ranges', 'pages'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${
              mode === option
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {t(`split:mode.${option}`)}
          </button>
        ))}
      </div>

      {mode === 'ranges' ? (
        <label className="block">
          <span className="text-sm font-bold text-stone-700">{t('split:splitAfterLabel')}</span>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('split:splitAfterPlaceholder')}
            inputMode="numeric"
            className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <span className="mt-1.5 block text-xs text-stone-500">
            {t('split:splitAfterHint', { total })}
          </span>
        </label>
      ) : (
        <p className="text-sm text-stone-600">{t('split:pagesHint', { count: total })}</p>
      )}

      {parsed.ignored.length > 0 && mode === 'ranges' && (
        // Out-of-range or unparseable entries are dropped and listed, never blocking (SPEC.md §1.2).
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('split:ignored', { values: parsed.ignored.join(', ') })}
        </p>
      )}

      <p className="mt-4 text-sm text-stone-600">{t('split:resultCount', { count: ranges.length })}</p>

      <button
        type="button"
        onClick={() => void run()}
        disabled={!canSplit || busy || done}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-3 text-base font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {done ? <CheckIcon className="size-5" /> : <DownloadIcon className="size-5" />}
        {done
          ? t('split:downloaded')
          : busy
            ? t('workspace:actions.working')
            : t('split:action')}
      </button>
    </div>
  );
}
