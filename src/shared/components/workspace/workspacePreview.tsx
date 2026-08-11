import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { WatermarkMark } from './WatermarkOverlay.tsx';

/**
 * A one-slot channel letting the active tool show a live mark over the shared `Workspace`
 * thumbnails, without `Workspace` knowing which tool is mounted.
 *
 * `OrganizeToolShell` renders `Workspace` and the tool's panel as *siblings*, so the panel cannot
 * provide context to the grid. The shell owns the slot instead: the panel publishes into it, the
 * grid reads from it. That keeps the fix at the shell level — `Workspace` is shared by five tools
 * and must not be forked per tool.
 *
 * Deliberately not part of `AppState`: this is an un-applied editing preview, not document data. It
 * must never be undoable, and must never reach the autosaved session.
 */
interface WorkspacePreviewValue {
  readonly mark: WatermarkMark | undefined;
  readonly setMark: (mark: WatermarkMark | undefined) => void;
}

const WorkspacePreviewContext = createContext<WorkspacePreviewValue | undefined>(undefined);

export function WorkspacePreviewProvider({ children }: { children: ReactNode }) {
  const [mark, setMark] = useState<WatermarkMark | undefined>(undefined);
  const value = useMemo(() => ({ mark, setMark }), [mark]);
  return (
    <WorkspacePreviewContext.Provider value={value}>{children}</WorkspacePreviewContext.Provider>
  );
}

/** Read side, used by `Workspace`. Returns undefined outside a provider, so the grid still works. */
export function useWorkspacePreviewMark(): WatermarkMark | undefined {
  return useContext(WorkspacePreviewContext)?.mark;
}

/**
 * Write side, used by a tool panel. Publishes while mounted and clears on unmount, so navigating
 * away from the tool takes the overlay with it.
 */
export function usePublishWorkspacePreview(mark: WatermarkMark | undefined): void {
  const context = useContext(WorkspacePreviewContext);
  const setMark = context?.setMark;

  useEffect(() => {
    if (!setMark) return;
    setMark(mark);
    return () => setMark(undefined);
  }, [setMark, mark]);
}
