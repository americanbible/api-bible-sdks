import type { AudioBibleSummary, AudioBibleListParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * List the available audio Bibles, optionally filtered by language,
 * abbreviation, name, or specific IDs.
 *
 * Thin by design: maps 1:1 to `client.audioBibles.list`, forwards the abort
 * signal, and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the `useBooks` template.
 *
 * Unlike every other list hook it takes no required id (the catalog is
 * top-level), so there is no `enabled` guard — `params` is fully optional and
 * the hook is always active.
 *
 * @param params  Optional filters (language, abbreviation, name, ids,
 *                includeFullDetails).
 */
export function useAudioBibles(params?: AudioBibleListParams): AsyncResource<AudioBibleSummary[]> {
  return useAsyncResource<AudioBibleSummary[]>(
    (client, signal) => client.audioBibles.list(params, signal).then((res) => res.data),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize.
    [stableStringify(params ?? {})],
    { resourceKey: 'audioBibles.list' },
  );
}
