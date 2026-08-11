import { useRef, useState } from 'react';
import { PageCanvas } from '../../shared/components/workspace/PageCanvas.tsx';
import {
  useElementBox,
  WatermarkOverlay,
  type WatermarkMark,
} from '../../shared/components/workspace/WatermarkOverlay.tsx';

const PREVIEW_WIDTH = 300;

export interface WatermarkPreviewProps {
  readonly page: PageItemLike;
  readonly source: SourceDocLike;
  readonly mark: WatermarkMark;
}

type PageItemLike = React.ComponentProps<typeof PageCanvas>['page'];
type SourceDocLike = React.ComponentProps<typeof PageCanvas>['source'];

/**
 * Large sample preview of one page with the watermark overlaid.
 *
 * The drawing itself is `WatermarkOverlay`, shared with every thumbnail in the workspace grid, which
 * in turn takes its positions from `shared/lib/watermarkGeometry.ts` — the same functions the bake
 * feeds to pdf-lib. `spec/maintainability.md` pain point #6 is precisely this preview having once
 * been an independent reimplementation of that formula; it must not become one again.
 *
 * All this component owns is the page render and the box measurement.
 */
export function WatermarkPreview({ page, source, mark }: WatermarkPreviewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const box = useElementBox(boxRef);
  const [pageWidthPt, setPageWidthPt] = useState(0);

  return (
    <div ref={boxRef} className="relative mx-auto w-fit">
      <PageCanvas
        source={source}
        page={page}
        width={PREVIEW_WIDTH}
        className="block rounded shadow"
        onPageSize={(widthPt) => setPageWidthPt(widthPt)}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <WatermarkOverlay
          mark={mark}
          boxWidth={box.width}
          boxHeight={box.height}
          pageWidthPt={pageWidthPt}
        />
      </div>
    </div>
  );
}
