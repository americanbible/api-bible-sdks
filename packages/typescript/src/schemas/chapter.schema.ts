import { z } from 'zod';
import { ContentFieldSchema } from './common.js';
import type { ContentRenderingParams } from './content-params.js';

export const ChapterSummarySchema = z.object({
  id: z.string(),
  bibleId: z.string(),
  bookId: z.string(),
  number: z.string(),
  position: z.coerce.number().optional(),
}).passthrough();

const ChapterNavSchema = z.object({
  id: z.string(),
  number: z.string(),
  bookId: z.string(),
}).passthrough();

export const ChapterSchema = ChapterSummarySchema.extend({
  reference: z.string().optional(),
  verseCount: z.number().optional(),
  content: ContentFieldSchema.optional(),
  // Returned on every chapter detail; the summaries in list responses omit it.
  // Matches Verse/Passage/Section, which already model it.
  copyright: z.string().optional(),
  next: ChapterNavSchema.optional(),
  previous: ChapterNavSchema.optional(),
});

export type ChapterSummary = z.infer<typeof ChapterSummarySchema>;
export type Chapter = z.infer<typeof ChapterSchema>;

export type ChapterGetParams = ContentRenderingParams;
