import type { ChapterSummary } from '@americanbible/api-bible-sdk';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * List the chapters of a book within a Bible.
 *
 * Thin by design: maps 1:1 to `client.chapters.list`, forwards the abort
 * signal, and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the `useBooks` template.
 *
 * @param bibleId  Bible ID. When falsy the hook stays idle (no request),
 *                 convenient while the id is still resolving from a route param.
 * @param bookId   Book ID (e.g. 'GEN'). When falsy the hook stays idle.
 */
export function useChapters(bibleId: string, bookId: string): AsyncResource<ChapterSummary[]> {
  return useAsyncResource<ChapterSummary[]>(
    (client, signal) => client.chapters.list(bibleId, bookId, signal).then((res) => res.data),
    // Two required ids and no params object, so the raw ids are a stable dep
    // key on their own — no JSON.stringify needed (unlike params-bearing hooks).
    [bibleId, bookId],
    { enabled: Boolean(bibleId && bookId), resourceKey: 'chapters.list' },
  );
}
