import { type Fetcher } from '../http/fetcher.js';
import { BookSchema, type Book, type BookListParams, type BookGetParams } from '../schemas/book.schema.js';
import { apiResponseSchema, type ApiResponse } from '../schemas/common.js';

// Built once at module load — not on every request.
const listResponseSchema = apiResponseSchema(BookSchema.array());
const getResponseSchema = apiResponseSchema(BookSchema);

// Per-method, type-safe builders — same pattern as audio-bibles.ts. The
// compiler will flag any param added to BookListParams / BookGetParams that
// isn't wired through here, which a generic helper would silently accept.

function bookListToQuery(
  params: BookListParams,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  if (typeof params.includeChapters === 'boolean') {
    result['include-chapters'] = params.includeChapters ? 'true' : 'false';
  }
  if (typeof params.includeChaptersAndSections === 'boolean') {
    result['include-chapters-and-sections'] = params.includeChaptersAndSections ? 'true' : 'false';
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function bookGetToQuery(
  params: BookGetParams,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  if (typeof params.includeChapters === 'boolean') {
    result['include-chapters'] = params.includeChapters ? 'true' : 'false';
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Handle for `/bibles/{bibleId}/books` endpoints. Returned as `client.books`
 * from {@link createBibleClient}.
 */
export class BooksResource {
  constructor(private readonly fetcher: Fetcher) {}

  /**
   * List books within a Bible. Optionally include chapter (and section)
   * summaries inline to save round-trips.
   *
   * @param bibleId  Parent Bible ID.
   * @param params   Optional flags. See {@link BookListParams}.
   * @param signal   Optional AbortSignal.
   * @returns        Array of books wrapped in {@link ApiResponse}.
   * @throws {NotFoundError} if `bibleId` does not exist.
   * @example
   *   const { data } = await client.books.list('bba9f40183526463-01', { includeChapters: true });
   */
  list(bibleId: string, params?: BookListParams, signal?: AbortSignal): Promise<ApiResponse<Book[]>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/books`,
      listResponseSchema,
      params ? bookListToQuery(params) : undefined,
      signal,
    );
  }

  /**
   * Fetch a single book by ID within a Bible.
   *
   * @param bibleId  Parent Bible ID.
   * @param bookId   Book ID (e.g. `'GEN'`, `'MAT'`).
   * @param params   Optional flags. See {@link BookGetParams}.
   * @param signal   Optional AbortSignal.
   * @throws {NotFoundError} if the Bible or book does not exist.
   */
  get(bibleId: string, bookId: string, params?: BookGetParams, signal?: AbortSignal): Promise<ApiResponse<Book>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/books/${encodeURIComponent(bookId)}`,
      getResponseSchema,
      params ? bookGetToQuery(params) : undefined,
      signal,
    );
  }
}
