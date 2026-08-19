import { Fetcher } from '../http/fetcher.js';
import { InvalidInputError } from '../http/errors.js';
import { apiResponseSchema, type ApiResponse } from '../schemas/common.js';
import { SearchResultSchema, type SearchResult, type SearchParams } from '../schemas/search.schema.js';

const searchResponseSchema = apiResponseSchema(SearchResultSchema);

/**
 * Handle for `/bibles/{bibleId}/search`. Returned as `client.search` from
 * {@link createBibleClient}. Use offset/limit pagination — the API does not
 * expose a cursor.
 */
export class SearchResource {
  constructor(private readonly fetcher: Fetcher) {}

  /**
   * Full-text search across a Bible. Returns verses and/or passages matching
   * the query, sorted by relevance unless overridden.
   *
   * @param bibleId  Bible to search within.
   * @param params   Query (required), plus paging, sort, and fuzziness options. See {@link SearchParams}.
   * @param signal   Optional AbortSignal.
   * @returns        Search results with `query`, `limit`, `offset`, `total`, and matching `verses`/`passages`.
   * @throws {NotFoundError}   if the Bible does not exist.
   * @throws {BadRequestError} if the query is malformed or too long.
   * @example
   *   const { data } = await client.search.search(
   *     'bba9f40183526463-01',
   *     { query: 'love', limit: 10, sort: 'relevance' },
   *   );
   *   console.log(`${data.total} matches`);
   *   for (const v of data.verses ?? []) console.log(v.reference, v.text);
   */
  search(bibleId: string, params: SearchParams, signal?: AbortSignal): Promise<ApiResponse<SearchResult>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/search`,
      searchResponseSchema,
      toQueryParams(params),
      signal,
    );
  }
}

// Reject locally what the API would reject with an opaque 400 anyway — a fast,
// named error beats a wasted round-trip. Mirrors the synchronous CSV guard in
// bibles.list (see bibles.ts).
function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidInputError(
      `search: ${field} must be a non-negative integer, received: ${JSON.stringify(value)}`,
    );
  }
}

function toQueryParams(params: SearchParams): Record<string, string> {
  // An empty/whitespace query serializes to `query=` — a guaranteed 400.
  if (params.query.trim() === '') {
    throw new InvalidInputError('search: query must not be empty');
  }
  const result: Record<string, string> = { query: params.query };

  if (params.limit !== undefined) {
    // `String(NaN)`/`String(Infinity)`/floats all serialize to garbage the API
    // rejects; catch them here with a message that names the field.
    assertNonNegativeInteger(params.limit, 'limit');
    result['limit'] = String(params.limit);
  }
  if (params.offset !== undefined) {
    assertNonNegativeInteger(params.offset, 'offset');
    result['offset'] = String(params.offset);
  }
  if (params.sort !== undefined)      result['sort']      = params.sort;
  if (params.range !== undefined)     result['range']     = params.range;
  if (params.fuzziness !== undefined) result['fuzziness'] = params.fuzziness;

  return result;
}
