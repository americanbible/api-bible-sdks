import { z } from 'zod';
import { LanguageSchema, CountrySchema } from './common.js';

// Minimal audio-bible shape embedded inside /bibles/{id}. The full schema returned by
// /audio-bibles is AudioBibleSummarySchema in audio-bible.schema.ts.
const EmbeddedAudioBibleSchema = z.object({
  id: z.string(),
  dblId: z.string().optional().nullable(),
  name: z.string(),
  nameLocal: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionLocal: z.string().optional().nullable(),
}).passthrough();

export const BibleSchema = z.object({
  id: z.string(),
  dblId: z.string().optional().nullable(),
  abbreviation: z.string(),
  abbreviationLocal: z.string().optional().nullable(),
  name: z.string(),
  nameLocal: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionLocal: z.string().optional().nullable(),
  relatedDbl: z.string().nullable().optional(),
  type: z.string(),
  updatedAt: z.string(),
  language: LanguageSchema,
  countries: z.array(CountrySchema),
  audioBibles: z.array(EmbeddedAudioBibleSchema),
}).passthrough();

export type Bible = z.infer<typeof BibleSchema>;

export type BibleListParams = {
  /** Filter by ISO 639-3 language code (e.g. `'eng'`). */
  language?: string;
  /** Filter by Bible abbreviation (e.g. `'BSB'`). */
  abbreviation?: string;
  /** Filter by Bible name (substring match). */
  name?: string;
  /**
   * Restrict to a specific set of Bible IDs. Sent as a CSV on the wire —
   * elements must not contain literal commas. The SDK throws synchronously
   * if any element does.
   */
  ids?: string[];
  /** Include full Bible details (info, copyright, …). Default: `false`. */
  includeFullDetails?: boolean;
};
