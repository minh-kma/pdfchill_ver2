import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildPath } from '../lib/routes.ts';
import { useLanguage } from '../i18n/useLanguage.ts';
import { Link } from '../router/Link.tsx';
import { toolsByCategory } from '../../toolRegistry.ts';
import { ChevronDownIcon } from './icons.tsx';

/**
 * The nav bar's one and only dropdown. Its entire contents — the category groups, their order, the
 * tools in each and their links — are generated from the tool registry. Nothing tool-specific is
 * written here, and by design there are no featured/quick-access tool links on the nav bar itself.
 */
export function AllToolsMenu() {
  const { t } = useTranslation();
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Outside-click is a `mousedown` document listener, NOT an invisible fixed backdrop element:
  // the header has `backdrop-blur`, which makes it the containing block for `position: fixed`
  // descendants, so a `fixed inset-0` backdrop would be trapped inside the header's own box and
  // never catch clicks on the page below (SPEC.md §2). `mousedown` rather than `click` so the
  // outside click still reaches whatever is underneath it.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: globalThis.MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const groups = toolsByCategory();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100 hover:text-stone-900"
      >
        {t('nav:allTools')}
        <ChevronDownIcon className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute start-0 top-full z-50 mt-2 w-[min(92vw,56rem)] rounded-2xl border border-stone-200 bg-white p-5 shadow-xl shadow-stone-900/5"
        >
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(({ category, tools }) => (
              <section key={category.id}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                  {t(category.labelKey)}
                </h3>
                <ul className="space-y-0.5">
                  {tools.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <li key={tool.id}>
                        <Link
                          role="menuitem"
                          to={buildPath(tool.slug, language)}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-stone-700 transition hover:bg-brand-50 hover:text-brand-700"
                        >
                          <Icon className="size-4.5 shrink-0 text-stone-500" />
                          {t(tool.nameKey)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
