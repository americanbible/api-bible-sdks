import { z } from 'zod';

// One verse hit from a keyword search. Every field is present on every verse of
// every keyword response observed (ordinary, book-name, and zero-result
// queries), and the keyword branch is the one that has always worked —
// loosening these would break working consumer code to buy nothing.
export const SearchVerseSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  bibleId: z.string(),
  bookId: z.string(),
  chapterId: z.string(),
  reference: z.string(),
  text: z.string(),
}).passthrough();

// One passage from a reference search. This is the same nine-key object
// /bibles/{bibleId}/passages/{passageId} returns, so its strictness is kept in
// step with PassageSchema (passage.schema.ts) — change one, change both.
//
// Everything but id/bibleId is optional. This branch was unreachable until now
// (SearchResultSchema rejected every reference response before the parser
// descended into `passages`), so no consumer depends on the old required set,
// and the evidence for requiring them is one query against one Bible.
export const SearchPassageSchema = z.object({
  id: z.string(),
  bibleId: z.string(),
  orgId: z.string().optional(),
  /** e.g. `'JHN'`. Returned by the API; previously survived only via passthrough. */
  bookId: z.string().optional(),
  /** e.g. `['JHN.3']` — more than one element when the range crosses a chapter. */
  chapterIds: z.array(z.string()).optional(),
  reference: z.string().optional(),
  // Always an HTML string: /search takes no content-type parameter, so the
  // `json` node-array variant of ContentFieldSchema cannot occur here.
  content: z.string().optional(),
  verseCount: z.number().optional(),
  // Bible metadata rather than passage machinery, and the field here with real
  // per-Bible variation risk. Matches AudioBibleSchema / AudioChapterSchema.
  copyright: z.string().optional().nullable(),
}).passthrough();

/**
 * A `/bibles/{bibleId}/search` response. The API returns one of two disjoint
 * shapes, chosen by whether it can parse the query as a scripture reference.
 * No request parameter selects between them, and no field in the response tags
 * which one you got:
 *
 * - **Keyword search** (`'love'`, `'Jude'`, or a query matching nothing) —
 *   `query`, `limit`, `offset`, `total`, `verseCount` and `verses`. A search
 *   with no matches still returns all five scalars plus `verses: []`. There is
 *   no `passages` key.
 * - **Reference search** (`'John 3:16-19'`, `'John 3'`) — `passages`, and
 *   nothing else. None of the five scalars, and no `verses` key.
 *
 * Every field is therefore optional. Rather than null-checking each one, narrow
 * with {@link isKeywordSearchResult} / {@link isReferenceSearchResult}:
 *
 * ```ts
 * const { data } = await client.search.search(bibleId, { query });
 * if (isReferenceSearchResult(data)) {
 *   for (const p of data.passages) console.log(p.reference);
 * } else if (isKeywordSearchResult(data)) {
 *   console.log(`${data.total} matches`);
 *   for (const v of data.verses) console.log(v.reference, v.text);
 * }
 * ```
 */
export const SearchResultSchema = z.object({
  query: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
  total: z.number().optional(),
  verseCount: z.number().optional(),
  verses: z.array(SearchVerseSchema).optional(),
  passages: z.array(SearchPassageSchema).optional(),
}).passthrough();

export type SearchVerse = z.infer<typeof SearchVerseSchema>;
export type SearchPassage = z.infer<typeof SearchPassageSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * A {@link SearchResult} narrowed to the keyword shape by
 * {@link isKeywordSearchResult}: `verses` and `total` are guaranteed.
 *
 * Only those two are promoted. `query`, `limit` and `offset` are echoed back
 * from the request the caller just made, and `verseCount` equals
 * `verses.length`, so promoting them would widen the guard's failure surface
 * for information the caller already has.
 */
export type KeywordSearchResult = SearchResult & {
  total: number;
  verses: SearchVerse[];
};

/**
 * A {@link SearchResult} narrowed to the reference shape by
 * {@link isReferenceSearchResult}: `passages` is guaranteed.
 */
export type ReferenceSearchResult = SearchResult & {
  passages: SearchPassage[];
};

/**
 * True when the API answered with the keyword shape — paging metadata plus
 * `verses`. Narrows `total` and `verses` to non-optional.
 */
export function isKeywordSearchResult(result: SearchResult): result is KeywordSearchResult {
  return Array.isArray(result.verses) && typeof result.total === 'number';
}

/**
 * True when the API answered with the reference shape — `passages` only,
 * returned when the query parses as a scripture reference. Narrows `passages`
 * to non-optional.
 */
export function isReferenceSearchResult(result: SearchResult): result is ReferenceSearchResult {
  return Array.isArray(result.passages);
}

export type SearchParams = {
  /** Search query. Required by the API — omitting it is a guaranteed 400. */
  query: string;
  limit?: number;
  offset?: number;
  sort?: 'relevance' | 'canonical' | 'reverse-canonical';
  range?: string;
  fuzziness?: 'AUTO' | '0' | '1' | '2';
};
