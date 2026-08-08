import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { savePdf, toBlob } from '../lib/download.ts';

export interface PreviewModalProps {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly onClose: () => void;
}

/**
 * The mandatory review step before any download (SPEC.md §5: "Never auto-download"). The user sees
 * the real, assembled PDF rendered by the browser's own viewer in an `<iframe>`, and only then can
 * save it.
 */
export function PreviewModal({ bytes, fileName, onClose }: PreviewModalProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(toBlob(bytes, 'application/pdf'));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function handleDownload() {
    setSaving(true);
    try {
      await savePdf(bytes, fileName);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('workspace:preview.title')}
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900">{fileName}</h2>
            <p className="text-xs text-slate-500">{t('workspace:preview.subtitle')}</p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              {t('workspace:preview.close')}
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={saving}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {t('workspace:preview.download')}
            </button>
          </div>
        </div>
        {url && <iframe src={url} title={fileName} className="min-h-0 flex-1 bg-slate-100" />}
      </div>
    </div>
  );
}
