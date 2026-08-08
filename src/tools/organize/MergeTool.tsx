import type { ToolPageProps } from '../../toolRegistry.ts';
import { BuildAction } from './BuildAction.tsx';
import { OrganizeToolShell } from './OrganizeToolShell.tsx';

/**
 * Merge (SPEC.md §1.1).
 *
 * `keepUploader` is the whole difference from the other Organize tools: merge exists to combine an
 * additional file in, so the picker stays available instead of being gated behind "a document must
 * already be loaded". Each picked file's pages are appended, in file order, after the pages already
 * in the plan (`ADD_SOURCE`), and the user fixes the combined order in the workspace below.
 */
export function MergeTool({ tool }: ToolPageProps) {
  return (
    <OrganizeToolShell tool={tool} multiple keepUploader uploadButtonKey="merge:addFiles">
      <BuildAction labelKey="merge:action" suffix="merged" />
    </OrganizeToolShell>
  );
}
