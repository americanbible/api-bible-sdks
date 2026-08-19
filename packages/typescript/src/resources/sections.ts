import { type Fetcher } from '../http/fetcher.js';
import {
  SectionSummarySchema,
  SectionSchema,
  type SectionSummary,
  type Section,
  type SectionGetParams,
} from '../schemas/section.schema.js';
import { apiResponseSchema, type ApiResponse } from '../schemas/common.js';
import { contentRenderingToQuery } from '../schemas/content-params.js';

const listResponseSchema = apiResponseSchema(SectionSummarySchema.array());
const getResponseSchema = apiResponseSchema(SectionSchema);

/**
 * Handle for editor-defined section headings (e.g. "The Birth of Jesus").
 * Returned as `client.sections` from {@link createBibleClient}. Sections are
 * scoped to either a book or a chapter — list them via the appropriate method.
 */
export class SectionsResource {
  constructor(private readonly fetcher: Fetcher) {}

  /**
   * List section summaries within a book.
   *
   * @param bibleId  Parent Bible ID.
   * @param bookId   Parent book ID.
   * @param signal   Optional AbortSignal.
   * @throws {NotFoundError} if the book does not exist.
   */
  listForBook(bibleId: string, bookId: string, signal?: AbortSignal): Promise<ApiResponse<SectionSummary[]>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/books/${encodeURIComponent(bookId)}/sections`,
      listResponseSchema,
      undefined,
      signal,
    );
  }

  /**
   * List section summaries within a chapter.
   *
   * @param bibleId    Parent Bible ID.
   * @param chapterId  Parent chapter ID.
   * @param signal     Optional AbortSignal.
   * @throws {NotFoundError} if the chapter does not exist.
   */
  listForChapter(bibleId: string, chapterId: string, signal?: AbortSignal): Promise<ApiResponse<SectionSummary[]>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/chapters/${encodeURIComponent(chapterId)}/sections`,
      listResponseSchema,
      undefined,
      signal,
    );
  }

  /**
   * Fetch a single section with rendered content.
   *
   * @param bibleId    Parent Bible ID.
   * @param sectionId  Section ID.
   * @param params     Optional render-control flags. See {@link SectionGetParams}.
   * @param signal     Optional AbortSignal.
   * @throws {NotFoundError} if the section does not exist.
   */
  get(bibleId: string, sectionId: string, params?: SectionGetParams, signal?: AbortSignal): Promise<ApiResponse<Section>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/sections/${encodeURIComponent(sectionId)}`,
      getResponseSchema,
      params ? contentRenderingToQuery(params, 'sections.get') : undefined,
      signal,
    );
  }
}
