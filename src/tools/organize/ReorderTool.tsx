import type { ToolPageProps } from '../../toolRegistry.ts';
import { BuildAction } from './BuildAction.tsx';
import { OrganizeToolShell } from './OrganizeToolShell.tsx';

/**
 * Reorder pages (SPEC.md §1.4). Dragging dispatches `REORDER` with the full reordered array, and
 * that array order is what `copyPagesToPdf` writes out — there is no separate "apply order" step.
 */
export function ReorderTool({ tool }: ToolPageProps) {
  return (
    <OrganizeToolShell tool={tool}>
      <BuildAction labelKey="reorder:action" suffix="reordered" />
    </OrganizeToolShell>
  );
}
