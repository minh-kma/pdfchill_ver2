import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadIcon } from './icons.tsx';

export interface FileDropzoneProps {
  readonly multiple: boolean;
  readonly title: string;
  readonly subtitle: string;
  readonly buttonLabel: string;
  readonly compact?: boolean;
  readonly busy?: boolean;
  /** Advisory only — every tool sniffs real bytes before trusting a file (`spec/features.md` §1.11). */
  readonly accept?: string;
  readonly onFiles: (files: File[]) => void;
}

/** Drag-and-drop or click-to-browse PDF input. */
export function FileDropzone({
  multiple,
  title,
  subtitle,
  buttonLabel,
  compact,
  busy,
  accept = 'application/pdf,.pdf',
  onFiles,
}: FileDropzoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function emit(list: FileList | null) {
    if (!list) return;
    const files = [...list];
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        emit(event.dataTransfer.files);
      }}
      className={`flex flex-col items-center rounded-2xl border-2 border-dashed text-center transition ${
        compact ? 'p-5' : 'p-10 sm:p-14'
      } ${dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-300 bg-white'}`}
    >
      {!compact && (
        <span className="mb-4 grid size-12 place-items-center rounded-xl bg-sky-50 text-sky-600">
          <UploadIcon className="size-6" />
        </span>
      )}
      <h2 className={compact ? 'text-sm font-bold text-slate-800' : 'text-lg font-bold text-slate-900'}>
        {title}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mt-4 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
      >
        {busy ? t('workspace:upload.reading') : buttonLabel}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(event) => {
          emit(event.target.files);
          // Reset so picking the same file twice still fires a change event.
          event.target.value = '';
        }}
      />
    </div>
  );
}
