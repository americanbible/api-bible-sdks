import type { AudioBookSummary, AudioBookListParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * List the books within an audio Bible.
 *
 * Thin by design: maps 1:1 to `client.audioBibles.listBooks`, forwards the
 * abort signal, and unwraps the `{ data }` envelope. All lifecycle/state lives
 * in {@link useAsyncResource} — this mirrors the `useBooks` template.
 *
 * @param audioBibleId  Audio Bible ID. When falsy the hook stays idle (no request).
 * @param params        Optional `includeChapters` / `includeChaptersAndSections`.
 */
export function useAudioBooks(
  audioBibleId: string,
  params?: AudioBookListParams,
): AsyncResource<AudioBookSummary[]> {
  return useAsyncResource<AudioBookSummary[]>(
    (client, signal) => client.audioBibles.listBooks(audioBibleId, params, signal).then((res) => res.data),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize.
    [audioBibleId, stableStringify(params ?? {})],
    { enabled: Boolean(audioBibleId), resourceKey: 'audioBibles.listBooks' },
  );
}
