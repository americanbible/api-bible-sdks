import type { Chapter, ChapterGetParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch a single chapter, optionally with rendered content (html/text/json).
 *
 * Thin by design: maps 1:1 to `client.chapters.get`, forwards the abort signal,
 * and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the `useBooks` template.
 *
 * @param bibleId    Bible ID. When falsy the hook stays idle (no request).
 * @param chapterId  Chapter ID (e.g. 'GEN.1'). When falsy the hook stays idle.
 * @param params     Optional content-rendering params (contentType, include-*,
 *                   parallels). Shape depends on `contentType`: 'html'/'text'
 *                   yield a string, 'json' an array of content nodes.
 */
export function useChapter(
  bibleId: string,
  chapterId: string,
  params?: ChapterGetParams,
): AsyncResource<Chapter> {
  return useAsyncResource<Chapter>(
    (client, signal) => client.chapters.get(bibleId, chapterId, params, signal).then((res) => res.data),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize.
    [bibleId, chapterId, stableStringify(params ?? {})],
    { enabled: Boolean(bibleId && chapterId), resourceKey: 'chapters.get' },
  );
}
