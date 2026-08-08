import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseIcon } from './icons.tsx';

export interface ZoomModalChromeProps {
  readonly title: string;
  /** Rendered between the title and the close button — e.g. a zoom stepper. */
  readonly controls?: ReactNode;
  /**
   * When true, Escape is consumed by an in-progress inline edit instead of closing the modal.
   * The caller is responsible for cancelling that edit.
   */
  readonly escapeHandledByCaller?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Full-screen zoom modal shell: Escape-to-close, body-scroll-lock, backdrop-click-to-close.
 *
 * `spec/maintainability.md` pain point #9 — the page-zoom and image-zoom modals used to
 * re-implement all three of those behaviours separately. Content is the caller's; the chrome is
 * not.
 */
export function ZoomModalChrome({
  title,
  controls,
  escapeHandledByCaller = false,
  onClose,
  children,
}: ZoomModalChromeProps) {
  const { t } = useTranslation();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || escapeHandledByCaller) return;
      onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [escapeHandledByCaller, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/80"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 text-white">
        <span className="text-sm font-semibold">{title}</span>
        {controls && <div className="ms-auto flex items-center gap-1">{controls}</div>}
        <button
          type="button"
          aria-label={t('workspace:preview.close')}
          onClick={onClose}
          className={`${controls ? '' : 'ms-auto'} rounded-lg p-2 transition hover:bg-white/15`}
        >
          <CloseIcon className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </div>
  );
}
