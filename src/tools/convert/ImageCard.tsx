import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { DeletePagesIcon, RotateIcon, ZoomIcon } from '../../shared/components/icons.tsx';
import type { StagedImage } from './useImageList.ts';

export interface ImageCardProps {
  readonly image: StagedImage;
  readonly position: number;
  readonly onRotate: (direction: 1 | -1) => void;
  readonly onRemove: () => void;
  readonly onEnlarge: () => void;
}

/**
 * A staged image in the reorderable grid. Shares the drag sensors and zoom-modal chrome with the
 * page workspace via `shared/` rather than re-implementing them (`spec/maintainability.md` #9).
 */
export function ImageCard({ image, position, onRotate, onRemove, onEnlarge }: ImageCardProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative rounded-xl border bg-white p-2 ${
        isDragging ? 'z-10 border-sky-400 shadow-lg' : 'border-slate-200'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        onDoubleClick={onEnlarge}
        aria-label={image.name}
        className="flex h-32 cursor-grab touch-none items-center justify-center overflow-hidden rounded-lg bg-slate-100 active:cursor-grabbing"
      >
        <img
          src={image.url}
          alt={image.name}
          style={{ transform: `rotate(${image.rotation}deg)` }}
          className="max-h-full max-w-full object-contain transition-transform"
        />
      </div>

      <p className="mt-2 truncate text-xs text-slate-500" title={image.name}>
        {position}. {image.name}
      </p>

      <div className="mt-1 flex items-center gap-0.5">
        <IconButton label={t('image-to-pdf:rotateLeft')} onClick={() => onRotate(-1)}>
          <RotateIcon className="size-4" />
        </IconButton>
        <IconButton label={t('image-to-pdf:rotateRight')} onClick={() => onRotate(1)}>
          <RotateIcon className="size-4 -scale-x-100" />
        </IconButton>
        <IconButton label={t('workspace:page.enlarge')} onClick={onEnlarge}>
          <ZoomIcon className="size-4" />
        </IconButton>
        <IconButton label={t('image-to-pdf:remove')} onClick={onRemove} danger>
          <DeletePagesIcon className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Colour-only hover, no transform — scale motion reads oddly at icon size
      // (`spec/edge-cases.md`, "UI / interaction").
      className={`rounded-md p-1.5 text-slate-400 transition-colors ${
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-sky-50 hover:text-sky-600'
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
