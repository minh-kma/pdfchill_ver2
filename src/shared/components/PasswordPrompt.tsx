import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface PasswordPromptProps {
  readonly fileName: string;
  /** True once at least one attempt has failed, so the retry hint is shown. */
  readonly retrying: boolean;
  readonly onSubmit: (password: string) => void;
  /** Continues the rest of a multi-file batch without this file. */
  readonly onSkip: () => void;
}

/**
 * Verifies an *existing* password, with unlimited retries (`spec/features.md` §1.7).
 *
 * Deliberately separate from the Protect tool's form, which collects a *new* password with
 * confirmation — different validation and different copy, and the old app judged unifying them not
 * worth the branching.
 */
export function PasswordPrompt({ fileName, retrying, onSubmit, onSkip }: PasswordPromptProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [retrying]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('unlock:prompt.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(password);
          setPassword('');
        }}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h2 className="text-base font-bold text-stone-900">{t('unlock:prompt.title')}</h2>
        <p className="mt-1 truncate text-sm text-stone-500" title={fileName}>
          {fileName}
        </p>

        {retrying && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {t('unlock:prompt.wrong')}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <input
            ref={inputRef}
            type={visible ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-label={t('unlock:prompt.label')}
            autoComplete="off"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-brand-500"
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-stone-500 transition hover:bg-stone-100"
          >
            {t(visible ? 'unlock:prompt.hide' : 'unlock:prompt.show')}
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700"
          >
            {t('unlock:prompt.submit')}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full px-4 py-2.5 text-sm font-bold text-stone-600 transition hover:bg-stone-100"
          >
            {t('unlock:prompt.skip')}
          </button>
        </div>
      </form>
    </div>
  );
}
