import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { FileDropzone } from '../../shared/components/FileDropzone.tsx';
import { PreviewModal } from '../../shared/components/PreviewModal.tsx';
import { useDragSensors } from '../../shared/components/dnd/useDragSensors.ts';
import { toErrorKey } from '../../shared/lib/errorKeys.ts';
import { downloadBlob } from '../../shared/lib/download.ts';
import type { AppError } from '../../shared/state/useAddSources.tsx';
import type { ToolPageProps } from '../../toolRegistry.ts';
import { ImageCard } from './ImageCard.tsx';
import { ImageZoom } from './ImageZoom.tsx';
import {
  DEFAULT_LAYOUT,
  MARGIN_IDS,
  ORIENTATION_IDS,
  PAGE_SIZE_IDS,
  buildMergedPdf,
  buildSeparatePdfs,
  type LayoutOptions,
  type MarginId,
  type OrientationId,
  type PageSizeId,
} from './imagesToPdf.ts';
import { useImageList } from './useImageList.ts';

const MERGED_NAME = 'PDFChill_images.pdf';
const ZIP_NAME = 'PDFChill_images.zip';

interface Result {
  readonly previewBytes: Uint8Array;
  readonly fileName: string;
  readonly zip?: Blob;
}

/**
 * Images to PDF (`spec/features.md` §1.11).
 *
 * The one tool that starts from images rather than a PDF, so it needs no PDF session at all — and
 * an in-progress page-plan session, if any, is untouched while this screen is open.
 */
export function ImageToPdfTool({ tool }: ToolPageProps) {
  const { t } = useTranslation();
  const { images, add, remove, rotate, reorder, sortByName, clear } = useImageList();
  const [layout, setLayout] = useState<LayoutOptions>(DEFAULT_LAYOUT);
  const [merge, setMerge] = useState(true); // Default ON.
  const [zoomedId, setZoomedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError>();
  const [result, setResult] = useState<Result>();

  const sensors = useDragSensors();

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = images.findIndex((image) => image.id === active.id);
    const to = images.findIndex((image) => image.id === over.id);
    if (from === -1 || to === -1) return;
    reorder(arrayMove([...images], from, to));
  }

  async function accept(files: readonly File[]) {
    const rejected = await add(files);
    setError(
      rejected.length > 0
        ? { key: 'image-to-pdf:errors.unsupported', params: { files: rejected.join(', ') } }
        : undefined,
    );
  }

  async function convert() {
    setBusy(true);
    setError(undefined);
    try {
      // Merge ON, or only one image staged, produces a single PDF.
      if (merge || images.length === 1) {
        const bytes = await buildMergedPdf(images, layout);
        setResult({ previewBytes: bytes, fileName: MERGED_NAME });
        return;
      }

      const parts = await buildSeparatePdfs(images, layout);
      const first = parts[0];
      if (!first) return;

      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const part of parts) zip.file(part.name, part.bytes);

      setResult({
        previewBytes: first.bytes,
        fileName: first.name,
        zip: await zip.generateAsync({ type: 'blob' }),
      });
    } catch (failure) {
      setError({ key: toErrorKey(failure, 'image to pdf conversion') });
    } finally {
      setBusy(false);
    }
  }

  const zoomed = images.find((image) => image.id === zoomedId);
  const orientationDisabled = layout.pageSize === 'fit';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-h1 text-stone-900">{t(tool.nameKey)}</h1>
        <p className="mt-2 max-w-2xl text-stone-600">{t(tool.descriptionKey)}</p>
      </header>

      {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

      <div className={images.length > 0 ? 'mb-6' : ''}>
        <FileDropzone
          multiple
          compact={images.length > 0}
          busy={busy}
          title={t(images.length > 0 ? 'image-to-pdf:addMore' : 'image-to-pdf:uploadTitle')}
          subtitle={t('image-to-pdf:uploadSubtitle')}
          buttonLabel={t('image-to-pdf:chooseImages')}
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          onFiles={(files) => void accept(files)}
        />
      </div>

      {images.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2">
            <p className="text-sm font-bold text-stone-700">
              {t('image-to-pdf:imageCount', { count: images.length })}
            </p>
            <div className="ms-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => sortByName('asc')}
                className="rounded-lg px-3 py-1.5 text-sm font-bold text-stone-600 transition hover:bg-stone-100"
              >
                {t('image-to-pdf:sortAsc')}
              </button>
              <button
                type="button"
                onClick={() => sortByName('desc')}
                className="rounded-lg px-3 py-1.5 text-sm font-bold text-stone-600 transition hover:bg-stone-100"
              >
                {t('image-to-pdf:sortDesc')}
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-lg px-3 py-1.5 text-sm font-bold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
              >
                {t('workspace:actions.startOver')}
              </button>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={images.map((image) => image.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {images.map((image, index) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    position={index + 1}
                    onRotate={(direction) => rotate(image.id, direction)}
                    onRemove={() => remove(image.id)}
                    onEnlarge={() => setZoomedId(image.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-6 grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:grid-cols-3">
            <Select
              label={t('image-to-pdf:pageSize')}
              value={layout.pageSize}
              options={PAGE_SIZE_IDS.map((id) => ({ id, label: t(`image-to-pdf:pageSizes.${id}`) }))}
              onChange={(value) => setLayout((current) => ({ ...current, pageSize: value as PageSizeId }))}
            />
            <Select
              label={t('image-to-pdf:orientation')}
              value={layout.orientation}
              // Greyed out whenever page size is "fit to image": that mode always fits the page to
              // the image's own shape (`spec/features.md` §1.11).
              disabled={orientationDisabled}
              hint={orientationDisabled ? t('image-to-pdf:orientationDisabled') : undefined}
              options={ORIENTATION_IDS.map((id) => ({ id, label: t(`image-to-pdf:orientations.${id}`) }))}
              onChange={(value) =>
                setLayout((current) => ({ ...current, orientation: value as OrientationId }))
              }
            />
            <Select
              label={t('image-to-pdf:margin')}
              value={layout.margin}
              options={MARGIN_IDS.map((id) => ({ id, label: t(`image-to-pdf:margins.${id}`) }))}
              onChange={(value) => setLayout((current) => ({ ...current, margin: value as MarginId }))}
            />

            <label className="flex items-center gap-2 text-sm font-bold text-stone-700 sm:col-span-3">
              <input
                type="checkbox"
                checked={merge}
                onChange={(event) => setMerge(event.target.checked)}
                className="size-4 accent-brand-600"
              />
              {t('image-to-pdf:mergeIntoOne')}
            </label>

            <div className="sm:col-span-3">
              <button
                type="button"
                onClick={() => void convert()}
                disabled={busy}
                className="w-full rounded-full bg-brand-600 px-6 py-3 text-base font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? t('workspace:actions.working') : t('image-to-pdf:action')}
              </button>
            </div>
          </div>
        </>
      )}

      {zoomed && <ImageZoom image={zoomed} onClose={() => setZoomedId(undefined)} />}

      {result && (
        <PreviewModal
          bytes={result.previewBytes}
          fileName={result.fileName}
          onClose={() => setResult(undefined)}
          // With merge off, the preview is only a stand-in for the first PDF — the download is the
          // whole zip (`spec/features.md` §1.11).
          {...(result.zip
            ? {
                notice: t('image-to-pdf:zipNotice', { count: images.length }),
                downloadLabelKey: 'image-to-pdf:downloadZip',
                downloadedLabelKey: 'image-to-pdf:downloadedZip',
                onDownload: () => downloadBlob(result.zip!, ZIP_NAME),
              }
            : {})}
        />
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string | undefined;
}) {
  return (
    <label className={`block ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-sm font-bold text-stone-700">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-brand-500 disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}
