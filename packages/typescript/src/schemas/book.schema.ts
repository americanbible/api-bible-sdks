import { z } from 'zod';
import { ChapterSummarySchema } from './chapter.schema.js';

export const BookSchema = z.object({
  id: z.string(),
  bibleId: z.string(),
  abbreviation: z.string(),
  name: z.string(),
  nameLong: z.string(),
  chapters: z.array(ChapterSummarySchema).optional(),
}).passthrough();

export type Book = z.infer<typeof BookSchema>;

// Plain TypeScript types for params — no runtime Zod parse needed for
// developer-controlled inputs. toQueryParams() coerces booleans for JS callers.
export type BookListParams = {
  includeChapters?: boolean;
  includeChaptersAndSections?: boolean;
};

export type BookGetParams = {
  includeChapters?: boolean;
};
