import { ZoomModalChrome } from '../../shared/components/ZoomModalChrome.tsx';
import { ZoomStepper, useZoomControl } from '../../shared/components/ZoomStepper.tsx';
import type { StagedImage } from './useImageList.ts';

const BASE_WIDTH = 620;

/** Full-screen single-image view. Chrome and zoom control are the shared ones. */
export function ImageZoom({ image, onClose }: { image: StagedImage; onClose: () => void }) {
  const zoom = useZoomControl(image.id);

  return (
    <ZoomModalChrome
      title={image.name}
      controls={<ZoomStepper control={zoom} />}
      escapeHandledByCaller={zoom.isEditing}
      onClose={onClose}
    >
      <div className="mx-auto w-fit">
        <img
          src={image.url}
          alt={image.name}
          style={{
            width: Math.round((BASE_WIDTH * zoom.zoom) / 100),
            transform: `rotate(${image.rotation}deg)`,
          }}
          className="h-auto rounded bg-white shadow-2xl transition-transform"
        />
      </div>
    </ZoomModalChrome>
  );
}
