import type { Rotation } from '../lib/rotation.ts';

/**
 * An uploaded file, kept byte-for-byte. `sources` is append-only for the lifetime of a session:
 * deleting a page never drops its source, because undo has to be able to restore the bytes
 * (`spec/features.md` §1.4, `spec/data-model.md` §3.1).
 *
 * Bytes are always plaintext: an encrypted upload is decrypted before it ever becomes a
 * `SourceDoc` (`spec/features.md` §1.7), so every downstream operation works on plaintext.
 */
export interface SourceDoc {
  readonly id: string;
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly pageCount: number;
}

/**
 * One entry in the page plan: a reference into a source, plus the rotation the user has added.
 * The app never edits source bytes in place — output is assembled from this plan.
 */
export interface PageItem {
  readonly id: string;
  readonly sourceId: string;
  /** 0-based index of this page within its source document. */
  readonly sourceIndex: number;
  /** User-added rotation, *added to* the source page's own /Rotate at build time. */
  readonly rotation: Rotation;
}

/** 1-based, inclusive page range over the document being generated. */
export interface AnnotationRange {
  readonly from: number;
  readonly to: number;
}

/**
 * A document-level mark baked onto pages at export time (`spec/data-model.md` §3.1).
 *
 * Only `watermark` exists today; `pageNumber` is the other member the old app had, and this union
 * is where it goes when it is built.
 */
export interface DocAnnotation {
  readonly id: string;
  readonly type: 'watermark';
  /** Omitted means every page. */
  readonly range?: AnnotationRange | undefined;

  /* Watermark — text mode. */
  readonly text?: string | undefined;
  readonly fontSize?: number | undefined;
  readonly color?: string | undefined;
  readonly rotationDeg?: number | undefined;

  /* Watermark — image mode. Mutually exclusive with `text`. */
  readonly assetId?: string | undefined;

  /* Shared by both modes. */
  readonly opacity?: number | undefined;
}

/** A reusable binary asset, identified by the content hash of its bytes. */
export interface Asset {
  readonly mimeType: 'image/png' | 'image/jpeg';
  readonly bytes: Uint8Array;
  readonly hash: string;
}

/** Keyed by asset id, which *is* the content hash. */
export type AssetMap = Record<string, Asset>;

/**
 * The undoable slice (`spec/data-model.md` §3.2). Undo granularity is "the whole edit slice", not
 * per-field: undoing a watermark edit and undoing a page delete share one linear history.
 */
export interface EditSnapshot {
  readonly pages: readonly PageItem[];
  readonly docAnnotations: readonly DocAnnotation[];
}

export interface AppState {
  readonly sources: readonly SourceDoc[];
  readonly pages: readonly PageItem[];
  readonly docAnnotations: readonly DocAnnotation[];
  readonly assets: AssetMap;
  readonly past: readonly EditSnapshot[];
  readonly future: readonly EditSnapshot[];
}
