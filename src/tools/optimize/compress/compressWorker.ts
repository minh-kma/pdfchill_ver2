/// <reference lib="webworker" />

/**
 * The Compress worker. **Both** phases run here, off the main thread: image recompression is
 * CPU-bound canvas work and the qpdf structural pass is a wasm run, and either would jank the UI.
 */

import type { CompressionLevel } from './compressLevels.ts';
import { logUnexpectedError } from '../../../shared/lib/logError.ts';
import { runCompressPipeline } from './compressPipeline.ts';

export interface CompressRequest {
  readonly bytes: Uint8Array;
  readonly level: CompressionLevel;
}

export type CompressResponse =
  | { readonly type: 'progress'; readonly phase: 'images' | 'structure'; readonly done: number; readonly total: number }
  | {
      readonly type: 'done';
      readonly bytes: Uint8Array;
      readonly imagesSupported: boolean;
      readonly candidates: number;
      readonly replaced: number;
      readonly structuralHelped: boolean;
    }
  // The real failure, forwarded across the worker boundary. Without this the main thread only
  // ever learned "something failed", which is how a ReferenceError in qpdf went unseen.
  | { readonly type: 'error'; readonly message: string; readonly stack: string | undefined };

const post = (message: CompressResponse, transfer?: Transferable[]) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer ?? []);

self.onmessage = async (event: MessageEvent<CompressRequest>) => {
  const { bytes, level } = event.data;
  try {
    const result = await runCompressPipeline(bytes, level, (update) =>
      post({ type: 'progress', ...update }),
    );
    // Transfer the output buffer rather than structured-cloning a multi-MB copy.
    post({ type: 'done', ...result }, [result.bytes.buffer as ArrayBuffer]);
  } catch (error) {
    // Log inside the worker (its console feeds the same devtools panel) *and* forward the details,
    // so the failure is visible whichever side you are looking at.
    logUnexpectedError('compress worker failed', error);
    post({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};
