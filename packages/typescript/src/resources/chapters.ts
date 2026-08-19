import { type Fetcher } from '../http/fetcher.js';
import {
  ChapterSummarySchema,
  ChapterSchema,
  type ChapterSummary,
  type Chapter,
  type ChapterGetParams,
} from '../schemas/chapter.schema.js';
import { apiResponseSchema, type ApiResponse } from '../schemas/common.js';
import { contentRenderingToQuery } from '../schemas/content-params.js';

const listResponseSchema = apiResponseSchema(ChapterSummarySchema.array());
const getResponseSchema = apiResponseSchema(ChapterSchema);

/**
 * Handle for `/bibles/{bibleId}/chapters` endpoints. Returned as
 * `client.chapters` from {@link createBibleClient}.
 */
export class ChaptersResource {
  constructor(private readonly fetcher: Fetcher) {}

  /**
   * List the chapters within a specific book of a Bible. Returns chapter
   * summaries (no content).
   *
   * @param bibleId  Parent Bible ID.
   * @param bookId   Parent book ID (e.g. `'GEN'`).
   * @param signal   Optional AbortSignal.
   * @throws {NotFoundError} if the Bible or book does not exist.
   */
  list(bibleId: string, bookId: string, signal?: AbortSignal): Promise<ApiResponse<ChapterSummary[]>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/books/${encodeURIComponent(bookId)}/chapters`,
      listResponseSchema,
      undefined,
      signal,
    );
  }

  /**
   * Fetch a single chapter with rendered content. The shape of `content`
   * depends on `params.contentType`: `'html'` and `'text'` return a string,
   * `'json'` returns an array of {@link ContentNode}.
   *
   * @param bibleId    Parent Bible ID.
   * @param chapterId  Chapter ID (e.g. `'GEN.1'`).
   * @param params     Optional render-control flags. See
   *                   {@link ChapterGetParams} / {@link ContentRenderingParams}.
   * @param signal     Optional AbortSignal.
   * @throws {NotFoundError} if the chapter does not exist.
   * @example
   *   const { data } = await client.chapters.get(
   *     'bba9f40183526463-01', 'GEN.1',
   *     { contentType: 'text', includeVerseNumbers: true },
   *   );
   */
  get(bibleId: string, chapterId: string, params?: ChapterGetParams, signal?: AbortSignal): Promise<ApiResponse<Chapter>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/chapters/${encodeURIComponent(chapterId)}`,
      getResponseSchema,
      params ? contentRenderingToQuery(params, 'chapters.get') : undefined,
      signal,
    );
  }
}
