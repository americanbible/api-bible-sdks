import type { Bible } from '@americanbible/api-bible-sdk';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch a single Bible by id.
 *
 * Thin by design: maps 1:1 to `client.bibles.get`, forwards the abort signal, and
 * unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the single-`get` template used by
 * {@link useAudioBible} (the counterpart to the list hook {@link useBibles}).
 *
 * @param bibleId  Bible ID (e.g. 'bba9f40183526463-01'). When falsy the hook stays
 *                 idle (no request), convenient while the id is still resolving from
 *                 a route param.
 */
export function useBible(bibleId: string): AsyncResource<Bible> {
  return useAsyncResource<Bible>(
    (client, signal) => client.bibles.get(bibleId, signal).then((res) => res.data),
    [bibleId],
    { enabled: Boolean(bibleId), resourceKey: 'bibles.get' },
  );
}
