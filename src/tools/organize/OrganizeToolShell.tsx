import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { FileDropzone } from '../../shared/components/FileDropzone.tsx';
import { Workspace } from '../../shared/components/workspace/Workspace.tsx';
import { useStore } from '../../shared/state/store.tsx';
import { useAddSources } from '../../shared/state/useAddSources.ts';
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
  const { addFiles, busy, error, clearError } = useAddSources();

  const hasPages = state.pages.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
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
        <>
          <Workspace />
          <div className="mt-6">{children}</div>
        </>
      )}
    </div>
  );
}
