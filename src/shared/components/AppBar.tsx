import { useTranslation } from 'react-i18next';
import { buildPath } from '../lib/routes.ts';
import { useLanguage } from '../i18n/useLanguage.ts';
import { Link } from '../router/Link.tsx';
import { AllToolsMenu } from './AllToolsMenu.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import { LogoIcon } from './icons.tsx';

/**
 * Nav bar: logo on the left, exactly one dropdown ("All PDF Tools"), language links on the right.
 * Individual tool links belong in the dropdown and on the homepage grid — not here.
 */
export function AppBar() {
  const { t } = useTranslation();
  const language = useLanguage();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <Link
          to={buildPath(undefined, language)}
          aria-label={t('nav:home')}
          className="flex items-center gap-2 rounded-lg px-1 py-1 text-lg font-extrabold tracking-tight text-slate-900"
        >
          <LogoIcon className="size-6 text-sky-600" />
          {t('common:appName')}
        </Link>

        <div className="ms-2">
          <AllToolsMenu />
        </div>

        <div className="ms-auto">
          <LanguageSwitcher />
        </div>
      </nav>
    </header>
  );
}
