import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { savePdf, toBlob } from '../lib/download.ts';
import { CheckIcon } from './icons.tsx';

export interface PreviewModalProps {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly onClose: () => void;
  /**
   * Overrides what the Download button saves. Images to PDF with "merge" off uses this: the
   * preview shows the first PDF as a stand-in, but the download is the whole zip
   * (`spec/features.md` §1.11). The review-before-download rule still holds either way.
   *
   * Return `false` to signal the download did not actually happen (a cancelled save dialog), so the
   * button does not switch to its done state. `void`/`undefined` counts as completed.
   */
  readonly onDownload?: () => void | boolean | Promise<void | boolean>;
  /** i18n key for the Download button when `onDownload` replaces the default save. */
  readonly downloadLabelKey?: string;
  /** i18n key for the done state, when `downloadLabelKey` overrides the default wording. */
  readonly downloadedLabelKey?: string;
  /** Banner shown above the iframe — used when the previewed bytes are only a stand-in. */
  readonly notice?: string;
  /**
   * Replaces the iframe entirely.
   *
   * Used by Protect and only by Protect (`spec/features.md` §1.8): a browser can only render an
   * encrypted PDF as its own native password prompt inside an `<iframe>`, which would be baffling
   * right after the user chose that exact password. The Download button still works underneath.
   */
  readonly overlay?: string;
}

/**
 * The mandatory review step before any download (SPEC.md §5: "Never auto-download"). The user sees
 * the real, assembled PDF rendered by the browser's own viewer in an `<iframe>`, and only then can
 * save it.
 */
export function PreviewModal({
  bytes,
  fileName,
  onClose,
  onDownload,
  downloadLabelKey,
  downloadedLabelKey,
  notice,
  overlay,
}: PreviewModalProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string>();
  const [saving, setSaving] = useState(false);
  /**
   * Set only once a download genuinely completed, and never cleared on a timer. The modal unmounts
   * when it is closed, so reopening it (a fresh result, a new file, Start Over) is what resets this
   * — exactly the "surrounding state actually reset" rule, with no auto re-enable.
   */
  const [done, setDone] = useState(false);

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
      // `savePdf` resolves false when the user cancels the save dialog; a custom `onDownload` may
      // do the same. Anything else (including a plain void return) means the file was delivered.
      const completed = await (onDownload ? onDownload() : savePdf(bytes, fileName));
      if (completed !== false) setDone(true);
    } finally {
      setSaving(false);
    }
  }

  /*
   * Portalled to <body> deliberately.
   *
   * Tools render this from inside `OrganizeToolShell`'s action panel, which is `position: sticky` —
   * and sticky creates a stacking context. Left in place, the modal's `z-50` would be scoped to that
   * panel and the `z-40` AppBar would paint over it, swallowing clicks on Download. Same failure
   * family as architecture.md invariant #8 (a `backdrop-blur` ancestor trapping `position: fixed`
   * children). A portal puts the modal back in the root stacking context, where its z-index means
   * what it says.
   */
  return createPortal(
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
              // Stays disabled once done — no timer re-enables it.
              disabled={saving || done}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {done && <CheckIcon className="size-4" />}
              {done
                ? t(downloadedLabelKey ?? 'workspace:preview.downloaded')
                : t(downloadLabelKey ?? 'workspace:preview.download')}
            </button>
          </div>
        </div>
        {notice && (
          <p className="border-b border-slate-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            {notice}
          </p>
        )}
        {overlay ? (
          <div className="grid min-h-0 flex-1 place-items-center bg-slate-50 p-8 text-center">
            <p className="max-w-sm text-sm font-medium text-slate-700">{overlay}</p>
          </div>
        ) : (
          url && <iframe src={url} title={fileName} className="min-h-0 flex-1 bg-slate-100" />
        )}
      </div>
    </div>,
    document.body,
  );
}
