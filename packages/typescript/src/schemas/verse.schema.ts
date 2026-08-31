import { z } from 'zod';
import { ContentFieldSchema } from './common.js';
import type { ContentRenderingParams } from './content-params.js';

export const VerseSummarySchema = z.object({
  id: z.string(),
  orgId: z.string().optional(),
  bibleId: z.string(),
  bookId: z.string(),
  chapterId: z.string(),
  reference: z.string().optional(),
  position: z.coerce.number().optional(),
}).passthrough();

// At the first and last verse of a Bible the API returns an empty object rather
// than omitting the key — `previous: {}` on GEN.intro.0, `next: {}` on
// REV.22.21 — so `.optional()` on the parent is not enough and every field here
// must be optional too. Chapters and sections omit the key at their boundaries
// instead, which is why their nav schemas differ.
const VerseNavSchema = z.object({
  id: z.string().optional(),
  number: z.string().optional(),
  bookId: z.string().optional(),
}).passthrough();

export const VerseSchema = VerseSummarySchema.extend({
  content: ContentFieldSchema.optional(),
  verseCount: z.number().optional(),
  copyright: z.string().optional(),
  next: VerseNavSchema.optional(),
  previous: VerseNavSchema.optional(),
});

export type VerseSummary = z.infer<typeof VerseSummarySchema>;
export type Verse = z.infer<typeof VerseSchema>;

export type VerseGetParams = ContentRenderingParams;
