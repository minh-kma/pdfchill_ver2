/**
 * THE tool registry — the single source of truth for every tool's identity.
 *
 * Everything tool-shaped in the app is generated from `TOOLS` / `CATEGORIES` below:
 *   - the routing table            -> src/shared/router/Router.tsx
 *   - the "All PDF Tools" dropdown -> src/shared/components/AllToolsMenu.tsx
 *   - the homepage filter tabs     -> src/pages/HomePage.tsx
 *   - the homepage card grid       -> src/pages/HomePage.tsx
 *   - <title>/<meta description>   -> src/shared/seo/useDocumentMeta.ts
 *   - the i18n namespace per tool  -> src/shared/i18n/locales/{en,vi}/{id}.json
 *
 * A tool's id, category, slug, display copy, icon and implementation must appear here and nowhere
 * else. If you find yourself writing a tool's name, slug or category in a second file, that is the
 * bug — see ARCHITECTURE.md.
 *
 * Display copy is referenced by i18n key, never inlined: each tool owns exactly one namespace
 * (named after its id) holding `name`, `description`, `seoTitle` and `seoDescription`.
 */

import type { ComponentType } from 'react';
import {
  CompressIcon,
  DeletePagesIcon,
  type IconComponent,
  ImageToPdfIcon,
  MergeIcon,
  OcrIcon,
  ProtectIcon,
  ReorderIcon,
  RotateIcon,
  SplitIcon,
  UnlockIcon,
  WatermarkIcon,
} from './shared/components/icons.tsx';
import { ComingSoonTool } from './tools/ComingSoonTool.tsx';
import { ImageToPdfTool } from './tools/convert/ImageToPdfTool.tsx';
import { CompressTool } from './tools/optimize/compress/CompressTool.tsx';
import { OcrTool } from './tools/optimize/ocr/OcrTool.tsx';
import { DeletePagesTool } from './tools/organize/DeletePagesTool.tsx';
import { MergeTool } from './tools/organize/MergeTool.tsx';
import { ReorderTool } from './tools/organize/ReorderTool.tsx';
import { RotateTool } from './tools/organize/RotateTool.tsx';
import { SplitTool } from './tools/organize/SplitTool.tsx';

/* --- Categories ---------------------------------------------------------------------------- */

/** Declaration order here is the display order of the filter tabs and the dropdown's groups. */
export const TOOL_CATEGORY_IDS = ['organize', 'optimize', 'convert', 'edit', 'security'] as const;

export type ToolCategory = (typeof TOOL_CATEGORY_IDS)[number];

export interface CategoryDefinition {
  readonly id: ToolCategory;
  /** i18n key, `common` namespace. */
  readonly labelKey: string;
}

export const CATEGORIES: readonly CategoryDefinition[] = TOOL_CATEGORY_IDS.map((id) => ({
  id,
  labelKey: `common:categories.${id}`,
}));

/* --- Tools --------------------------------------------------------------------------------- */

/** Props every tool page receives. The registry entry is passed in, so a tool page never has to */
/** re-state its own id, name or icon. */
export interface ToolPageProps {
  readonly tool: ToolDefinition;
}

export type ToolComponent = ComponentType<ToolPageProps>;

interface ToolSeed {
  readonly id: string;
  readonly category: ToolCategory;
  /** URL segment. English: `/{slug}/`; Vietnamese: `/vi/{slug}/`. See shared/lib/routes.ts. */
  readonly slug: string;
  readonly icon: IconComponent;
  readonly Component: ToolComponent;
}

/**
 * The 11 tools. Every field a tool has is either listed here or derived from `id` below.
 *
 * The Organize five are implemented; the rest are still `ComingSoonTool` and swap in one entry at
 * a time in later steps, with no other file touched.
 */
const TOOL_SEEDS = [
  { id: 'merge', category: 'organize', slug: 'merge-pdf', icon: MergeIcon, Component: MergeTool },
  { id: 'split', category: 'organize', slug: 'split-pdf', icon: SplitIcon, Component: SplitTool },
  { id: 'reorder', category: 'organize', slug: 'reorder-pdf-pages', icon: ReorderIcon, Component: ReorderTool },
  { id: 'delete-pages', category: 'organize', slug: 'delete-pdf-pages', icon: DeletePagesIcon, Component: DeletePagesTool },
  { id: 'rotate', category: 'organize', slug: 'rotate-pdf', icon: RotateIcon, Component: RotateTool },
  { id: 'compress', category: 'optimize', slug: 'compress-pdf', icon: CompressIcon, Component: CompressTool },
  { id: 'ocr', category: 'optimize', slug: 'ocr-pdf', icon: OcrIcon, Component: OcrTool },
  { id: 'image-to-pdf', category: 'convert', slug: 'image-to-pdf', icon: ImageToPdfIcon, Component: ImageToPdfTool },
  { id: 'watermark', category: 'edit', slug: 'watermark-pdf', icon: WatermarkIcon, Component: ComingSoonTool },
  { id: 'protect', category: 'security', slug: 'protect-pdf', icon: ProtectIcon, Component: ComingSoonTool },
  { id: 'unlock', category: 'security', slug: 'unlock-pdf', icon: UnlockIcon, Component: ComingSoonTool },
] as const satisfies readonly ToolSeed[];

export type ToolId = (typeof TOOL_SEEDS)[number]['id'];

export interface ToolDefinition {
  readonly id: ToolId;
  readonly category: ToolCategory;
  readonly slug: string;
  /** i18next namespace owned by this tool. Always equal to `id`. */
  readonly i18nNamespace: string;
  /** i18n keys — resolved with `t()` wherever the tool is displayed. */
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly seoTitleKey: string;
  readonly seoDescriptionKey: string;
  readonly icon: IconComponent;
  readonly Component: ToolComponent;
}

export const TOOLS: readonly ToolDefinition[] = TOOL_SEEDS.map((seed) => ({
  ...seed,
  i18nNamespace: seed.id,
  nameKey: `${seed.id}:name`,
  descriptionKey: `${seed.id}:description`,
  seoTitleKey: `${seed.id}:seoTitle`,
  seoDescriptionKey: `${seed.id}:seoDescription`,
}));

/* --- Derived lookups (never hand-maintain a parallel list) --------------------------------- */

const BY_SLUG = new Map(TOOLS.map((tool) => [tool.slug, tool]));
const BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

/** Router entry point: resolve a URL slug to a tool, or undefined for "no such route". */
export function findToolBySlug(slug: string | undefined): ToolDefinition | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

export function findToolById(id: ToolId): ToolDefinition | undefined {
  return BY_ID.get(id);
}

/** Tools grouped by category, in `CATEGORIES` order, skipping categories with no tools. */
export function toolsByCategory(): readonly { category: CategoryDefinition; tools: ToolDefinition[] }[] {
  return CATEGORIES.map((category) => ({
    category,
    tools: TOOLS.filter((tool) => tool.category === category.id),
  })).filter((group) => group.tools.length > 0);
}
