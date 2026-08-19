import { z } from 'zod';

export const SearchVerseSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  bibleId: z.string(),
  bookId: z.string(),
  chapterId: z.string(),
  reference: z.string(),
  text: z.string(),
}).passthrough();

export const SearchPassageSchema = z.object({
  id: z.string(),
  bibleId: z.string(),
  orgId: z.string(),
  content: z.string(),
  reference: z.string(),
  verseCount: z.number(),
  copyright: z.string(),
}).passthrough();

export const SearchResultSchema = z.object({
  query: z.string(),
  limit: z.number(),
  offset: z.number(),
  total: z.number(),
  verseCount: z.number(),
  verses: z.array(SearchVerseSchema).optional(),
  passages: z.array(SearchPassageSchema).optional(),
}).passthrough();

export type SearchVerse = z.infer<typeof SearchVerseSchema>;
export type SearchPassage = z.infer<typeof SearchPassageSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;

export type SearchParams = {
  /** Search query. Required by the API — omitting it is a guaranteed 400. */
  query: string;
  limit?: number;
  offset?: number;
  sort?: 'relevance' | 'canonical' | 'reverse-canonical';
  range?: string;
  fuzziness?: 'AUTO' | '0' | '1' | '2';
};
