import { useTranslation } from 'react-i18next';
import { buildPath } from '../lib/routes.ts';
import { useLanguage } from '../i18n/useLanguage.ts';
import { Link } from '../router/Link.tsx';
import { toolIconTone } from './icons.tsx';
import type { ToolDefinition } from '../../toolRegistry.ts';

/** Renders a registry entry. Every card on the homepage is this component; there are no per-tool */
/** card variants and no hand-written card copy. */
export function ToolCard({ tool }: { tool: ToolDefinition }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const Icon = tool.icon;

  return (
    <Link
      to={buildPath(tool.slug, language)}
      // No border. The card reads as a card because white sits 1.16:1 above --color-canvas, which
      // holds even with shadows off; the shadow is depth, not the edge. A border here would just
      // draw a hard line around a shape that already separates.
      className="group flex h-full flex-col rounded-card bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      {/*
        The tile's tint and both icon tones come from one call keyed on the tool's registry
        category, so the icon is the same hue as the filter tab that selects it. Nothing here
        names a tool or a colour — see toolIconTone() in icons.tsx.
      */}
      <span
        style={toolIconTone(tool.category)}
        className="mb-4 grid size-11 place-items-center rounded-tile"
      >
        <Icon className="size-6" />
      </span>
      <h3 className="text-h3 text-stone-900">{t(tool.nameKey)}</h3>
      <p className="mt-1.5 text-small text-stone-600">{t(tool.descriptionKey)}</p>
    </Link>
  );
}
