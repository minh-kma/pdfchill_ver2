import { useCallback, useEffect, useRef, useState } from 'react';
import { createId } from '../../shared/lib/ids.ts';
import { ROTATION_STEP } from '../../shared/lib/rotation.ts';
import { isJpeg, isPng, sortImagesByName } from './imagesToPdf.ts';

export interface StagedImage {
  readonly id: string;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly url: string;
  /** Clockwise, cumulative, mod 360. */
  readonly rotation: number;
}

/**
 * Staged-image state for the Images-to-PDF screen.
 *
 * **Entirely local to this screen** and deliberately not part of the global page-plan store
 * (`spec/data-model.md` §3.3): this is a one-shot tool with no autosave and no undo/redo, so none
 * of it belongs in that state or its history. Object URLs are created and revoked here.
 */
export function useImageList() {
  const [images, setImages] = useState<StagedImage[]>([]);
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const tracked = urls.current;
    return () => {
      for (const url of tracked) URL.revokeObjectURL(url);
      tracked.clear();
    };
  }, []);

  const add = useCallback(async (files: readonly File[]) => {
    const staged: StagedImage[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Magic bytes decide, not the extension.
      if (!isPng(bytes) && !isJpeg(bytes)) {
        rejected.push(file.name);
        continue;
      }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      staged.push({ id: createId('img'), name: file.name, bytes, url, rotation: 0 });
    }

    if (staged.length > 0) setImages((current) => [...current, ...staged]);
    return rejected;
  }, []);

  const remove = useCallback((id: string) => {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
        urls.current.delete(target.url);
      }
      return current.filter((image) => image.id !== id);
    });
  }, []);

  const rotate = useCallback((id: string, direction: 1 | -1) => {
    setImages((current) =>
      current.map((image) =>
        image.id === id
          ? { ...image, rotation: (((image.rotation + direction * ROTATION_STEP) % 360) + 360) % 360 }
          : image,
      ),
    );
  }, []);

  const reorder = useCallback((next: readonly StagedImage[]) => setImages([...next]), []);

  const sortByName = useCallback(
    (direction: 'asc' | 'desc') => setImages((current) => sortImagesByName(current, direction)),
    [],
  );

  const clear = useCallback(() => {
    setImages((current) => {
      for (const image of current) {
        URL.revokeObjectURL(image.url);
        urls.current.delete(image.url);
      }
      return [];
    });
  }, []);

  return { images, add, remove, rotate, reorder, sortByName, clear };
}
