import { useTranslation } from 'react-i18next';
import { buildPath } from '../lib/routes.ts';
import { useLanguage } from '../i18n/useLanguage.ts';
import { Link } from '../router/Link.tsx';
import { AllToolsMenu } from './AllToolsMenu.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';

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
          {/*
            The real brand mark, not an inline glyph. It is a full-bleed square illustration with
            its own orange ground, so it is clipped to a rounded square the way an app icon is
            rather than dropped in flat. Served from public/ — the same file the web manifest
            points at — so there is one copy of the logo in the build, not a second bundled one.
            `alt=""` because the adjacent wordmark already names the link, and the anchor carries
            its own aria-label; a second announcement of "PDFChill" here would be noise.
          */}
          <img
            src={`${import.meta.env.BASE_URL}icon-192.png`}
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-lg"
          />
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
