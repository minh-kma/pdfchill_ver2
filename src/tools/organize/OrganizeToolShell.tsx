import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { FileDropzone } from '../../shared/components/FileDropzone.tsx';
import { Workspace } from '../../shared/components/workspace/Workspace.tsx';
import { WorkspacePreviewProvider } from '../../shared/components/workspace/workspacePreview.tsx';
import { useStore } from '../../shared/state/store.tsx';
import { useAddSources } from '../../shared/state/useAddSources.tsx';
import type { ToolDefinition } from '../../toolRegistry.ts';

export interface OrganizeToolShellProps {
  readonly tool: ToolDefinition;
  /** Merge picks several files at once; the rest work on one document. */
  readonly multiple?: boolean;
  /**
   * Keep the picker on screen even once pages are loaded. Merge needs this: it exists to combine a
   * second file in, so it must never be gated behind "a document is already loaded" (SPEC.md §1.1).
   */
  readonly keepUploader?: boolean;
  /** i18n key for the picker's button, defaulting to the generic one. */
  readonly uploadButtonKey?: string;
  /** The tool's own controls and primary action, shown once there are pages. */
  readonly children: ReactNode;
}

/**
 * Common layout for the five Organize tools: registry-driven heading, file input, the shared
 * `Workspace`, then the tool's own action area.
 *
 * The page plan lives in the app-level store, so a document loaded here stays loaded when the user
 * moves to another Organize tool — SPEC.md's model is one working session shared by every tool
 * (§3.1), not a fresh upload per screen.
 */
export function OrganizeToolShell({
  tool,
  multiple = false,
  keepUploader = false,
  uploadButtonKey = 'workspace:upload.button',
  children,
}: OrganizeToolShellProps) {
  const { t } = useTranslation();
  const { state } = useStore();
  const { addFiles, busy, error, clearError, passwordPrompt } = useAddSources();

  const hasPages = state.pages.length > 0;

  return (
    /* Wider than before: the layout below now puts the action panel beside the grid, not under it. */
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6">
        {/* Title and description come from the registry entry — never hardcoded per tool. */}
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t(tool.nameKey)}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">{t(tool.descriptionKey)}</p>
      </header>

      {error && <ErrorBanner error={error} onDismiss={clearError} />}

      {(!hasPages || keepUploader) && (
        <div className={hasPages ? 'mb-6' : ''}>
          <FileDropzone
            multiple={multiple}
            compact={hasPages}
            busy={busy}
            title={t(hasPages ? 'workspace:upload.addTitle' : 'workspace:upload.title')}
            subtitle={t(multiple ? 'workspace:upload.subtitleMulti' : 'workspace:upload.subtitle')}
            buttonLabel={t(uploadButtonKey)}
            onFiles={(files) => void addFiles(files)}
          />
        </div>
      )}

      {hasPages && (
        /*
         * Two columns from `lg` up: the thumbnail grid scrolls with the page while the tool's
         * action area stays put beside it. Below `lg` this collapses to the previous stacked
         * layout (grid, then actions underneath) — at tablet width a 360px panel would leave the
         * grid too narrow to show more than one or two thumbnails.
         *
         * `sticky`, not `fixed` + an inner-scrolling grid: the grid is a dnd-kit drag surface, and
         * putting it in its own scroll container breaks drag auto-scroll and adds a second
         * scrollbar. Sticky gives the same "always reachable" result using the page's own scroll.
         *
         * `items-start` is load-bearing — a stretched grid item is full-height, which leaves
         * `sticky` nothing to travel within.
         */
        /* The provider wraps both columns: the panel (a sibling of the grid) publishes a live
           preview mark into it, and the grid reads it. See workspacePreview.tsx. */
        <WorkspacePreviewProvider>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <Workspace />
            <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
              {children}
            </aside>
          </div>
        </WorkspacePreviewProvider>
      )}

      {/* An encrypted upload is decrypted here, before it can reach the store. */}
      {passwordPrompt}
    </div>
  );
}
