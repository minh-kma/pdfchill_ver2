/**
 * The persisted session shape, and every pure rule about it.
 *
 * Deliberately dependency-free and side-effect-free — no IndexedDB, no React — in the same style as
 * `splitRanges.ts` / `rotation.ts` / `language.ts`. The storage layer (`sessionStore.ts`) and the
 * React glue (`useSessionPersistence.ts`) both build on this, so the timing rules and the
 * what-gets-saved rules can be driven from a plain Node script without a browser.
 *
 * Rules reproduced from `spec/edge-cases.md` ("Persistence") and `spec/features.md` §1.12.
 */

import type { AppState, Asset, AssetMap, DocAnnotation, PageItem, SourceDoc } from '../types.ts';

/**
 * Storage key. **Bumped from the old app's `pdfdemo:session:v2` to `:v3` on purpose.**
 *
 * `spec/edge-cases.md` states the suffix exists "specifically so an incompatible older save is
 * simply ignored, never migrated". This rewrite deploys to the same origin as the old app, so a
 * returning visitor can still be carrying an old-app record under `pdfdemo:session:v2` — and v2's
 * persisted shape is not the old app's (its `AppState` carried `busy`/`busyMessage`; its pages
 * could carry a leftover per-page `annotations` field). Reusing the key would hand that record
 * straight to `fromPersisted()`, which is the one thing the version suffix exists to prevent.
 *
 * Contrast `pdfdemo:lang`, which is deliberately *kept* (`shared/lib/language.ts`): its value is a
 * compatible scalar whose whole point is surviving the rewrite. Sessions are disposable; a
 * preference is not.
 */
export const SESSION_STORAGE_KEY = 'pdfdemo:session:v3';

/** `spec/edge-cases.md`: a save older than this produces no recovery prompt. */
export const SESSION_MAX_AGE_MS = 5 * 60 * 1000;

/** `spec/edge-cases.md`: autosave is debounced this long after a change. */
export const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * What actually goes to disk.
 *
 * Note what is absent, and why each is absent:
 *   - `past` / `future` — the undo history is memory-only by design (`spec/edge-cases.md`: "a
 *     reload restores the *current* page plan from the session store, but never the history that
 *     led to it"). They are not in this type, so they cannot be written by accident.
 *   - the unlock password — it lives in `shared/state/sessionPassword.ts`, module-scoped and
 *     outside `AppState` entirely, precisely so no snapshot of state can capture it.
 *   - `busy` / `busyMessage` — the old app bundled transient UI flags into `AppState`
 *     (`spec/maintainability.md` pain point #10). **v2's `AppState` has no such fields**
 *     (`shared/state/types.ts`), so there is nothing here to exclude; this note exists so a future
 *     reader does not add them and then persist them.
 */
export interface PersistedSession {
  /** `Date.now()` at save time. Drives the 5-minute recovery window. */
  readonly savedAt: number;
  readonly sources: readonly SourceDoc[];
  readonly pages: readonly PageItem[];
  readonly docAnnotations: readonly DocAnnotation[];
  readonly assets: AssetMap;
}

/**
 * Narrows app state to the persisted subset. Field-by-field rather than a spread-and-delete, so
 * adding a field to `AppState` never silently starts persisting it.
 */
export function toPersisted(state: AppState, savedAt: number): PersistedSession {
  return {
    savedAt,
    sources: state.sources,
    pages: state.pages,
    docAnnotations: state.docAnnotations,
    assets: state.assets,
  };
}

/**
 * Re-wraps bytes handed back by IndexedDB's structured clone.
 *
 * `spec/edge-cases.md`: a round-trip can return a raw `ArrayBuffer` where a `Uint8Array` went in.
 * pdf-lib and pdf.js both reject that, and the failure surfaces far from here, so every source's
 * and every asset's bytes are normalized on load before re-entering app state.
 */
export function asBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  // Some engines hand back another typed-array view over the same buffer.
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return undefined;
}

/**
 * Is this save still offerable? `now - savedAt <= 5 minutes`.
 *
 * A stale save is **not** deleted here, and this function has no side effects at all
 * (`spec/edge-cases.md`: it "is not deleted from IndexedDB by the mere act of being stale — only an
 * explicit Restore, Dismiss, or Start Over clears it").
 */
export function isRecoverable(
  session: Pick<PersistedSession, 'savedAt'>,
  now: number,
  maxAgeMs: number = SESSION_MAX_AGE_MS,
): boolean {
  const age = now - session.savedAt;
  return age >= 0 && age <= maxAgeMs;
}

/** A session worth offering has at least one page to restore. */
export function isRestorable(session: PersistedSession): boolean {
  return session.pages.length > 0 && session.sources.length > 0;
}

/**
 * Validates and normalizes a record read out of storage.
 *
 * Returns `undefined` for anything that is not a well-formed session rather than throwing: a
 * corrupt or foreign record must behave exactly like "no saved session", never like an error the
 * user has to deal with.
 */
export function parsePersisted(raw: unknown): PersistedSession | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;

  if (typeof record['savedAt'] !== 'number' || !Number.isFinite(record['savedAt'])) return undefined;
  if (!Array.isArray(record['sources']) || !Array.isArray(record['pages'])) return undefined;

  const sources: SourceDoc[] = [];
  for (const entry of record['sources'] as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const source = entry as Record<string, unknown>;
    const bytes = asBytes(source['bytes']);
    if (
      typeof source['id'] !== 'string' ||
      typeof source['name'] !== 'string' ||
      typeof source['pageCount'] !== 'number' ||
      !bytes
    ) {
      return undefined;
    }
    sources.push({
      id: source['id'],
      name: source['name'],
      pageCount: source['pageCount'],
      bytes,
    });
  }

  const pages: PageItem[] = [];
  for (const entry of record['pages'] as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const page = entry as Record<string, unknown>;
    if (
      typeof page['id'] !== 'string' ||
      typeof page['sourceId'] !== 'string' ||
      typeof page['sourceIndex'] !== 'number' ||
      typeof page['rotation'] !== 'number'
    ) {
      return undefined;
    }
    // Unknown extra fields on a page (the old app's dropped `annotations`, say) are simply not
    // copied across — the rest of the shape loads normally (`spec/edge-cases.md`).
    pages.push({
      id: page['id'],
      sourceId: page['sourceId'],
      sourceIndex: page['sourceIndex'],
      rotation: page['rotation'] as PageItem['rotation'],
    });
  }

  // A page pointing at a source that is not in the record would crash the workspace renderer.
  const sourceIds = new Set(sources.map((source) => source.id));
  if (pages.some((page) => !sourceIds.has(page.sourceId))) return undefined;

  const assets: Record<string, Asset> = {};
  const rawAssets = record['assets'];
  if (typeof rawAssets === 'object' && rawAssets !== null) {
    for (const [key, entry] of Object.entries(rawAssets as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const asset = entry as Record<string, unknown>;
      const bytes = asBytes(asset['bytes']);
      if (!bytes || typeof asset['hash'] !== 'string') continue;
      if (asset['mimeType'] !== 'image/png' && asset['mimeType'] !== 'image/jpeg') continue;
      assets[key] = { bytes, hash: asset['hash'], mimeType: asset['mimeType'] };
    }
  }

  const docAnnotations = Array.isArray(record['docAnnotations'])
    ? ((record['docAnnotations'] as unknown[]).filter(
        (entry) => typeof entry === 'object' && entry !== null && (entry as DocAnnotation).type === 'watermark',
      ) as DocAnnotation[])
    : [];

  return { savedAt: record['savedAt'], sources, pages, docAnnotations, assets };
}

/**
 * Expands a persisted session back into full app state.
 *
 * `past`/`future` are seeded empty — a restored session has no history behind it, which is the
 * documented behaviour, not a shortcut.
 */
export function fromPersisted(session: PersistedSession): AppState {
  return {
    sources: session.sources,
    pages: session.pages,
    docAnnotations: session.docAnnotations,
    assets: session.assets,
    past: [],
    future: [],
  };
}

/**
 * Has anything worth re-saving changed? Compares only the four persisted slices by reference —
 * immer's structural sharing makes that exact, and it is what keeps `busy`-style transient state
 * (if it is ever added) and undo/redo pushes from triggering a write.
 */
export function persistedSliceChanged(a: AppState, b: AppState): boolean {
  return (
    a.sources !== b.sources ||
    a.pages !== b.pages ||
    a.docAnnotations !== b.docAnnotations ||
    a.assets !== b.assets
  );
}

/** Nothing to save, and nothing worth offering to restore. */
export function isEmptyState(state: AppState): boolean {
  return state.sources.length === 0 && state.pages.length === 0;
}
