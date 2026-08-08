import { useTranslation } from 'react-i18next';
import type { ToolPageProps } from '../toolRegistry.ts';

/**
 * Scaffolding placeholder used as the `Component` of every registry entry until that tool's real
 * implementation lands. It reads everything it displays off the passed-in registry entry, so it
 * needs no per-tool variant and duplicates nothing.
 */
export function ComingSoonTool({ tool }: ToolPageProps) {
  const { t } = useTranslation();
  const Icon = tool.icon;

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center">
      <span className="mb-6 grid size-16 place-items-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
        <Icon className="size-8" />
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {t(tool.nameKey)}
      </h1>
      <p className="mt-3 max-w-xl text-slate-600">{t(tool.descriptionKey)}</p>
      <p className="mt-8 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
        {t('common:comingSoon', { tool: t(tool.nameKey) })}
      </p>
    </div>
  );
}
