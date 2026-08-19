import type { SearchParams, SearchResult } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Full-text search across a Bible's text.
 *
 * Thin by design: maps 1:1 to `client.search.search`, forwards the abort signal,
 * and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the `usePassages`/`useBooks` template.
 *
 * The result (`SearchResult`) carries its own pagination state — `total`,
 * `limit`, `offset` — so callers page by incrementing `params.offset`; there is
 * deliberately no paginate/debounce helper here (the core SDK owns query build,
 * validation, and paging).
 *
/** Options for {@link useSearch}. */
export interface UseSearchOptions {
  /**
   * Debounce the query by this many milliseconds — ideal for search-as-you-type.
   * A run of keystrokes collapses to a single request once typing settles;
   * intermediate queries are cancelled before they fire. Omit (or `0`) to search
   * on every change.
   */
  debounceMs?: number;
}

/**
 * @param bibleId  Bible ID to search. When falsy the hook stays idle (no request).
 * @param params   Search params. `query` is required by the API; `limit`,
 *                 `offset`, `sort`, `range`, and `fuzziness` are optional.
 * @param options  Optional `debounceMs` for search-as-you-type.
 */
export function useSearch(
  bibleId: string,
  params: SearchParams,
  options?: UseSearchOptions,
): AsyncResource<SearchResult> {
  return useAsyncResource<SearchResult>(
    (client, signal) => client.search.search(bibleId, params, signal).then((res) => res.data),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize. `params`
    // is required (unlike the other hooks), so no `?? {}` fallback — the type
    // guarantees it's present.
    [bibleId, stableStringify(params)],
    // Idle until there's a real (trimmed) query — this both avoids an empty
    // request and short-circuits the SDK's synchronous empty-query guard. The
    // `?.` also keeps a JS caller who omits `query` (bypassing the types) from
    // crashing render on `undefined.trim()`.
    {
      enabled: Boolean(bibleId && params.query?.trim()),
      resourceKey: 'search.search',
      debounceMs: options?.debounceMs,
    },
  );
}
