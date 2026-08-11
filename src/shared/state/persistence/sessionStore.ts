/**
 * The IndexedDB layer for session autosave. The only code in the app that touches IndexedDB.
 *
 * WHY NATIVE IDB AND NOT `idb-keyval`
 * The old app used `idb-keyval`. This is a deliberate implementation deviation — behaviour is
 * identical, the dependency is not added. What is needed here is get/set/delete against exactly one
 * key in one object store; that is ~60 lines of the native API. This codebase keeps its storage and
 * parsing primitives dependency-free on purpose (`splitRanges.ts`, `rotation.ts`, `language.ts` all
 * say so), a new runtime dependency would need a CLAUDE.md tech-stack row, and the `ArrayBuffer`
 * re-wrap the spec attributes to `idb-keyval` is really structured-clone behaviour that applies
 * either way.
 *
 * Every function here resolves rather than rejects on failure. Storage is a nicety: a blocked or
 * unavailable IndexedDB (private mode, disabled storage, quota) must degrade to "no autosave", and
 * must never surface an error to a user who did not ask for this feature.
 */

import { logDiagnostic } from '../../lib/logError.ts';
import {
  parsePersisted,
  SESSION_STORAGE_KEY,
  type PersistedSession,
} from './sessionSchema.ts';

const DB_NAME = 'pdfchill';
const DB_VERSION = 1;
const STORE_NAME = 'session';

function openDatabase(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(undefined);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Firefox throws here outright when storage is disabled, rather than firing onerror.
      resolve(undefined);
      return;
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    // A concurrent tab holding an older version open would otherwise hang this promise forever.
    request.onblocked = () => resolve(undefined);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    void openDatabase().then((db) => {
      if (!db) {
        resolve(undefined);
        return;
      }
      try {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = operation(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
        transaction.oncomplete = () => db.close();
        transaction.onabort = () => {
          db.close();
          resolve(undefined);
        };
      } catch {
        db.close();
        resolve(undefined);
      }
    });
  });
}

/**
 * Reads the saved session, or `undefined` if there is none / it is unreadable.
 *
 * Does **not** apply the 5-minute window — that is `isRecoverable()`'s job, kept separate so this
 * function never has a reason to delete a record it merely found stale.
 */
export async function loadSession(): Promise<PersistedSession | undefined> {
  const raw = await runTransaction<unknown>('readonly', (store) => store.get(SESSION_STORAGE_KEY));
  if (raw === undefined) return undefined;

  const parsed = parsePersisted(raw);
  if (!parsed) {
    // Left in place, not deleted: a record we cannot read is treated exactly like no record.
    logDiagnostic('session autosave: stored record did not match the current schema; ignoring it', String(SESSION_STORAGE_KEY));
    return undefined;
  }
  return parsed;
}

/** Writes the session. Resolves `false` if it could not be stored. */
export async function saveSession(session: PersistedSession): Promise<boolean> {
  const result = await runTransaction('readwrite', (store) =>
    store.put(session, SESSION_STORAGE_KEY),
  );
  return result !== undefined;
}

/** Explicit clear — Restore, Dismiss, and Start Over. Never called merely because a save is old. */
export async function clearSession(): Promise<void> {
  await runTransaction('readwrite', (store) => store.delete(SESSION_STORAGE_KEY));
}
