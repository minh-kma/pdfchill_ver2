import { useEffect, useState } from 'react';
import { AppBar } from './shared/components/AppBar.tsx';
import { Footer } from './shared/components/Footer.tsx';
import { SessionRecoveryBanner } from './shared/components/SessionRecoveryBanner.tsx';
import { StoreProvider } from './shared/state/store.tsx';
import type { AppState } from './shared/state/types.ts';
import {
  fromPersisted,
  isRecoverable,
  isRestorable,
  type PersistedSession,
} from './shared/state/persistence/sessionSchema.ts';
import { clearSession, loadSession } from './shared/state/persistence/sessionStore.ts';
import { SessionAutosave } from './shared/state/persistence/useSessionAutosave.ts';
import { useRoute } from './shared/router/useRoute.ts';
import { useDocumentMeta } from './shared/seo/useDocumentMeta.ts';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

/**
 * Session recovery, as a three-state machine (`spec/features.md` §1.12).
 *
 * `checking` and `offering` both suspend autosave. That is the point: a write during either would
 * overwrite the very record being offered with the empty state that has not been restored yet
 * (`spec/edge-cases.md`).
 */
type Recovery =
  | { readonly kind: 'checking' }
  | { readonly kind: 'offering'; readonly session: PersistedSession }
  | { readonly kind: 'settled' };

/**
 * The whole routing table: home, one route per registry entry, not-found.
 *
 * There is deliberately no per-tool branch here. `useRoute()` resolves the URL slug against the
 * registry and hands back the entry; the entry names its own component. Adding tool #12 therefore
 * touches this file zero times — SPEC.md §7 pain point #1 (the old App.tsx needed four scattered,
 * unchecked edits per tool).
 */
export function App() {
  const route = useRoute();
  useDocumentMeta(route);

  const [recovery, setRecovery] = useState<Recovery>({ kind: 'checking' });
  /**
   * Restoring remounts `StoreProvider` under a new key so its `useReducer` re-initialises from
   * `initial` — the hydration point the store already documents. Deliberately not a `HYDRATE`
   * action: a second state-seeding path is what this prop exists to avoid.
   */
  const [hydration, setHydration] = useState<{ key: number; initial?: AppState }>({ key: 0 });

  useEffect(() => {
    let cancelled = false;
    void loadSession().then((session) => {
      if (cancelled) return;
      // A save that is absent, stale, or has nothing to restore produces no prompt — and is left in
      // storage exactly as found. Staleness is never a reason to delete (`spec/edge-cases.md`).
      const offerable = session && isRecoverable(session, Date.now()) && isRestorable(session);
      setRecovery(offerable ? { kind: 'offering', session } : { kind: 'settled' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StoreProvider
      key={hydration.key}
      {...(hydration.initial ? { initial: hydration.initial } : {})}
    >
      {/* Autosave stays suspended until the recovery decision is made. */}
      <SessionAutosave suspended={recovery.kind !== 'settled'} />

      <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
        <AppBar />

        {recovery.kind === 'offering' && (
          <SessionRecoveryBanner
            session={recovery.session}
            onRestore={() => {
              const restored = fromPersisted(recovery.session);
              // Consumed: an accepted save is not left behind to be offered again on next load.
              void clearSession();
              setHydration((previous) => ({ key: previous.key + 1, initial: restored }));
              setRecovery({ kind: 'settled' });
            }}
            onDismiss={() => {
              // An explicit decline clears storage, same as Restore and Start Over.
              void clearSession();
              setRecovery({ kind: 'settled' });
            }}
          />
        )}

        <main className="flex-1">
          {route.kind === 'home' && <HomePage />}
          {route.kind === 'tool' && <route.tool.Component tool={route.tool} />}
          {route.kind === 'notFound' && <NotFoundPage />}
        </main>
        <Footer />
      </div>
    </StoreProvider>
  );
}
