import { z } from 'zod';
import { ContentFieldSchema } from './common.js';
import type { ContentRenderingParams } from './content-params.js';

export const PassageSchema = z.object({
  id: z.string(),
  bibleId: z.string(),
  orgId: z.string().optional(),
  content: ContentFieldSchema.optional(),
  reference: z.string().optional(),
  verseCount: z.number().optional(),
  copyright: z.string().optional(),
}).passthrough();

export type Passage = z.infer<typeof PassageSchema>;

export type PassageGetParams = ContentRenderingParams;
