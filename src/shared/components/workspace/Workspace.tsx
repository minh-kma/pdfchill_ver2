import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { releaseDocumentsExcept } from '../../pdf/pdfRender.ts';
import { useStore } from '../../state/store.tsx';
import { ROTATION_STEP } from '../../lib/rotation.ts';
import { RedoIcon, RotateIcon, UndoIcon } from '../icons.tsx';
import { PageThumb } from './PageThumb.tsx';
import { PageZoom } from './PageZoom.tsx';

/**
 * The shared page workspace: thumbnail grid, drag-to-reorder, per-page rotate/delete, enlarge.
 *
 * SPEC.md §1.4 bundles rotate / delete / reorder into one screen, and all five Organize tools use
 * this same component — they differ only in the action they offer below it, not in how pages are
 * manipulated. Do not fork this per tool.
 */
export function Workspace() {
  const { t } = useTranslation();
  const { state, dispatch, canUndo, canRedo, fileCount } = useStore();
  const [zoomedPageId, setZoomedPageId] = useState<string>();

  const sourcesById = useMemo(
    () => new Map(state.sources.map((source) => [source.id, source])),
    [state.sources],
  );

  // Drop parsed pdf.js documents for sources that have left the session (e.g. Start over).
  useEffect(() => {
    releaseDocumentsExcept(new Set(state.sources.map((source) => source.id)));
  }, [state.sources]);

  const sensors = useSensors(
    // 6px of movement before a drag starts, so clicking a thumbnail's rotate/delete button never
    // turns into a drag; touch needs a 150ms hold with 6px tolerance (SPEC.md §1.4).
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = state.pages.findIndex((page) => page.id === active.id);
    const to = state.pages.findIndex((page) => page.id === over.id);
    if (from === -1 || to === -1) return;
    // The full reordered array is dispatched; its order *is* the output order (SPEC.md §1.4).
    dispatch({ type: 'REORDER', pages: arrayMove([...state.pages], from, to) });
  }

  const zoomedIndex = state.pages.findIndex((page) => page.id === zoomedPageId);
  const zoomedPage = zoomedIndex === -1 ? undefined : state.pages[zoomedIndex];
  const zoomedSource = zoomedPage ? sourcesById.get(zoomedPage.sourceId) : undefined;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        {/* SPEC.md §1.4's "{pages} from {files}". The two counts pluralise independently, so each
            is resolved on its own before being composed — i18next keys carry a single `count`. */}
        <p className="text-sm font-semibold text-slate-700">
          {t('workspace:header.summary', {
            pages: t('workspace:header.pages', { count: state.pages.length }),
            files: t('workspace:header.files', { count: fileCount }),
          })}
        </p>

        <div className="ms-auto flex items-center gap-1">
          <ToolbarButton
            label={t('workspace:actions.rotateAll')}
            onClick={() => dispatch({ type: 'ROTATE_ALL', delta: ROTATION_STEP })}
            disabled={state.pages.length === 0}
          >
            <RotateIcon className="size-4" />
            <span className="hidden sm:inline">{t('workspace:actions.rotateAll')}</span>
          </ToolbarButton>

          {/* SPEC.md §1.12 puts these in the AppBar; the nav bar is registry-generated and out of
              scope for this step, so the workspace toolbar owns them. The keyboard shortcuts are
              global either way (useUndoRedoShortcuts). */}
          <ToolbarButton
            label={t('workspace:actions.undo')}
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={!canUndo}
          >
            <UndoIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={t('workspace:actions.redo')}
            onClick={() => dispatch({ type: 'REDO' })}
            disabled={!canRedo}
          >
            <RedoIcon className="size-4" />
          </ToolbarButton>

          <button
            type="button"
            onClick={() => dispatch({ type: 'RESET' })}
            className="ms-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            {t('workspace:actions.startOver')}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={state.pages.map((page) => page.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {state.pages.map((page, index) => {
              const source = sourcesById.get(page.sourceId);
              if (!source) return null;
              return (
                <PageThumb
                  key={page.id}
                  page={page}
                  source={source}
                  position={index + 1}
                  onRotate={() =>
                    dispatch({ type: 'ROTATE_PAGE', pageId: page.id, delta: ROTATION_STEP })
                  }
                  onDelete={() => dispatch({ type: 'DELETE_PAGE', pageId: page.id })}
                  onEnlarge={() => setZoomedPageId(page.id)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {zoomedPage && zoomedSource && (
        <PageZoom
          page={zoomedPage}
          source={zoomedSource}
          position={zoomedIndex + 1}
          onClose={() => setZoomedPageId(undefined)}
        />
      )}
    </section>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
