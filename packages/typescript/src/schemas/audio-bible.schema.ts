import { z } from 'zod';
import { LanguageSchema, CountrySchema } from './common.js';

export const AudioChapterSummarySchema = z.object({
  id: z.string(),
  bibleId: z.string(),
  number: z.string(),
  bookId: z.string(),
  // Returned by the chapters list and chapter detail endpoints, but omitted
  // when this schema is reused for AudioBookSummary.chapters under
  // include-chapters. Same reuse trap ChapterSummarySchema avoids by leaving
  // reference to ChapterSchema.
  reference: z.string().optional(),
}).passthrough();

export type AudioChapterSummary = z.infer<typeof AudioChapterSummarySchema>;

const TimecodeSchema = z.object({
  start: z.string(),
  end: z.string(),
  verseId: z.string(),
}).passthrough();

const AudioChapterNavSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  // Audio Bibles disagree on this one: some return "2", others return 2. The
  // text-side chapter nav and AudioChapterSummary.number are always strings, so
  // coerce rather than leaking the union to callers. Coercion (not a union with
  // .transform) because Fetcher.get pins a schema's input type to its output
  // type, and z.coerce is runtime-only — same reason expiresAt below uses it.
  number: z.coerce.string(),
}).passthrough();

export const AudioChapterSchema = AudioChapterSummarySchema.extend({
  // Re-narrowed: the chapter detail endpoint always sends `reference`. Only the
  // embedded AudioBookSummary.chapters shape omits it, so leaving the summary's
  // `.optional()` to flow through here would push a null check onto every
  // getChapter caller for a field they always receive.
  reference: z.string(),
  resourceUrl: z.string(),
  // Present only when api.bible has timecode data for the chapter; not a request option.
  timecodes: z.array(TimecodeSchema).optional(),
  expiresAt: z.coerce.number(),
  next: AudioChapterNavSchema.optional(),
  previous: AudioChapterNavSchema.optional(),
  copyright: z.string().optional().nullable(),
});

export type AudioChapter = z.infer<typeof AudioChapterSchema>;

export const AudioBookSummarySchema = z.object({
  id: z.string(),
  bibleId: z.string(),
  abbreviation: z.string(),
  name: z.string(),
  nameLong: z.string().optional().nullable(),
  chapters: z.array(AudioChapterSummarySchema).optional(),
}).passthrough();

export type AudioBookSummary = z.infer<typeof AudioBookSummarySchema>;

export const AudioBibleSummarySchema = z.object({
  id: z.string(),
  dblId: z.string().optional().nullable(),
  abbreviation: z.string().nullable(),
  abbreviationLocal: z.string().optional().nullable(),
  language: LanguageSchema,
  countries: z.array(CountrySchema),
  name: z.string(),
  nameLocal: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionLocal: z.string().optional().nullable(),
  relatedDbl: z.string().optional().nullable(),
  type: z.string().nullable(),
  updatedAt: z.string().nullable(),
}).passthrough();

export type AudioBibleSummary = z.infer<typeof AudioBibleSummarySchema>;

export const AudioBibleSchema = AudioBibleSummarySchema.extend({
  copyright: z.string().optional().nullable(),
  info: z.string().optional().nullable(),
});

export type AudioBible = z.infer<typeof AudioBibleSchema>;

export type AudioBibleListParams = {
  /** Filter by ISO 639-3 language code (e.g. `'eng'`). */
  language?: string;
  /** Filter by abbreviation. */
  abbreviation?: string;
  /** Filter by name (substring match). */
  name?: string;
  /**
   * Restrict to a specific set of audio Bible IDs. Sent as a CSV on the wire —
   * elements must not contain literal commas. The SDK throws synchronously
   * if any element does.
   */
  ids?: string[];
  /** Include full audio Bible details (copyright, info, …). Default: `false`. */
  includeFullDetails?: boolean;
};

export type AudioBookListParams = {
  includeChapters?: boolean;
  includeChaptersAndSections?: boolean;
};

export type AudioBookGetParams = {
  includeChapters?: boolean;
};
