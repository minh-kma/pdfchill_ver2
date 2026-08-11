/**
 * Debounced session autosave. Mounted inside `StoreProvider`, so it sees the live store.
 *
 * Behaviour reproduced from `spec/edge-cases.md` ("Persistence"):
 *   - 800ms debounce after a change to sources / pages / docAnnotations / assets;
 *   - suspended entirely while a recovery banner is pending, so accepting or declining it cannot
 *     race a fresh autosave of the not-yet-restored empty state;
 *   - undo/redo pushes and any future transient UI flag do not trigger a write, because the change
 *     check compares only the four persisted slices.
 */

import { useEffect, useRef } from 'react';
import type { AppState } from '../types.ts';
import { useStore } from '../store.tsx';
import {
  AUTOSAVE_DEBOUNCE_MS,
  isEmptyState,
  persistedSliceChanged,
  toPersisted,
} from './sessionSchema.ts';
import { saveSession } from './sessionStore.ts';

/**
 * What autosave should do about a given state, before any timer is involved.
 *
 * Split out as a pure function so the suspend rule and the change rule are testable without
 * mounting React — the same reason `pickCompressResult` is pure.
 *
 *   `suspended`  — a recovery decision is outstanding; do nothing, and do not even record the
 *                  state as seen, or resuming would skip the first real save.
 *   `unchanged`  — none of the four persisted slices moved (an undo/redo push or an unrelated
 *                  re-render); no write.
 *   `skip-empty` — nothing worth saving; record it as seen so it is not reconsidered.
 *   `save`       — schedule a debounced write.
 */
export type AutosavePlan = 'suspended' | 'unchanged' | 'skip-empty' | 'save';

export function planAutosave(
  previous: AppState | undefined,
  next: AppState,
  suspended: boolean,
): AutosavePlan {
  if (suspended) return 'suspended';
  if (previous && !persistedSliceChanged(previous, next)) return 'unchanged';
  if (isEmptyState(next)) return 'skip-empty';
  return 'save';
}

export function useSessionAutosave({ suspended }: { suspended: boolean }): void {
  const { state } = useStore();
  // What was last committed to disk (or deliberately skipped), so an unrelated re-render does not
  // reschedule a save.
  const lastSavedRef = useRef<AppState | undefined>(undefined);

  useEffect(() => {
    const plan = planAutosave(lastSavedRef.current, state, suspended);

    // `suspended` returns without recording `state` as seen — the suspension has to be total, or a
    // save of the empty pre-restore state would overwrite the record the banner is offering.
    if (plan === 'suspended' || plan === 'unchanged') return;

    // An empty session is never written. Start Over clears storage explicitly (Workspace.tsx); it
    // must not also be recorded here as an empty autosave.
    if (plan === 'skip-empty') {
      lastSavedRef.current = state;
      return;
    }

    const timer = setTimeout(() => {
      lastSavedRef.current = state;
      void saveSession(toPersisted(state, Date.now()));
    }, AUTOSAVE_DEBOUNCE_MS);

    // Any further change within the window cancels this write and starts a new one — that is the
    // debounce.
    return () => clearTimeout(timer);
  }, [state, suspended]);
}

/** Renderless mount point, so the hook can live inside `StoreProvider`'s context. */
export function SessionAutosave({ suspended }: { suspended: boolean }) {
  useSessionAutosave({ suspended });
  return null;
}
