import { castDraft, produce } from 'immer';
import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import { normalizeRotation } from '../lib/rotation.ts';
import type {
  AppState,
  Asset,
  DocAnnotation,
  EditSnapshot,
  PageItem,
  SourceDoc,
} from './types.ts';
import { useUndoRedoShortcuts } from './useUndoRedoShortcuts.ts';

/* --- Actions ------------------------------------------------------------------------------- */

export type Action =
  | { type: 'ADD_SOURCE'; source: SourceDoc; pages: readonly PageItem[] }
  | { type: 'DELETE_PAGE'; pageId: string }
  | { type: 'ROTATE_PAGE'; pageId: string; delta: number }
  | { type: 'ROTATE_ALL'; delta: number }
  | { type: 'REORDER'; pages: readonly PageItem[] }
  | { type: 'ADD_DOC_ANNOTATION'; annotation: DocAnnotation }
  | { type: 'UPDATE_DOC_ANNOTATION'; annotation: DocAnnotation }
  | { type: 'DELETE_DOC_ANNOTATION'; annotationId: string }
  | { type: 'ADD_ASSET'; asset: Asset }
  | { type: 'RESET' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

/**
 * Which actions push an undo entry (SPEC.md §3.2).
 *
 * `RESET` is a whole-session replacement, not an incremental edit, so it clears history instead of
 * being recorded in it. `UNDO`/`REDO` are handled in the wrapper below and never reach the core
 * reducer at all.
 */
const UNDOABLE: ReadonlySet<Action['type']> = new Set<Action['type']>([
  'ADD_SOURCE',
  'DELETE_PAGE',
  'ROTATE_PAGE',
  'ROTATE_ALL',
  'REORDER',
  'ADD_DOC_ANNOTATION',
  'UPDATE_DOC_ANNOTATION',
  'DELETE_DOC_ANNOTATION',
]);
// `ADD_ASSET` is deliberately excluded (`spec/edge-cases.md`): assets are append-only and
// referenced by content hash, so there is nothing meaningful to roll back to.

/** SPEC.md §3.2: oldest entries silently dropped past this. */
const HISTORY_LIMIT = 50;

export const initialState: AppState = {
  sources: [],
  pages: [],
  docAnnotations: [],
  assets: {},
  past: [],
  future: [],
};

/* --- Core reducer (pure state transitions, no history bookkeeping) ------------------------- */

const coreReducer = (state: AppState, action: Action): AppState =>
  produce(state, (draft) => {
    switch (action.type) {
      case 'ADD_SOURCE': {
        // Sources are append-only; a new file's pages land after the current ones (SPEC.md §1.1).
        draft.sources.push(castDraft(action.source));
        draft.pages.push(...castDraft(action.pages));
        return;
      }

      case 'DELETE_PAGE': {
        const index = draft.pages.findIndex((page) => page.id === action.pageId);
        if (index === -1) return; // No-op: nothing changes, so no history entry is created.
        // The page's SourceDoc stays in `sources` even if this was its last page — undo has to be
        // able to restore the bytes without re-reading the file (SPEC.md §1.4).
        draft.pages.splice(index, 1);
        return;
      }

      case 'ROTATE_PAGE': {
        const page = draft.pages.find((item) => item.id === action.pageId);
        if (!page || action.delta === 0) return;
        // Cumulative across clicks, normalized into 0..359 (SPEC.md §1.4).
        page.rotation = normalizeRotation(page.rotation + action.delta);
        return;
      }

      case 'ROTATE_ALL': {
        if (draft.pages.length === 0 || action.delta === 0) return;
        for (const page of draft.pages) {
          page.rotation = normalizeRotation(page.rotation + action.delta);
        }
        return;
      }

      case 'REORDER': {
        // The dispatched array order *is* the output order (SPEC.md §1.4). Compare first so a drag
        // that lands a page back where it started stays a no-op and creates no undo step.
        const unchanged =
          draft.pages.length === action.pages.length &&
          draft.pages.every((page, index) => page.id === action.pages[index]?.id);
        if (unchanged) return;
        draft.pages = castDraft([...action.pages]);
        return;
      }

      case 'ADD_DOC_ANNOTATION': {
        draft.docAnnotations.push(castDraft(action.annotation));
        return;
      }

      case 'UPDATE_DOC_ANNOTATION': {
        const index = draft.docAnnotations.findIndex((item) => item.id === action.annotation.id);
        if (index === -1) return; // No-op: nothing to update, so no history entry.
        draft.docAnnotations[index] = castDraft(action.annotation);
        return;
      }

      case 'DELETE_DOC_ANNOTATION': {
        const index = draft.docAnnotations.findIndex((item) => item.id === action.annotationId);
        if (index === -1) return;
        draft.docAnnotations.splice(index, 1);
        return;
      }

      case 'ADD_ASSET': {
        // Content-hashed and deduplicated: re-uploading byte-identical data reuses the entry
        // rather than storing a duplicate (`spec/edge-cases.md`).
        if (draft.assets[action.asset.hash]) return;
        draft.assets[action.asset.hash] = castDraft(action.asset);
        return;
      }

      case 'RESET': {
        if (
          draft.sources.length === 0 &&
          draft.pages.length === 0 &&
          draft.docAnnotations.length === 0
        ) {
          return;
        }
        draft.sources = [];
        draft.pages = [];
        draft.docAnnotations = [];
        draft.assets = {};
        return;
      }

      // UNDO/REDO never reach here.
      case 'UNDO':
      case 'REDO':
        return;
    }
  });

/* --- History wrapper ----------------------------------------------------------------------- */

// Undo granularity is "the whole edit slice", not per-field (`spec/data-model.md` §3.2): undoing a
// watermark edit and undoing a page delete share one linear history. Cheap in practice because
// immer's structural sharing means an unchanged array keeps its old reference in the snapshot.
const editSlice = (state: AppState): EditSnapshot => ({
  pages: state.pages,
  docAnnotations: state.docAnnotations,
});

const applySlice = (state: AppState, slice: EditSnapshot): AppState => ({
  ...state,
  pages: slice.pages,
  docAnnotations: slice.docAnnotations,
});

export function reducer(state: AppState, action: Action): AppState {
  if (action.type === 'UNDO') {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return {
      ...applySlice(state, previous),
      past: state.past.slice(0, -1),
      future: [editSlice(state), ...state.future],
    };
  }

  if (action.type === 'REDO') {
    const next = state.future[0];
    if (!next) return state;
    return {
      ...applySlice(state, next),
      past: [...state.past, editSlice(state)],
      future: state.future.slice(1),
    };
  }

  const nextState = coreReducer(state, action);

  // Reference equality is enough thanks to immer's structural sharing: an action that changed
  // nothing must not create a throwaway undo step (SPEC.md §2).
  if (nextState === state) return state;

  if (action.type === 'RESET') return { ...nextState, past: [], future: [] };
  if (!UNDOABLE.has(action.type)) return nextState;

  return {
    ...nextState,
    past: [...state.past, editSlice(state)].slice(-HISTORY_LIMIT),
    future: [], // A fresh undoable action always clears the redo stack.
  };
}

/* --- Context ------------------------------------------------------------------------------- */

export interface StoreValue {
  readonly state: AppState;
  readonly dispatch: Dispatch<Action>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Distinct source files still contributing at least one page to the plan. */
  readonly fileCount: number;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({
  children,
  initial = initialState,
}: {
  children: ReactNode;
  /**
   * Hydration point. Session recovery uses it: `App.tsx` remounts this provider under a new `key`
   * with the restored state, so `useReducer` re-initialises from it. There is deliberately no
   * `HYDRATE` action — this prop is the one state-seeding path.
   */
  initial?: AppState;
}) {
  const [state, dispatch] = useReducer(reducer, initial);

  useUndoRedoShortcuts(dispatch);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      dispatch,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      fileCount: new Set(state.pages.map((page) => page.sourceId)).size,
    }),
    [state],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>');
  return value;
}
