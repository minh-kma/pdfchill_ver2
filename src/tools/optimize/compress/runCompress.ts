import type { CompressionLevel } from './compressLevels.ts';
import type { CompressRequest, CompressResponse } from './compressWorker.ts';

export interface CompressRunResult {
  readonly bytes: Uint8Array;
  readonly imagesSupported: boolean;
  readonly candidates: number;
  readonly replaced: number;
  readonly structuralHelped: boolean;
}

export interface CompressRunProgress {
  (update: { phase: 'images' | 'structure'; done: number; total: number }): void;
}

/**
 * Main-thread driver for the Compress worker.
 *
 * A fresh worker per run: compression is a one-shot operation, and a fresh worker guarantees the
 * qpdf module instance inside it is fresh too (see `shared/lib/qpdf.ts` — instances are single-use).
 */
export function runCompress(
  bytes: Uint8Array,
  level: CompressionLevel,
  onProgress?: CompressRunProgress,
): Promise<CompressRunResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./compressWorker.ts', import.meta.url), { type: 'module' });

    const finish = (fn: () => void) => {
      worker.terminate();
      fn();
    };

    worker.onmessage = (event: MessageEvent<CompressResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.({ phase: message.phase, done: message.done, total: message.total });
        return;
      }
      if (message.type === 'error') {
        finish(() => reject(new Error('compress failed')));
        return;
      }
      finish(() =>
        resolve({
          bytes: message.bytes,
          imagesSupported: message.imagesSupported,
          candidates: message.candidates,
          replaced: message.replaced,
          structuralHelped: message.structuralHelped,
        }),
      );
    };

    worker.onerror = () => finish(() => reject(new Error('compress worker crashed')));

    // The input buffer is copied, not transferred: the caller keeps the original bytes for the
    // per-document floor comparison.
    const request: CompressRequest = { bytes, level };
    worker.postMessage(request);
  });
}
