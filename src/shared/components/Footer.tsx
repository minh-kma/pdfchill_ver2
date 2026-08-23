import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="mt-auto border-t border-stone-200 py-8">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-stone-600">
        {t('common:footer.tagline')}
      </div>
    </footer>
  );
}
