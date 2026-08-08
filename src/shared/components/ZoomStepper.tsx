import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** SPEC: 20%–300%, 10% steps (`spec/features.md` §1.4). */
export const MIN_ZOOM = 20;
export const MAX_ZOOM = 300;
export const ZOOM_STEP = 10;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)));

export interface ZoomControl {
  readonly zoom: number;
  /** True while an inline percentage edit is in progress — Escape should cancel it, not close. */
  readonly isEditing: boolean;
  readonly draft: string | undefined;
  readonly setDraft: (value: string) => void;
  readonly commitDraft: () => void;
  readonly cancelDraft: () => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
}

/**
 * Zoom state for a zoom modal. `resetKey` is the identity of the thing being shown: zoom resets to
 * 100% whenever it changes (`spec/features.md` §1.4).
 */
export function useZoomControl(resetKey: string): ZoomControl {
  const [zoom, setZoom] = useState(100);
  const [draft, setDraft] = useState<string>();

  useEffect(() => {
    setZoom(100);
    setDraft(undefined);
  }, [resetKey]);

  return {
    zoom,
    isEditing: draft !== undefined,
    draft,
    setDraft,
    commitDraft: () => {
      if (draft === undefined) return;
      const parsed = Number.parseInt(draft, 10);
      if (Number.isFinite(parsed)) setZoom(clampZoom(parsed));
      setDraft(undefined);
    },
    cancelDraft: () => setDraft(undefined),
    zoomIn: () => setZoom((value) => clampZoom(value + ZOOM_STEP)),
    zoomOut: () => setZoom((value) => clampZoom(value - ZOOM_STEP)),
  };
}

/** The −/percentage/+ control. Commits a typed percentage on blur or Enter. */
export function ZoomStepper({ control }: { control: ZoomControl }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
      <button
        type="button"
        aria-label={t('workspace:zoom.out')}
        onClick={control.zoomOut}
        disabled={control.zoom <= MIN_ZOOM}
        className="rounded-md px-3 py-1 text-lg leading-none transition hover:bg-white/15 disabled:opacity-40"
      >
        −
      </button>
      <input
        value={control.draft ?? `${control.zoom}`}
        onChange={(event) => control.setDraft(event.target.value)}
        onBlur={control.commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            control.commitDraft();
          }
          if (event.key === 'Escape') control.cancelDraft();
        }}
        aria-label={t('workspace:zoom.label')}
        inputMode="numeric"
        className="w-14 rounded-md bg-white/10 px-2 py-1 text-center text-sm tabular-nums outline-none focus:bg-white/20"
      />
      <span className="pe-1 text-sm">%</span>
      <button
        type="button"
        aria-label={t('workspace:zoom.in')}
        onClick={control.zoomIn}
        disabled={control.zoom >= MAX_ZOOM}
        className="rounded-md px-3 py-1 text-lg leading-none transition hover:bg-white/15 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
