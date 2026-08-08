import { useEffect, type Dispatch } from 'react';
import type { Action } from './store.tsx';

/**
 * Global undo/redo keys (SPEC.md §1.12): Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo.
 *
 * Suppressed while focus is inside a text field, so the browser's own text undo keeps working —
 * otherwise typing a split range and pressing Ctrl+Z would silently roll back a page edit.
 */
export function useUndoRedoShortcuts(dispatch: Dispatch<Action>): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      if (isTextEntry(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'REDO' : 'UNDO' });
      } else if (key === 'y') {
        event.preventDefault();
        dispatch({ type: 'REDO' });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
