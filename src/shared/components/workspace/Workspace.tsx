import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { releaseDocumentsExcept } from '../../pdf/pdfRender.ts';
import { useStore } from '../../state/store.tsx';
import { clearSessionPassword } from '../../state/sessionPassword.ts';
import { clearSession } from '../../state/persistence/sessionStore.ts';
import { ROTATION_STEP } from '../../lib/rotation.ts';
import { isPageInRange } from '../../lib/watermarkGeometry.ts';
import { useDragSensors } from '../dnd/useDragSensors.ts';
import { RedoIcon, RotateIcon, UndoIcon } from '../icons.tsx';
import { PageThumb } from './PageThumb.tsx';
import { PageZoom } from './PageZoom.tsx';
import { useWorkspacePreviewMark } from './workspacePreview.tsx';

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
  // A live, un-applied mark published by the active tool's panel (Watermark). Undefined elsewhere.
  const previewMark = useWorkspacePreviewMark();

  const sourcesById = useMemo(
    () => new Map(state.sources.map((source) => [source.id, source])),
    [state.sources],
  );

  // Drop parsed pdf.js documents for sources that have left the session (e.g. Start over).
  useEffect(() => {
    releaseDocumentsExcept(new Set(state.sources.map((source) => source.id)));
  }, [state.sources]);

  // Shared with the images-to-PDF grid — see useDragSensors for why the numbers matter.
  const sensors = useDragSensors();

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
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2">
        {/* SPEC.md §1.4's "{pages} from {files}". The two counts pluralise independently, so each
            is resolved on its own before being composed — i18next keys carry a single `count`. */}
        <p className="text-sm font-bold text-stone-700">
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
            onClick={() => {
              // The unlock password is cleared on Start Over (`spec/edge-cases.md`).
              clearSessionPassword();
              // ...as is the autosaved session: Start Over is one of the three explicit clears
              // (with Restore and Dismiss). Nothing else deletes a saved record.
              void clearSession();
              dispatch({ type: 'RESET' });
            }}
            className="ms-1 rounded-lg px-3 py-1.5 text-sm font-bold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
          >
            {t('workspace:actions.startOver')}
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={state.pages.map((page) => page.id)} strategy={rectSortingStrategy}>
          {/* Capped at 4 columns on desktop (was 5) so thumbnails render larger and more legible.
              Intermediate breakpoints scale down with it, and the grid now shares its row with the
              sticky action panel, so it has less width to work with than before. */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {state.pages.map((page, index) => {
              const source = sourcesById.get(page.sourceId);
              if (!source) return null;
              // Range is 1-based over the plan, so `position` is what it is checked against — via
              // the shared `isPageInRange`, the same predicate the bake uses.
              const showMark = previewMark && isPageInRange(index + 1, previewMark.draft.range);
              return (
                <PageThumb
                  key={page.id}
                  page={page}
                  source={source}
                  position={index + 1}
                  {...(showMark ? { mark: previewMark } : {})}
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
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
