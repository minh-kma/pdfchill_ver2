/**
 * Saving files. SPEC.md §1.12: prefer the File System Access API so the user picks the exact
 * location with the generated name pre-filled; fall back to an `<a download>` click elsewhere.
 *
 * Nothing here is ever called automatically — SPEC.md §5: "Never auto-download." Every result is
 * reviewed in `PreviewModal` first (Split's zip being the one documented exception, §1.2).
 */

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}

interface FileSystemHandleLike {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

type PickerWindow = Window & {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemHandleLike>;
};

/** Plain anchor download. Used directly for the Split zip, and as the no-picker fallback. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function saveFile(blob: Blob, fileName: string, mimeType: string): Promise<void> {
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (!picker) {
    downloadBlob(blob, fileName);
    return;
  }

  try {
    const handle = await picker({
      suggestedName: fileName,
      types: [{ description: fileName.split('.').pop()?.toUpperCase() ?? 'File', accept: { [mimeType]: [`.${fileName.split('.').pop() ?? ''}`] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    // The user closing the save dialog means "do nothing" — it must not fall through to an
    // anchor download they did not ask for (SPEC.md §1.12).
    if (error instanceof DOMException && error.name === 'AbortError') return;
    downloadBlob(blob, fileName);
  }
}

export function savePdf(bytes: Uint8Array, fileName: string): Promise<void> {
  return saveFile(toBlob(bytes, 'application/pdf'), fileName, 'application/pdf');
}

export function toBlob(bytes: Uint8Array, mimeType: string): Blob {
  // Copy into a plain ArrayBuffer: the store's bytes may be a view onto a larger buffer.
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType });
}
