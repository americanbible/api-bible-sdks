import type { Book, BookListParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch the books of a Bible.
 *
 * Thin by design: it maps 1:1 to `client.books.list`, forwards the abort
 * signal, and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this file is the template every future resource
 * hook copies.
 *
 * @param bibleId  Bible ID. When falsy the hook stays idle (no request),
 *                 convenient while the id is still resolving from a route param.
 * @param params   Optional `include-chapters` / `include-chapters-and-sections`.
 */
export function useBooks(bibleId: string, params?: BookListParams): AsyncResource<Book[]> {
  return useAsyncResource<Book[]>(
    (client, signal) => client.books.list(bibleId, params, signal).then((res) => res.data),
    // Re-run when the id or params change. stableStringify turns a possibly-new-
    // every-render params object into a stable, key-order-independent string, so
    // callers needn't memoize.
    [bibleId, stableStringify(params ?? {})],
    { enabled: Boolean(bibleId), resourceKey: 'books.list' },
  );
}
