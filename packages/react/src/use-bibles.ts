import type { Bible, BibleListParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * List available Bibles, optionally filtered by language / abbreviation / name / ids.
 *
 * Thin by design: maps 1:1 to `client.bibles.list`, forwards the abort signal, and
 * unwraps the `{ data }` envelope. Always enabled — there is no required id (mirrors
 * {@link useAudioBibles}). All lifecycle/state lives in {@link useAsyncResource}.
 *
 * @param params  Optional filters: `language`, `abbreviation`, `name`, `ids`,
 *                `includeFullDetails`.
 */
export function useBibles(params?: BibleListParams): AsyncResource<Bible[]> {
  return useAsyncResource<Bible[]>(
    (client, signal) => client.bibles.list(params, signal).then((res) => res.data),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize.
    [stableStringify(params ?? {})],
    { resourceKey: 'bibles.list' },
  );
}
