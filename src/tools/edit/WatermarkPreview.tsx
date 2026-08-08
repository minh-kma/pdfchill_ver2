import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PageCanvas } from '../../shared/components/workspace/PageCanvas.tsx';
import {
  WATERMARK_DEFAULTS,
  centredRotatedOrigin,
  watermarkImageBox,
} from '../../shared/lib/watermarkGeometry.ts';
import type { Asset, DocAnnotation, PageItem, SourceDoc } from '../../shared/state/types.ts';

const PREVIEW_WIDTH = 300;

export interface WatermarkPreviewProps {
  readonly page: PageItem;
  readonly source: SourceDoc;
  readonly draft: DocAnnotation;
  readonly asset: Asset | undefined;
}

/**
 * Live preview of page 1 with the watermark overlaid.
 *
 * **Consumes the same geometry functions the bake does** (`shared/lib/watermarkGeometry.ts`) — the
 * position and angle are not recomputed here. `spec/maintainability.md` pain point #6 is precisely
 * this preview having historically been a third independent implementation of the drawing formula.
 *
 * The only thing measured locally is the text's own box, because CSS text metrics and pdf-lib's
 * font metrics live in different spaces; the *placement* of that box is shared.
 */
export function WatermarkPreview({ page, source, draft, asset }: WatermarkPreviewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState({ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH * 1.414 });
  const [textSize, setTextSize] = useState({ width: 0, height: 0 });
  const [imageAspect, setImageAspect] = useState(1);
  const [pageWidthPt, setPageWidthPt] = useState(0);

  // Track the rendered page's real box so geometry is computed in the same aspect ratio the bake
  // will see.
  useLayoutEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setBox({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    setTextSize({ width: element.offsetWidth, height: element.offsetHeight });
  }, [draft.text, draft.fontSize, box.width]);

  const assetUrl = useObjectUrl(asset);
  useEffect(() => {
    if (!assetUrl) return;
    const image = new Image();
    image.onload = () => setImageAspect(image.naturalWidth / Math.max(1, image.naturalHeight));
    image.src = assetUrl;
  }, [assetUrl]);

  const opacity = draft.opacity ?? WATERMARK_DEFAULTS.opacity;
  // Points -> preview pixels, from the page's real size rather than an assumed paper format.
  const pointsToPx = pageWidthPt > 0 ? box.width / pageWidthPt : 1;
  const fontPx = (draft.fontSize ?? WATERMARK_DEFAULTS.fontSize) * pointsToPx;

  let overlay: React.ReactNode = null;

  if (draft.assetId && assetUrl) {
    const imageBox = watermarkImageBox(box.width, box.height, imageAspect);
    overlay = (
      <img
        src={assetUrl}
        alt=""
        style={{
          position: 'absolute',
          left: imageBox.x,
          // Shared geometry is bottom-left origin; CSS is top-left.
          top: box.height - imageBox.y - imageBox.height,
          width: imageBox.width,
          height: imageBox.height,
          opacity,
        }}
      />
    );
  } else if (draft.text?.trim()) {
    const origin = centredRotatedOrigin(
      textSize.width,
      textSize.height,
      box.width,
      box.height,
      draft.rotationDeg ?? WATERMARK_DEFAULTS.rotationDeg,
    );
    overlay = (
      <span
        ref={textRef}
        style={{
          position: 'absolute',
          left: origin.x,
          bottom: origin.y,
          // `left bottom` matches pdf-lib rotating about the draw origin, and CSS's positive
          // rotation is clockwise where pdf-lib's is counter-clockwise — hence the negation.
          transformOrigin: 'left bottom',
          transform: `rotate(${-origin.angleDeg}deg)`,
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontSize: fontPx,
          lineHeight: 1.2,
          color: draft.color ?? '#888888',
          opacity,
          whiteSpace: 'pre',
        }}
      >
        {draft.text}
      </span>
    );
  }

  return (
    <div ref={boxRef} className="relative mx-auto w-fit">
      <PageCanvas
        source={source}
        page={page}
        width={PREVIEW_WIDTH}
        className="block rounded shadow"
        onPageSize={(widthPt) => setPageWidthPt(widthPt)}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">{overlay}</div>
    </div>
  );
}

function useObjectUrl(asset: Asset | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!asset) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(
      new Blob([asset.bytes.slice().buffer as ArrayBuffer], { type: asset.mimeType }),
    );
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [asset]);
  return url;
}
