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

const VerseNavSchema = z.object({
  id: z.string(),
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
