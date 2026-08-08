import type { ToolPageProps } from '../../toolRegistry.ts';
import { BuildAction } from './BuildAction.tsx';
import { OrganizeToolShell } from './OrganizeToolShell.tsx';

/**
 * Rotate pages (SPEC.md §1.4). Per-page rotation and "Rotate all" both live in the shared
 * workspace toolbar; each click adds 90° to the stored rotation (cumulative, normalized to
 * 0..359), and `copyPagesToPdf` adds that on top of the page's existing /Rotate rather than
 * replacing it.
 */
export function RotateTool({ tool }: ToolPageProps) {
  return (
    <OrganizeToolShell tool={tool}>
      <BuildAction labelKey="rotate:action" suffix="rotated" />
    </OrganizeToolShell>
  );
}
