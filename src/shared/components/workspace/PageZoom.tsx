import { useTranslation } from 'react-i18next';
import type { PageItem, SourceDoc } from '../../state/types.ts';
import { ZoomModalChrome } from '../ZoomModalChrome.tsx';
import { ZoomStepper, useZoomControl } from '../ZoomStepper.tsx';
import { PageCanvas } from './PageCanvas.tsx';

const BASE_WIDTH = 620;

export interface PageZoomProps {
  readonly page: PageItem;
  readonly source: SourceDoc;
  readonly position: number;
  readonly onClose: () => void;
}

/** Full-screen single-page view, opened by double-clicking a thumbnail (`spec/features.md` §1.4). */
export function PageZoom({ page, source, position, onClose }: PageZoomProps) {
  const { t } = useTranslation();
  const zoom = useZoomControl(page.id);
  const title = t('workspace:page.label', { number: position });

  return (
    <ZoomModalChrome
      title={title}
      controls={<ZoomStepper control={zoom} />}
      // Escape cancels an in-progress percentage edit rather than closing the modal out from
      // under it; only a second Escape closes.
      escapeHandledByCaller={zoom.isEditing}
      onClose={onClose}
    >
      <div className="mx-auto w-fit">
        <PageCanvas
          source={source}
          page={page}
          width={Math.round((BASE_WIDTH * zoom.zoom) / 100)}
          className="h-auto w-auto rounded bg-white shadow-2xl"
        />
      </div>
    </ZoomModalChrome>
  );
}
