import type { AudioBookSummary, AudioBookGetParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch a single book within an audio Bible.
 *
 * Thin by design: maps 1:1 to `client.audioBibles.getBook`, forwards the abort
 * signal, and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — the single-`get` counterpart to {@link useAudioBooks}.
 *
 * @param audioBibleId  Audio Bible ID. When falsy the hook stays idle (no request).
 * @param bookId        Book ID (e.g. 'GEN'). When falsy the hook stays idle.
 * @param params        Optional `includeChapters` flag.
 */
export function useAudioBook(
  audioBibleId: string,
  bookId: string,
  params?: AudioBookGetParams,
): AsyncResource<AudioBookSummary> {
  return useAsyncResource<AudioBookSummary>(
    (client, signal) => client.audioBibles.getBook(audioBibleId, bookId, params, signal).then((res) => res.data),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize.
    [audioBibleId, bookId, stableStringify(params ?? {})],
    { enabled: Boolean(audioBibleId && bookId), resourceKey: 'audioBibles.getBook' },
  );
}
