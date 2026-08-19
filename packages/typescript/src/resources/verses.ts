import { type Fetcher } from '../http/fetcher.js';
import {
  VerseSummarySchema,
  VerseSchema,
  type VerseSummary,
  type Verse,
  type VerseGetParams,
} from '../schemas/verse.schema.js';
import { apiResponseSchema, type ApiResponse } from '../schemas/common.js';
import { contentRenderingToQuery } from '../schemas/content-params.js';

const listResponseSchema = apiResponseSchema(VerseSummarySchema.array());
const getResponseSchema = apiResponseSchema(VerseSchema);

/**
 * Handle for `/bibles/{bibleId}/verses` and chapter-scoped verse listings.
 * Returned as `client.verses` from {@link createBibleClient}.
 */
export class VersesResource {
  constructor(private readonly fetcher: Fetcher) {}

  /**
   * List verse summaries within a chapter (no rendered content).
   *
   * @param bibleId    Parent Bible ID.
   * @param chapterId  Parent chapter ID (e.g. `'GEN.1'`).
   * @param signal     Optional AbortSignal.
   * @throws {NotFoundError} if the chapter does not exist.
   */
  list(bibleId: string, chapterId: string, signal?: AbortSignal): Promise<ApiResponse<VerseSummary[]>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/chapters/${encodeURIComponent(chapterId)}/verses`,
      listResponseSchema,
      undefined,
      signal,
    );
  }

  /**
   * Fetch a single verse with rendered content.
   *
   * @param bibleId  Parent Bible ID.
   * @param verseId  Verse ID (e.g. `'GEN.1.1'`).
   * @param params   Optional render-control flags. See {@link VerseGetParams}.
   * @param signal   Optional AbortSignal.
   * @throws {NotFoundError} if the verse does not exist.
   */
  get(bibleId: string, verseId: string, params?: VerseGetParams, signal?: AbortSignal): Promise<ApiResponse<Verse>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/verses/${encodeURIComponent(verseId)}`,
      getResponseSchema,
      params ? contentRenderingToQuery(params, 'verses.get') : undefined,
      signal,
    );
  }
}
