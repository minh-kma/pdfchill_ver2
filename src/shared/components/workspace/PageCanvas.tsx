import { useEffect, useRef, useState } from 'react';
import { renderPage } from '../../pdf/pdfRender.ts';
import type { PageItem, SourceDoc } from '../../state/types.ts';

export interface PageCanvasProps {
  readonly source: SourceDoc;
  readonly page: PageItem;
  /** Target CSS width in px. */
  readonly width: number;
  readonly className?: string;
  /** The page's unscaled size in PDF points, for callers mapping points to preview pixels. */
  readonly onPageSize?: (widthPt: number, heightPt: number) => void;
}

/**
 * One rendered page. The single place a PDF page is drawn to a canvas — the thumbnail grid and the
 * zoom modal both use it, so there is one render/abort implementation rather than one per caller.
 */
export function PageCanvas({ source, page, width, className, onPageSize }: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new AbortController();
    setStatus('loading');

    renderPage({
      sourceId: source.id,
      bytes: source.bytes,
      pageIndex: page.sourceIndex,
      rotation: page.rotation,
      width,
      canvas,
      signal: controller.signal,
      ...(onPageSize ? { onPageSize } : {}),
    })
      .then(() => {
        if (!controller.signal.aborted) setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });

    return () => controller.abort();
  }, [source.id, source.bytes, page.sourceIndex, page.rotation, width]);

  return (
    <canvas
      ref={canvasRef}
      className={`${className ?? ''} ${status === 'ready' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150`}
    />
  );
}
