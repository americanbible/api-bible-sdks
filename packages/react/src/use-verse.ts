import type { Verse, VerseGetParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch a single verse with rendered content (html/text/json), optionally with
 * include-* flags and parallels.
 *
 * Thin by design: maps 1:1 to `client.verses.get`, forwards the abort signal,
 * and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the `useSection`/`useChapter` template
 * (the single-`get` counterpart to the list hook {@link useVerses}).
 *
 * @param bibleId  Bible ID. When falsy the hook stays idle (no request).
 * @param verseId  Verse ID (e.g. 'GEN.1.1'). When falsy the hook stays idle.
 * @param params   Optional content-rendering params (contentType, include-*,
 *                 parallels). Shape depends on `contentType`: 'html'/'text'
 *                 yield a string, 'json' an array of content nodes.
 */
export function useVerse(
  bibleId: string,
  verseId: string,
  params?: VerseGetParams,
): AsyncResource<Verse> {
  return useAsyncResource<Verse>(
    (client, signal) => client.verses.get(bibleId, verseId, params, signal).then((res) => res.data),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize.
    [bibleId, verseId, stableStringify(params ?? {})],
    { enabled: Boolean(bibleId && verseId), resourceKey: 'verses.get' },
  );
}
