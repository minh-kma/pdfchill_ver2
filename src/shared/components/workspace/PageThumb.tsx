import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import type { PageItem, SourceDoc } from '../../state/types.ts';
import { DeletePagesIcon, RotateIcon, ZoomIcon } from '../icons.tsx';
import { PageCanvas } from './PageCanvas.tsx';

const THUMB_WIDTH = 200;

export interface PageThumbProps {
  readonly page: PageItem;
  readonly source: SourceDoc;
  /** 1-based position in the plan — what the user sees as the page number. */
  readonly position: number;
  readonly onRotate: () => void;
  readonly onDelete: () => void;
  readonly onEnlarge: () => void;
}

export function PageThumb({ page, source, position, onRotate, onDelete, onEnlarge }: PageThumbProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative rounded-xl border bg-white p-2 ${
        isDragging ? 'z-10 border-sky-400 shadow-lg' : 'border-slate-200'
      }`}
    >
      {/* The drag handle is the whole card. The 6px pointer activation distance (Workspace's
          sensor config) is what keeps a click on the rotate/delete buttons from starting a drag. */}
      <div
        {...attributes}
        {...listeners}
        onDoubleClick={onEnlarge}
        aria-label={t('workspace:page.label', { number: position })}
        className="flex cursor-grab touch-none items-center justify-center rounded-lg bg-slate-100 p-2 active:cursor-grabbing"
      >
        <PageCanvas
          source={source}
          page={page}
          width={THUMB_WIDTH}
          className="max-h-44 w-auto max-w-full rounded shadow-sm"
        />
      </div>

      <div className="mt-2 flex items-center gap-1">
        <span className="text-xs font-semibold text-slate-500">{position}</span>
        <div className="ms-auto flex items-center gap-0.5">
          <IconButton label={t('workspace:page.enlarge')} onClick={onEnlarge}>
            <ZoomIcon className="size-4" />
          </IconButton>
          <IconButton label={t('workspace:page.rotate')} onClick={onRotate}>
            <RotateIcon className="size-4" />
          </IconButton>
          <IconButton label={t('workspace:page.delete')} onClick={onDelete} danger>
            <DeletePagesIcon className="size-4" />
          </IconButton>
        </div>
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
      // Colour-only hover, no transform: scale motion reads oddly at icon size (SPEC.md §2).
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
