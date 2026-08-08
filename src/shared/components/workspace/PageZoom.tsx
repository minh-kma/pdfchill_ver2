import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PageItem, SourceDoc } from '../../state/types.ts';
import { CloseIcon } from '../icons.tsx';
import { PageCanvas } from './PageCanvas.tsx';

/** SPEC.md §1.4: 20%–300%, 10% steps. */
const MIN_ZOOM = 20;
const MAX_ZOOM = 300;
const ZOOM_STEP = 10;
const BASE_WIDTH = 620;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)));

export interface PageZoomProps {
  readonly page: PageItem;
  readonly source: SourceDoc;
  readonly position: number;
  readonly onClose: () => void;
}

/** Full-screen single-page view, opened by double-clicking a thumbnail (SPEC.md §1.4). */
export function PageZoom({ page, source, position, onClose }: PageZoomProps) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(100);
  const [draft, setDraft] = useState<string>();

  // Zoom resets to 100% whenever the shown page changes (SPEC.md §1.4).
  useEffect(() => {
    setZoom(100);
    setDraft(undefined);
  }, [page.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // Escape cancels an in-progress percentage edit rather than closing the modal out from
      // under it; only a second Escape closes.
      if (draft !== undefined) {
        setDraft(undefined);
        return;
      }
      onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [draft, onClose]);

  function commitDraft() {
    if (draft === undefined) return;
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed)) setZoom(clampZoom(parsed));
    setDraft(undefined);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('workspace:page.label', { number: position })}
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/80"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 text-white">
        <span className="text-sm font-semibold">
          {t('workspace:page.label', { number: position })}
        </span>
        <div className="ms-auto flex items-center gap-1 rounded-lg bg-white/10 p-1">
          <button
            type="button"
            aria-label={t('workspace:zoom.out')}
            onClick={() => setZoom((value) => clampZoom(value - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
            className="rounded-md px-3 py-1 text-lg leading-none transition hover:bg-white/15 disabled:opacity-40"
          >
            −
          </button>
          <input
            value={draft ?? `${zoom}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitDraft();
              }
            }}
            aria-label={t('workspace:zoom.label')}
            inputMode="numeric"
            className="w-14 rounded-md bg-white/10 px-2 py-1 text-center text-sm tabular-nums outline-none focus:bg-white/20"
          />
          <span className="pe-1 text-sm">%</span>
          <button
            type="button"
            aria-label={t('workspace:zoom.in')}
            onClick={() => setZoom((value) => clampZoom(value + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
            className="rounded-md px-3 py-1 text-lg leading-none transition hover:bg-white/15 disabled:opacity-40"
          >
            +
          </button>
        </div>
        <button
          type="button"
          aria-label={t('workspace:preview.close')}
          onClick={onClose}
          className="rounded-lg p-2 transition hover:bg-white/15"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto w-fit">
          <PageCanvas
            source={source}
            page={page}
            width={Math.round((BASE_WIDTH * zoom) / 100)}
            className="h-auto w-auto rounded bg-white shadow-2xl"
          />
        </div>
      </div>
    </div>
  );
}
