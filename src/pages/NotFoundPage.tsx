import { useTranslation } from 'react-i18next';
import { buildPath } from '../shared/lib/routes.ts';
import { useLanguage } from '../shared/i18n/useLanguage.ts';
import { Link } from '../shared/router/Link.tsx';

export function NotFoundPage() {
  const { t } = useTranslation();
  const language = useLanguage();

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-h1 text-stone-900">{t('common:notFound.title')}</h1>
      <p className="mt-3 text-stone-600">{t('common:notFound.body')}</p>
      <Link
        to={buildPath(undefined, language)}
        className="mt-8 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        {t('common:notFound.cta')}
      </Link>
    </div>
  );
}
