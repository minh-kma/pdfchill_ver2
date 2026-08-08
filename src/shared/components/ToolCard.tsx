import { useTranslation } from 'react-i18next';
import { buildPath } from '../lib/routes.ts';
import { useLanguage } from '../i18n/useLanguage.ts';
import { Link } from '../router/Link.tsx';
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
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-900/5"
    >
      <span className="mb-4 grid size-11 place-items-center rounded-xl bg-sky-50 text-sky-600 transition group-hover:bg-sky-100">
        <Icon className="size-6" />
      </span>
      <h3 className="text-base font-bold text-slate-900">{t(tool.nameKey)}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(tool.descriptionKey)}</p>
    </Link>
  );
}
