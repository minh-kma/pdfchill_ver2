import { useTranslation } from 'react-i18next';
import { useLanguage } from '../i18n/useLanguage.ts';
import type { PersistedSession } from '../state/persistence/sessionSchema.ts';

/**
 * Offers a saved session back to the user (`spec/features.md` §1.12).
 *
 * Only rendered when a save was found *and* is within the 5-minute window — the age check happens
 * before this mounts, so there is no "is it too old" logic here. While it is on screen, autosave is
 * suspended (see `useSessionAutosave`), so neither button can race a write.
 *
 * Both buttons clear storage: Restore consumes the save, Dismiss declines it. Those, plus Start
 * Over, are the only things that ever delete a record.
 */
export function SessionRecoveryBanner({
  session,
  onRestore,
  onDismiss,
}: {
  session: PersistedSession;
  onRestore: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const language = useLanguage();

  const fileCount = new Set(session.pages.map((page) => page.sourceId)).size;

  return (
    <div
      role="status"
      className="mx-auto mt-4 flex w-full max-w-5xl flex-wrap items-center gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-900"
    >
      <div className="flex-1">
        <p className="font-bold">{t('session:recovery.title')}</p>
        <p className="text-accent-800">
          {t('session:recovery.summary', {
            // Two independent counts cannot share one plural suffix, so each is resolved on its own
            // and composed — the same pattern `workspace:header` uses (see routing-i18n.md).
            pages: t('session:recovery.pages', { count: session.pages.length }),
            files: t('session:recovery.files', { count: fileCount }),
            when: formatRelativeTime(session.savedAt, Date.now(), language),
          })}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-3 py-1.5 font-bold text-accent-800 transition hover:bg-accent-100"
        >
          {t('session:recovery.dismiss')}
        </button>
        <button
          type="button"
          onClick={onRestore}
          className="rounded-lg bg-brand-600 px-3 py-1.5 font-bold text-white transition hover:bg-brand-700"
        >
          {t('session:recovery.restore')}
        </button>
      </div>
    </div>
  );
}

/**
 * "2 minutes ago", localised by the active language.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-built plural table: it already knows every language's
 * rules, and it follows the UI language automatically. Ages are clamped to whole minutes within the
 * 5-minute window — a save is never older than that when this renders, and "just now" reads better
 * than "0 minutes ago" for a fresh one.
 */
function formatRelativeTime(savedAt: number, now: number, language: string): string {
  const minutes = Math.round((savedAt - now) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  return minutes === 0 ? formatter.format(0, 'second') : formatter.format(minutes, 'minute');
}
