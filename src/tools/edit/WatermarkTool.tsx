import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner } from '../../shared/components/ErrorBanner.tsx';
import { createId } from '../../shared/lib/ids.ts';
import { hashBytes } from '../../shared/lib/hash.ts';
import { isJpeg, isPng } from '../convert/imagesToPdf.ts';
import {
  WATERMARK_DEFAULTS,
  WATERMARK_LIMITS,
} from '../../shared/lib/watermarkGeometry.ts';
import type { AppError } from '../../shared/state/appError.ts';
import { useStore } from '../../shared/state/store.tsx';
import type { Asset, DocAnnotation } from '../../shared/state/types.ts';
import type { ToolPageProps } from '../../toolRegistry.ts';
import { BuildAction } from '../organize/BuildAction.tsx';
import { OrganizeToolShell } from '../organize/OrganizeToolShell.tsx';
import { WatermarkPreview } from './WatermarkPreview.tsx';
import type { WatermarkMark } from '../../shared/components/workspace/WatermarkOverlay.tsx';
import { usePublishWorkspacePreview } from '../../shared/components/workspace/workspacePreview.tsx';

type Mode = 'text' | 'image';

/**
 * Watermark (`spec/features.md` §1.9).
 *
 * Unlike Compress/OCR/Image-to-PDF, this is **not** a standalone transform: applying a watermark
 * stores a `DocAnnotation` on the page plan, and the mark is drawn by the shared bake inside
 * `copyPagesToPdf`. There is no separate "apply" step producing bytes — every subsequent
 * Download or Split re-bakes it automatically, so it survives a later merge/split/rotate.
 */
export function WatermarkTool({ tool }: ToolPageProps) {
  return (
    <OrganizeToolShell tool={tool}>
      <WatermarkPanel />
    </OrganizeToolShell>
  );
}

function WatermarkPanel() {
  const { t } = useTranslation();
  const { state, dispatch } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<AppError>();

  // Exactly one watermark can exist at a time; reopening edits the existing one
  // (`spec/features.md` §1.9). There is no way to add a second.
  const existing = state.docAnnotations.find((item) => item.type === 'watermark');

  const [mode, setMode] = useState<Mode>(existing?.assetId ? 'image' : 'text');
  const [text, setText] = useState(existing?.text ?? '');
  const [fontSize, setFontSize] = useState(existing?.fontSize ?? WATERMARK_DEFAULTS.fontSize);
  const [color, setColor] = useState(existing?.color ?? WATERMARK_DEFAULTS.color);
  const [rotationDeg, setRotationDeg] = useState(
    existing?.rotationDeg ?? WATERMARK_DEFAULTS.rotationDeg,
  );
  const [opacityPercent, setOpacityPercent] = useState(
    Math.round((existing?.opacity ?? WATERMARK_DEFAULTS.opacity) * 100),
  );
  const [assetId, setAssetId] = useState(existing?.assetId);
  const [allPages, setAllPages] = useState(!existing?.range);
  const [from, setFrom] = useState(existing?.range?.from ?? 1);
  const [to, setTo] = useState(existing?.range?.to ?? state.pages.length);

  const rangeValid = allPages || (from >= 1 && to >= from && to <= state.pages.length);
  const hasContent = mode === 'image' ? Boolean(assetId) : text.trim().length > 0;

  const draft: DocAnnotation = useMemo(
    () => ({
      id: existing?.id ?? 'draft',
      type: 'watermark',
      opacity: opacityPercent / 100,
      ...(allPages ? {} : { range: { from, to } }),
      ...(mode === 'image' ? { assetId } : { text, fontSize, color, rotationDeg }),
    }),
    [existing?.id, opacityPercent, allPages, from, to, mode, assetId, text, fontSize, color, rotationDeg],
  );

  async function pickImage(file: File) {
    setError(undefined);
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Magic bytes decide, same sniffing the Images-to-PDF tool uses.
    const mimeType = isPng(bytes) ? 'image/png' : isJpeg(bytes) ? 'image/jpeg' : undefined;
    if (!mimeType) {
      setError({ key: 'watermark:errors.unsupportedImage', params: { file: file.name } });
      return;
    }
    // Content-hashed: re-uploading identical bytes reuses the existing asset entry.
    const hash = hashBytes(bytes);
    const asset: Asset = { mimeType, bytes, hash };
    dispatch({ type: 'ADD_ASSET', asset });
    setAssetId(hash);
  }

  function apply() {
    const annotation: DocAnnotation = { ...draft, id: existing?.id ?? createId('wm') };
    dispatch(
      existing
        ? { type: 'UPDATE_DOC_ANNOTATION', annotation }
        : { type: 'ADD_DOC_ANNOTATION', annotation },
    );
  }

  function remove() {
    if (existing) dispatch({ type: 'DELETE_DOC_ANNOTATION', annotationId: existing.id });
  }

  const firstPage = state.pages[0];
  const firstSource = firstPage
    ? state.sources.find((source) => source.id === firstPage.sourceId)
    : undefined;

  // The object URL and the image's aspect ratio are resolved once here, not per preview surface:
  // the sample preview and every workspace thumbnail share this one `mark`.
  const asset = assetId ? state.assets[assetId] : undefined;
  const assetUrl = useObjectUrl(asset);
  const imageAspect = useImageAspect(assetUrl);

  const mark: WatermarkMark = useMemo(
    () => ({ draft, ...(assetUrl ? { assetUrl } : {}), imageAspect }),
    [draft, assetUrl, imageAspect],
  );

  // Publish it so the shared Workspace grid overlays it on every page in range. Cleared on unmount,
  // so leaving the tool takes the overlay with it.
  usePublishWorkspacePreview(hasContent ? mark : undefined);

  return (
    /* Single column: the shell now supplies the side-by-side split (grid | action panel), so this
       panel stacks its controls and its sample preview inside that one column. */
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        {error && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

        <div className="mb-4 flex gap-2">
          {(['text', 'image'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${
                mode === option
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {t(`watermark:mode.${option}`)}
            </button>
          ))}
        </div>

        {mode === 'text' ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-stone-700">{t('watermark:textLabel')}</span>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t('watermark:textPlaceholder')}
                className="mt-1.5 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </label>

            <Slider
              label={t('watermark:size')}
              value={fontSize}
              min={WATERMARK_LIMITS.fontSize.min}
              max={WATERMARK_LIMITS.fontSize.max}
              suffix="pt"
              onChange={setFontSize}
            />

            <Slider
              label={t('watermark:angle')}
              value={rotationDeg}
              min={WATERMARK_LIMITS.rotationDeg.min}
              max={WATERMARK_LIMITS.rotationDeg.max}
              suffix="°"
              onChange={setRotationDeg}
            />

            <label className="flex items-center gap-3">
              <span className="text-sm font-bold text-stone-700">{t('watermark:color')}</span>
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-8 w-14 cursor-pointer rounded border border-stone-300"
              />
            </label>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-stone-300 px-4 py-6 text-sm font-bold text-stone-600 transition hover:border-brand-500 hover:bg-brand-50"
            >
              {assetId ? t('watermark:replaceImage') : t('watermark:chooseImage')}
            </button>
            <p className="mt-2 text-xs text-stone-500">{t('watermark:imageHint')}</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void pickImage(file);
                event.target.value = '';
              }}
            />
          </div>
        )}

        <div className="mt-4 border-t border-stone-100 pt-4">
          <Slider
            label={t('watermark:opacity')}
            value={opacityPercent}
            min={WATERMARK_LIMITS.opacityPercent.min}
            max={WATERMARK_LIMITS.opacityPercent.max}
            suffix="%"
            onChange={setOpacityPercent}
          />
        </div>

        <fieldset className="mt-4 border-t border-stone-100 pt-4">
          <legend className="text-sm font-bold text-stone-700">{t('watermark:pages')}</legend>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input
                type="radio"
                checked={allPages}
                onChange={() => setAllPages(true)}
                className="size-4 accent-brand-600"
              />
              {t('watermark:allPages')}
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input
                type="radio"
                checked={!allPages}
                onChange={() => setAllPages(false)}
                className="size-4 accent-brand-600"
              />
              {t('watermark:pageRange')}
            </label>
            {!allPages && (
              <span className="flex items-center gap-2">
                <NumberBox value={from} onChange={setFrom} label={t('watermark:from')} />
                <NumberBox value={to} onChange={setTo} label={t('watermark:to')} />
              </span>
            )}
          </div>
          {!rangeValid && (
            <p className="mt-2 text-xs text-red-600">
              {t('watermark:invalidRange', { total: state.pages.length })}
            </p>
          )}
        </fieldset>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={apply}
            disabled={!hasContent || !rangeValid}
            className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {t(existing ? 'watermark:update' : 'watermark:apply')}
          </button>
          {existing && (
            <button
              type="button"
              onClick={remove}
              className="rounded-full px-5 py-3 text-sm font-bold text-red-600 transition hover:bg-red-50"
            >
              {t('watermark:remove')}
            </button>
          )}
        </div>

        {existing && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {t('watermark:applied')}
          </p>
        )}

        <div className="mt-6 border-t border-stone-100 pt-5">
          <BuildAction labelKey="watermark:action" suffix="watermarked" />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-500">
          {t('watermark:preview')}
        </p>
        {firstPage && firstSource ? (
          <WatermarkPreview page={firstPage} source={firstSource} mark={mark} />
        ) : null}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm font-bold text-stone-700">
        {label}
        <span className="text-xs font-normal tabular-nums text-stone-500">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-brand-600"
      />
    </label>
  );
}

function NumberBox({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <input
      type="number"
      min={1}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-20 rounded-lg border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
    />
  );
}

/** One object URL per asset, shared by every preview surface. */
function useObjectUrl(asset: Asset | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!asset) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(
      new Blob([asset.bytes.slice().buffer as ArrayBuffer], { type: asset.mimeType }),
    );
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [asset]);
  return url;
}

/** Decoded once per image, not once per thumbnail. */
function useImageAspect(url: string | undefined): number {
  const [aspect, setAspect] = useState(1);
  useEffect(() => {
    if (!url) return;
    const image = new Image();
    image.onload = () => setAspect(image.naturalWidth / Math.max(1, image.naturalHeight));
    image.src = url;
  }, [url]);
  return aspect;
}
