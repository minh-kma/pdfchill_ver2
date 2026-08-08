import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="mt-auto border-t border-slate-200 py-8">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500">
        {t('common:footer.tagline')}
      </div>
    </footer>
  );
}
