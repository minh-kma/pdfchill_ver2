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
      <section className="relative isolate py-14 text-center sm:py-20">
        {/*
          Two blurred brand shapes behind the heading — pure CSS, no image files and no external
          asset, so nothing here can become a network request the CSP has to allow. Hidden below
          `sm`, where they would sit behind the text rather than around it.

          Deliberately NOT `overflow-hidden`: a blur's falloff extends roughly 3x its radius past
          the element box, so clipping the wrapper cuts the fade off mid-gradient and produces a
          hard edge instead of a glow. Nothing widens the page instead:
            - the square hangs off the START edge, and inline-start overflow does not extend
              scrollWidth in LTR, so it cannot produce a horizontal scrollbar;
            - the circle is inset `end-12` (48px), comfortably more than its own ~42px falloff,
              so its fade finishes inside the section box rather than past the END edge.
          Move the circle outward and you get a horizontal scrollbar at narrow widths.
        */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -start-2 top-4 hidden size-32 rotate-6 rounded-[2rem] bg-brand-200/70 blur-[10px] sm:block" />
          <div className="absolute end-12 top-1/2 hidden size-28 rounded-full bg-brand-200/60 blur-[14px] sm:block" />
        </div>

        {/*
          Two keys, not one string with markup in it: `<Trans>` is used nowhere else in this app,
          and a lone abstraction is worse than a second key.

          Each half is its own block so the two wrap independently — the accent always starts a
          line, and a long lead can never push a stray accent word up onto the lead's last line.
        */}
        {/*
          `max-w-5xl` is the heading's alone — the subtitle, tabs and grid keep their own widths.
          Measured, not chosen by eye: at the 3.5rem display ceiling the Vietnamese accent line is
          852px and the English one 992px, so at the previous 768px BOTH wrapped, and no font size
          fixes it — English needs 1.29x the width, so shrinking scales both strings equally and
          still orphans "PDFChill". 1024px is the first step that puts each accent on one line.
        */}
        <h1 className="mx-auto max-w-5xl text-display text-stone-900">
          <span className="block">{t('home:heroTitleLead')}</span>
          <span className="block text-brand-600">{t('home:heroTitleAccent')}</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lead text-stone-600">
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
              // Inactive uses the 200 step, not 100: a 100 chip measures 1.07:1 against the cream
              // canvas and effectively disappears, where 200 reads at 1.27:1. Text is brand-800
              // on it (6.70:1); white on the active brand-600 fill is 5.29:1.
              className={`rounded-full px-4 py-2 text-small font-bold transition ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'bg-brand-200 text-brand-800 hover:bg-brand-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-center text-small text-stone-600">
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
