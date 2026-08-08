import { useMemo, useSyncExternalStore } from 'react';
import { parseLocation } from '../lib/routes.ts';
import { findToolBySlug, type ToolDefinition } from '../../toolRegistry.ts';
import {
  getLocationSnapshot,
  getServerLocationSnapshot,
  subscribeToLocation,
} from './navigation.ts';

export type Route =
  | { readonly kind: 'home' }
  | { readonly kind: 'tool'; readonly tool: ToolDefinition }
  | { readonly kind: 'notFound'; readonly slug: string };

/**
 * Resolves the current URL to a route.
 *
 * The URL is read through `parseLocation()` — the app's single path parser, shared with the i18n
 * language detector (SPEC.md §2). The slug -> tool step goes through the registry, so the routing
 * table is literally the registry: no route list is maintained here.
 */
export function useRoute(): Route {
  const pathname = useSyncExternalStore(
    subscribeToLocation,
    getLocationSnapshot,
    getServerLocationSnapshot,
  );

  return useMemo(() => {
    const { slug } = parseLocation(pathname);
    if (!slug) return { kind: 'home' };
    const tool = findToolBySlug(slug);
    return tool ? { kind: 'tool', tool } : { kind: 'notFound', slug };
  }, [pathname]);
}
