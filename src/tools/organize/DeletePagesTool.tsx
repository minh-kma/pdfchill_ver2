import type { ToolPageProps } from '../../toolRegistry.ts';
import { BuildAction } from './BuildAction.tsx';
import { OrganizeToolShell } from './OrganizeToolShell.tsx';

/**
 * Delete pages (SPEC.md §1.4). Deleting removes the entry from the page plan only — the source
 * file's bytes stay in `sources`, which is what lets undo put the page back without re-reading the
 * file. Output simply omits pages that are no longer in the plan.
 */
export function DeletePagesTool({ tool }: ToolPageProps) {
  return (
    <OrganizeToolShell tool={tool}>
      <BuildAction labelKey="delete-pages:action" suffix="pages-removed" />
    </OrganizeToolShell>
  );
}
