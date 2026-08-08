import { useTranslation } from 'react-i18next';
import type { AppError } from '../state/useAddSources.tsx';

/**
 * Renders a translated error. SPEC.md §5: the UI never shows a raw `Error.message` — callers pass
 * a key produced by `toErrorKey()`.
 */
export function ErrorBanner({ error, onDismiss }: { error: AppError; onDismiss?: () => void }) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <p className="flex-1">{t(error.key, error.params ?? {})}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="font-semibold text-red-600 transition hover:text-red-800"
        >
          {t('workspace:errors.dismiss')}
        </button>
      )}
    </div>
  );
}
