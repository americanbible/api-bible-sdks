import type { SectionSummary } from '@americanbible/api-bible-sdk';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * List the section headings within a chapter — editor-defined titles such as
 * "The Creation of the World". Sections are scoped to either a book or a
 * chapter; this is the chapter-scoped variant (see {@link useSectionsForBook}).
 *
 * Thin by design: maps 1:1 to `client.sections.listForChapter`, forwards the
 * abort signal, and unwraps the `{ data }` envelope. All lifecycle/state lives
 * in {@link useAsyncResource} — this mirrors the `useChapters` template.
 *
 * @param bibleId    Bible ID. When falsy the hook stays idle (no request),
 *                   convenient while the id is still resolving from a route param.
 * @param chapterId  Chapter ID (e.g. 'GEN.1'). When falsy the hook stays idle.
 */
export function useSectionsForChapter(bibleId: string, chapterId: string): AsyncResource<SectionSummary[]> {
  return useAsyncResource<SectionSummary[]>(
    (client, signal) => client.sections.listForChapter(bibleId, chapterId, signal).then((res) => res.data),
    // Two required ids and no params object, so the raw ids are a stable dep
    // key on their own — no JSON.stringify needed (unlike params-bearing hooks).
    [bibleId, chapterId],
    { enabled: Boolean(bibleId && chapterId), resourceKey: 'sections.listForChapter' },
  );
}
