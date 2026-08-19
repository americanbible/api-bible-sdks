import type { AudioBible } from '@americanbible/api-bible-sdk';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch a single audio Bible by ID, including copyright and info text.
 *
 * Thin by design: maps 1:1 to `client.audioBibles.get`, forwards the abort
 * signal, and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — the single-`get` counterpart to the list hook
 * {@link useAudioBibles}.
 *
 * @param audioBibleId  Audio Bible ID. When falsy the hook stays idle (no
 *                      request), convenient while the id is still resolving
 *                      from a route param.
 */
export function useAudioBible(audioBibleId: string): AsyncResource<AudioBible> {
  return useAsyncResource<AudioBible>(
    (client, signal) => client.audioBibles.get(audioBibleId, signal).then((res) => res.data),
    // A single required id and no params object, so the raw id is a stable dep
    // key on its own — no JSON.stringify needed (unlike params-bearing hooks).
    [audioBibleId],
    { enabled: Boolean(audioBibleId), resourceKey: 'audioBibles.get' },
  );
}
