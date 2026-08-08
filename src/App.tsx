import { AppBar } from './shared/components/AppBar.tsx';
import { Footer } from './shared/components/Footer.tsx';
import { StoreProvider } from './shared/state/store.tsx';
import { useRoute } from './shared/router/useRoute.ts';
import { useDocumentMeta } from './shared/seo/useDocumentMeta.ts';
import { HomePage } from './pages/HomePage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

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

  return (
    // The working page plan (and its undo history) lives above the router so a document stays
    // loaded when the user moves between tools — SPEC.md §3.1's one-session model.
    <StoreProvider>
      <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
        <AppBar />
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
