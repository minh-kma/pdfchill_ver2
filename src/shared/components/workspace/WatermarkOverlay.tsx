import { useLayoutEffect, useRef, useState } from 'react';
import {
  WATERMARK_DEFAULTS,
  centredRotatedOrigin,
  watermarkImageBox,
} from '../../lib/watermarkGeometry.ts';
import type { DocAnnotation } from '../../state/types.ts';

/**
 * THE watermark overlay. One implementation, used by both previews:
 *   - the single sample page in `tools/edit/WatermarkPreview.tsx`;
 *   - every thumbnail in the shared `Workspace` grid, via `PageThumb`.
 *
 * `spec/maintainability.md` pain point #6 is this drawing geometry existing as several independent
 * implementations kept in sync by comments. It stays one: the *positions* come from
 * `shared/lib/watermarkGeometry.ts` — the same functions `annotationBake.ts` feeds to pdf-lib — and
 * this component only converts them to CSS. Nothing here recomputes a position, and adding a third
 * place a watermark is drawn must mean reusing this component, not copying it.
 *
 * Purely presentational and `pointer-events-none`: it lays DOM over an already-rendered page canvas
 * and never triggers a re-render of the PDF itself.
 */

/** Everything a preview needs that is expensive to derive, resolved once by the publisher. */
export interface WatermarkMark {
  readonly draft: DocAnnotation;
  /** Object URL for an image watermark. Created once by the publisher, shared by every overlay. */
  readonly assetUrl?: string | undefined;
  /** Natural width/height of the image, resolved once by the publisher. */
  readonly imageAspect: number;
}

export interface WatermarkOverlayProps {
  readonly mark: WatermarkMark;
  /** The rendered page box, in CSS pixels. */
  readonly boxWidth: number;
  readonly boxHeight: number;
  /** The page's unscaled width in PDF points, for scaling the font size. */
  readonly pageWidthPt: number;
}

export function WatermarkOverlay({ mark, boxWidth, boxHeight, pageWidthPt }: WatermarkOverlayProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [textSize, setTextSize] = useState({ width: 0, height: 0 });

  const { draft, assetUrl, imageAspect } = mark;

  // CSS text metrics and pdf-lib's font metrics live in different spaces, so the text's own box is
  // measured locally. Its *placement* is still the shared formula.
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    setTextSize({ width: element.offsetWidth, height: element.offsetHeight });
  }, [draft.text, draft.fontSize, boxWidth]);

  if (boxWidth <= 0 || boxHeight <= 0) return null;

  const opacity = draft.opacity ?? WATERMARK_DEFAULTS.opacity;
  const pointsToPx = pageWidthPt > 0 ? boxWidth / pageWidthPt : 1;

  if (draft.assetId && assetUrl) {
    const imageBox = watermarkImageBox(boxWidth, boxHeight, imageAspect);
    return (
      <img
        src={assetUrl}
        alt=""
        style={{
          position: 'absolute',
          left: imageBox.x,
          // Shared geometry is bottom-left origin; CSS is top-left.
          top: boxHeight - imageBox.y - imageBox.height,
          width: imageBox.width,
          height: imageBox.height,
          opacity,
        }}
      />
    );
  }

  if (!draft.text?.trim()) return null;

  const origin = centredRotatedOrigin(
    textSize.width,
    textSize.height,
    boxWidth,
    boxHeight,
    draft.rotationDeg ?? WATERMARK_DEFAULTS.rotationDeg,
  );

  return (
    <span
      ref={textRef}
      style={{
        position: 'absolute',
        left: origin.x,
        bottom: origin.y,
        // `left bottom` matches pdf-lib rotating about the draw origin, and CSS's positive rotation
        // is clockwise where pdf-lib's is counter-clockwise — hence the negation.
        transformOrigin: 'left bottom',
        transform: `rotate(${-origin.angleDeg}deg)`,
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: (draft.fontSize ?? WATERMARK_DEFAULTS.fontSize) * pointsToPx,
        lineHeight: 1.2,
        color: draft.color ?? WATERMARK_DEFAULTS.color,
        opacity,
        whiteSpace: 'pre',
      }}
    >
      {draft.text}
    </span>
  );
}

/** Tracks an element's rendered box. Shared by both overlay hosts so neither re-implements it. */
export function useElementBox<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setBox({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    setBox({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, [ref]);
  return box;
}
