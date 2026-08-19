import type { VerseSummary } from '@americanbible/api-bible-sdk';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * List the verse summaries within a chapter (id, reference, position — no
 * rendered text). Verses are chapter-scoped; for a single verse's content use
 * {@link useVerse}.
 *
 * Thin by design: maps 1:1 to `client.verses.list`, forwards the abort signal,
 * and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the `useSectionsForChapter` template.
 *
 * @param bibleId    Bible ID. When falsy the hook stays idle (no request),
 *                   convenient while the id is still resolving from a route param.
 * @param chapterId  Chapter ID (e.g. 'GEN.1'). When falsy the hook stays idle.
 */
export function useVerses(bibleId: string, chapterId: string): AsyncResource<VerseSummary[]> {
  return useAsyncResource<VerseSummary[]>(
    (client, signal) => client.verses.list(bibleId, chapterId, signal).then((res) => res.data),
    // Two required ids and no params object, so the raw ids are a stable dep
    // key on their own — no JSON.stringify needed (unlike params-bearing hooks).
    [bibleId, chapterId],
    { enabled: Boolean(bibleId && chapterId), resourceKey: 'verses.list' },
  );
}
