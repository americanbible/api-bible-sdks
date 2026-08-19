import { z } from 'zod';
import { ContentFieldSchema } from './common.js';
import type { ContentRenderingParams } from './content-params.js';

export const SectionSummarySchema = z.object({
  id: z.string(),
  bibleId: z.string(),
  bookId: z.string(),
  chapterId: z.string().optional(),
  title: z.string().optional(),
  position: z.coerce.number().optional(),
}).passthrough();

const SectionNavSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  // The API omits bookId on section nav pointers (matches the Python model);
  // only the top-level section carries a required bookId.
  bookId: z.string().optional(),
}).passthrough();

export const SectionSchema = SectionSummarySchema.extend({
  content: ContentFieldSchema.optional(),
  verseCount: z.number().optional(),
  copyright: z.string().optional(),
  next: SectionNavSchema.optional(),
  previous: SectionNavSchema.optional(),
});

export type SectionSummary = z.infer<typeof SectionSummarySchema>;
export type Section = z.infer<typeof SectionSchema>;

export type SectionGetParams = ContentRenderingParams;
