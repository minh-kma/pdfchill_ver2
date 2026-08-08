import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCard } from '../shared/components/ToolCard.tsx';
import { CATEGORIES, TOOLS, type ToolCategory } from '../toolRegistry.ts';

/** 'all' is the default tab; the rest come from the registry's category list. */
type Filter = ToolCategory | 'all';

/**
 * Hero + category filter tabs + tool card grid.
 *
 * Both the tabs and the grid are generated from the tool registry. The filter is pure client-side
 * component state by design: selecting a category must not navigate or change the URL, so there is
 * exactly one canonical, indexable homepage URL per language.
 */
export function HomePage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');

  const visibleTools = useMemo(
    () => (filter === 'all' ? TOOLS : TOOLS.filter((tool) => tool.category === filter)),
    [filter],
  );

  const tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: t('home:filterAll') },
    ...CATEGORIES.map((category) => ({ id: category.id as Filter, label: t(category.labelKey) })),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20">
      <section className="py-14 text-center sm:py-20">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {t('home:heroTitle')}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
          {t('home:heroSubtitle')}
        </p>
      </section>

      <div
        role="tablist"
        aria-label={t('home:filterLabel')}
        className="flex flex-wrap justify-center gap-2"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === filter;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-center text-sm text-slate-400">
        {t('home:toolCount', { count: visibleTools.length })}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}
