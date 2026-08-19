import type { Passage, PassageGetParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch a single passage — an arbitrary verse range or comma-separated ref list
 * (e.g. 'JHN.3.16-JHN.3.17') — optionally with rendered content (html/text/json).
 *
 * Thin by design: maps 1:1 to `client.passages.get`, forwards the abort signal,
 * and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the `useChapter` template (passages
 * expose only a single `get`, so there is no list variant).
 *
 * @param bibleId    Bible ID. When falsy the hook stays idle (no request).
 * @param passageId  Passage ID / verse range. When falsy the hook stays idle.
 * @param params     Optional content-rendering params (contentType, include-*,
 *                   parallels). Shape depends on `contentType`: 'html'/'text'
 *                   yield a string, 'json' an array of content nodes.
 */
export function usePassages(
  bibleId: string,
  passageId: string,
  params?: PassageGetParams,
): AsyncResource<Passage> {
  return useAsyncResource<Passage>(
    (client, signal) => client.passages.get(bibleId, passageId, params, signal).then((res) => res.data),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize.
    [bibleId, passageId, stableStringify(params ?? {})],
    { enabled: Boolean(bibleId && passageId), resourceKey: 'passages.get' },
  );
}
