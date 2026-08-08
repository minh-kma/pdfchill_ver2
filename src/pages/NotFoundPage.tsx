import { useTranslation } from 'react-i18next';
import { buildPath } from '../shared/lib/routes.ts';
import { useLanguage } from '../shared/i18n/useLanguage.ts';
import { Link } from '../shared/router/Link.tsx';

export function NotFoundPage() {
  const { t } = useTranslation();
  const language = useLanguage();

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-slate-900">{t('common:notFound.title')}</h1>
      <p className="mt-3 text-slate-600">{t('common:notFound.body')}</p>
      <Link
        to={buildPath(undefined, language)}
        className="mt-8 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        {t('common:notFound.cta')}
      </Link>
    </div>
  );
}
