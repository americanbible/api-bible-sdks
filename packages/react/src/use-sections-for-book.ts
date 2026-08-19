import type { SectionSummary } from '@americanbible/api-bible-sdk';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * List the section headings within a book — editor-defined titles such as
 * "The Creation of the World". Sections are scoped to either a book or a
 * chapter; this is the book-scoped variant (see {@link useSectionsForChapter}).
 *
 * Thin by design: maps 1:1 to `client.sections.listForBook`, forwards the abort
 * signal, and unwraps the `{ data }` envelope. All lifecycle/state lives in
 * {@link useAsyncResource} — this mirrors the `useChapters` template.
 *
 * @param bibleId  Bible ID. When falsy the hook stays idle (no request),
 *                 convenient while the id is still resolving from a route param.
 * @param bookId   Book ID (e.g. 'GEN'). When falsy the hook stays idle.
 */
export function useSectionsForBook(bibleId: string, bookId: string): AsyncResource<SectionSummary[]> {
  return useAsyncResource<SectionSummary[]>(
    (client, signal) => client.sections.listForBook(bibleId, bookId, signal).then((res) => res.data),
    // Two required ids and no params object, so the raw ids are a stable dep
    // key on their own — no JSON.stringify needed (unlike params-bearing hooks).
    [bibleId, bookId],
    { enabled: Boolean(bibleId && bookId), resourceKey: 'sections.listForBook' },
  );
}
