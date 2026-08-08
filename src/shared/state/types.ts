import type { Rotation } from '../lib/rotation.ts';

/**
 * An uploaded file, kept byte-for-byte. `sources` is append-only for the lifetime of a session:
 * deleting a page never drops its source, because undo has to be able to restore the bytes
 * (SPEC.md §1.4, §3.1).
 */
export interface SourceDoc {
  readonly id: string;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly pageCount: number;
}

/**
 * One entry in the page plan: a reference into a source, plus the rotation the user has added.
 * The app never edits source bytes in place — output is assembled from this plan (SPEC.md §3.1).
 */
export interface PageItem {
  readonly id: string;
  readonly sourceId: string;
  /** 0-based index of this page within its source document. */
  readonly sourceIndex: number;
  /** User-added rotation, *added to* the source page's own /Rotate at build time. */
  readonly rotation: Rotation;
}

/** The undoable slice. Watermark/page-number annotations join this in a later step. */
export interface EditSnapshot {
  readonly pages: readonly PageItem[];
}

export interface AppState {
  readonly sources: readonly SourceDoc[];
  readonly pages: readonly PageItem[];
  readonly past: readonly EditSnapshot[];
  readonly future: readonly EditSnapshot[];
}
