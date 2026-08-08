import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../../shared/components/ErrorBanner.tsx';
import { PreviewModal } from '../../../shared/components/PreviewModal.tsx';
import { formatBytes, percentReduction } from '../../../shared/lib/formatBytes.ts';
import type { AppError } from '../../../shared/state/useAddSources.ts';
import type { ToolPageProps } from '../../../toolRegistry.ts';
import { SingleFileToolShell, type LoadedFile } from '../../shared/SingleFileToolShell.tsx';
import { COMPRESSION_LEVEL_IDS, DEFAULT_LEVEL, type CompressionLevel } from './compressLevels.ts';
import { pickCompressResult } from './pickCompressResult.ts';
import { runCompress } from './runCompress.ts';

/** Compress (`spec/features.md` §1.5). Config screen, then a running screen, then a result. */
export function CompressTool({ tool }: ToolPageProps) {
  return (
    <SingleFileToolShell tool={tool}>
      {(file) => <CompressPanel key={file.name} file={file} />}
    </SingleFileToolShell>
  );
}

interface Outcome {
  readonly bytes: Uint8Array;
  readonly before: number;
  readonly after: number;
  readonly usedOurs: boolean;
  readonly imagesSupported: boolean;
  readonly candidates: number;
  readonly replaced: number;
  readonly level: CompressionLevel;
}

function CompressPanel({ file }: { file: LoadedFile }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState<CompressionLevel>(DEFAULT_LEVEL);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ phase: 'images' as 'images' | 'structure', done: 0, total: 0 });
  const [outcome, setOutcome] = useState<Outcome>();
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<AppError>();

  // Compression cannot be cancelled mid-run. If the user leaves while it is running, this guard
  // discards the eventual result instead of surprise-opening a preview (`spec/features.md` §1.5).
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function start() {
    setRunning(true);
    setError(undefined);
    setOutcome(undefined);
    setProgress({ phase: 'images', done: 0, total: 0 });
    try {
      const result = await runCompress(file.bytes, level, (update) => {
        if (!cancelled.current) setProgress(update);
      });
      if (cancelled.current) return;

      // FLOOR 3 (per-document): never hand back something bigger than the user already had.
      const choice = pickCompressResult({
        baseline: file.bytes.length,
        compressed: result.bytes.length,
      });

      setOutcome({
        bytes: choice.usedOurs ? result.bytes : file.bytes,
        before: file.bytes.length,
        after: choice.size,
        usedOurs: choice.usedOurs,
        imagesSupported: result.imagesSupported,
        candidates: result.candidates,
        replaced: result.replaced,
        level,
      });
    } catch {
      if (!cancelled.current) setError({ key: 'workspace:errors.generic' });
    } finally {
      if (!cancelled.current) setRunning(false);
    }
  }

  if (running) return <RunningPanel progress={progress} />;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

      {outcome ? (
        <ResultPanel outcome={outcome} onPreview={() => setPreviewing(true)} onAgain={() => setOutcome(undefined)} />
      ) : (
        <>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">{t('compress:levelLabel')}</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {COMPRESSION_LEVEL_IDS.map((id) => (
                <label
                  key={id}
                  className={`cursor-pointer rounded-xl border p-3 transition ${
                    level === id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="level"
                    value={id}
                    checked={level === id}
                    onChange={() => setLevel(id)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-bold text-slate-900">{t(`compress:levels.${id}.name`)}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{t(`compress:levels.${id}.hint`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={() => void start()}
            className="mt-5 w-full rounded-full bg-sky-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-sky-700"
          >
            {t('compress:action')}
          </button>
        </>
      )}

      {previewing && outcome && (
        <PreviewModal
          bytes={outcome.bytes}
          fileName={`${file.baseName}_compressed.pdf`}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}

function RunningPanel({ progress }: { progress: { phase: 'images' | 'structure'; done: number; total: number } }) {
  const { t } = useTranslation();
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : undefined;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-800">
        {progress.phase === 'structure'
          ? t('compress:progress.structure')
          : t('compress:progress.images', { done: progress.done, total: progress.total })}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        {/* The structural phase has no per-item count, so the bar holds at its last value
            rather than resetting (`spec/features.md` §1.5). */}
        <div
          className="h-full rounded-full bg-sky-500 transition-all"
          style={{ width: `${pct ?? 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">{t('compress:progress.cannotCancel')}</p>
    </div>
  );
}

function ResultPanel({
  outcome,
  onPreview,
  onAgain,
}: {
  outcome: Outcome;
  onPreview: () => void;
  onAgain: () => void;
}) {
  const { t } = useTranslation();
  const reduction = percentReduction(outcome.before, outcome.after);

  // One of four detail messages, per `spec/features.md` §1.5. The `imagesSupported` check comes
  // first: without it, a small result on Safari <16.4 looks like a bug.
  const detail = !outcome.imagesSupported
    ? t('compress:detail.noCanvas')
    : !outcome.usedOurs || reduction === 0
      ? t('compress:detail.alreadyOptimal')
      : outcome.replaced === 0
        ? t('compress:detail.imagesAlreadyEfficient')
        : t('compress:detail.recompressed', {
            count: outcome.replaced,
            level: t(`compress:levels.${outcome.level}.name`),
          });

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-extrabold text-slate-900">
          {reduction > 0 ? t('compress:result.saved', { percent: reduction }) : t('compress:result.noChange')}
        </span>
        <span className="text-sm text-slate-500">
          {formatBytes(outcome.before)} → {formatBytes(outcome.after)}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPreview}
          className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          {t('compress:result.review')}
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="rounded-full px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
        >
          {t('compress:result.tryAnother')}
        </button>
      </div>
    </div>
  );
}
