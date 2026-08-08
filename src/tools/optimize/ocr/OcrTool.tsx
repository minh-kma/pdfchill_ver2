import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../../shared/components/ErrorBanner.tsx';
import { PreviewModal } from '../../../shared/components/PreviewModal.tsx';
import { toErrorKey } from '../../../shared/lib/errorKeys.ts';
import { createId } from '../../../shared/lib/ids.ts';
import { releaseDocumentsExcept } from '../../../shared/pdf/pdfRender.ts';
import type { AppError } from '../../../shared/state/useAddSources.tsx';
import type { ToolPageProps } from '../../../toolRegistry.ts';
import { SingleFileToolShell, type LoadedFile } from '../../shared/SingleFileToolShell.tsx';
import { bakeOcrTextLayer } from './bakeOcrTextLayer.ts';
import { OCR_LANGUAGES, ocrDocument, releaseOcrWorkers, type OcrLanguage } from './ocrDocument.ts';

/** OCR (`spec/features.md` §1.6). Config screen, running screen, then preview. */
export function OcrTool({ tool }: ToolPageProps) {
  return (
    <SingleFileToolShell tool={tool}>
      {(file) => <OcrPanel key={file.name} file={file} />}
    </SingleFileToolShell>
  );
}

interface Status {
  readonly pageNumber: number;
  readonly totalPages: number;
  readonly skipped: boolean;
  readonly baking: boolean;
}

function OcrPanel({ file }: { file: LoadedFile }) {
  const { t } = useTranslation();
  const [languages, setLanguages] = useState<OcrLanguage[]>(['eng']);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Status>();
  const [result, setResult] = useState<{ bytes: Uint8Array; recognized: number; skipped: number }>();
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<AppError>();

  // Stable per mounted file, so pdf.js parses it once across every page render.
  const sourceId = useRef(createId('ocr')).current;

  // Same cancel-while-running guard as Compress: leaving mid-run discards the eventual result
  // rather than surprise-opening a preview (`spec/features.md` §1.6).
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      releaseDocumentsExcept(new Set());
      void releaseOcrWorkers();
    };
  }, []);

  function toggle(language: OcrLanguage) {
    setLanguages((current) =>
      current.includes(language)
        ? current.filter((item) => item !== language)
        : [...current, language],
    );
  }

  async function start() {
    setRunning(true);
    setError(undefined);
    setResult(undefined);
    try {
      const pages = await ocrDocument(
        sourceId,
        file.bytes,
        languages,
        (update) => {
          if (!cancelled.current) setStatus({ ...update, baking: false });
        },
        () => cancelled.current,
      );
      if (cancelled.current) return;

      setStatus((current) => (current ? { ...current, baking: true } : current));
      const bytes = await bakeOcrTextLayer(file.bytes, pages);
      if (cancelled.current) return;

      setResult({
        bytes,
        recognized: pages.filter((page) => !page.skipped).length,
        skipped: pages.filter((page) => page.skipped).length,
      });
    } catch (failure) {
      if (!cancelled.current) setError({ key: toErrorKey(failure, `ocr "${file.name}"`) });
    } finally {
      if (!cancelled.current) {
        setRunning(false);
        setStatus(undefined);
      }
    }
  }

  if (running) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-800">
          {status?.baking
            ? t('ocr:progress.finishing')
            : status
              ? t(status.skipped ? 'ocr:progress.skipping' : 'ocr:progress.recognizing', {
                  page: status.pageNumber,
                  total: status.totalPages,
                })
              : t('ocr:progress.starting')}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-sky-500 transition-all"
            style={{
              width: `${status && status.totalPages > 0 ? Math.round((status.pageNumber / status.totalPages) * 100) : 5}%`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('ocr:progress.cannotCancel')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

      {result ? (
        <div>
          {/* Two independent counts, so each is pluralised on its own before being composed —
              i18next keys carry a single `count`. Passing {recognized, skipped} to a key that
              only exists as `summary_one`/`summary_other` resolves to nothing and renders the raw
              key, which is exactly how this shipped broken. */}
          <p className="text-sm font-semibold text-slate-900">
            {t('ocr:result.summary', {
              recognized: t('ocr:result.pages', { count: result.recognized }),
              skipped: t('ocr:result.pages', { count: result.skipped }),
            })}
          </p>
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            className="mt-4 rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            {t('ocr:result.review')}
          </button>
        </div>
      ) : (
        <>
          <fieldset>
            <legend className="text-sm font-semibold text-slate-700">{t('ocr:languageLabel')}</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {OCR_LANGUAGES.map((language) => (
                <label
                  key={language}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    languages.includes(language)
                      ? 'border-sky-400 bg-sky-50 text-sky-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={languages.includes(language)}
                    onChange={() => toggle(language)}
                    className="size-4 accent-sky-600"
                  />
                  {t(`ocr:languages.${language}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Shown before the user can start (`spec/features.md` §1.6). */}
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            {t('ocr:disclosure')}
          </p>

          <button
            type="button"
            onClick={() => void start()}
            disabled={languages.length === 0}
            className="mt-5 w-full rounded-full bg-sky-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
          >
            {t('ocr:action')}
          </button>
        </>
      )}

      {previewing && result && (
        <PreviewModal
          bytes={result.bytes}
          fileName={`${file.baseName}_ocr.pdf`}
          onClose={() => setPreviewing(false)}
        />
      )}
    </div>
  );
}
