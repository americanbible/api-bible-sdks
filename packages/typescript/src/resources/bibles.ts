import { type Fetcher } from '../http/fetcher.js';
import { joinIds } from './_shared.js';
import { BibleSchema, type Bible, type BibleListParams } from '../schemas/bible.schema.js';
import { apiResponseSchema, type ApiResponse } from '../schemas/common.js';

const listResponseSchema = apiResponseSchema(BibleSchema.array());
const getResponseSchema = apiResponseSchema(BibleSchema);

// Per-method, type-safe builder — matches the pattern used in audio-bibles.ts.
// The compiler will flag any param added to BibleListParams that isn't wired
// through here, which a generic `Record<string, …>` builder would silently
// accept.
function bibleListToQuery(
  params: BibleListParams,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  if (params.language !== undefined) result['language'] = params.language;
  if (params.abbreviation !== undefined) result['abbreviation'] = params.abbreviation;
  if (params.name !== undefined) result['name'] = params.name;
  if (params.ids !== undefined && params.ids.length > 0) {
    result['ids'] = joinIds(params.ids, 'bibles.list');
  }
  if (typeof params.includeFullDetails === 'boolean') {
    result['include-full-details'] = params.includeFullDetails ? 'true' : 'false';
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Handle for `/bibles` endpoints. Returned as `client.bibles` from
 * {@link createBibleClient}.
 */
export class BiblesResource {
  constructor(private readonly fetcher: Fetcher) {}

  /**
   * List available Bibles, optionally filtered by language, abbreviation, name,
   * or a set of specific IDs.
   *
   * @param params  Optional filters. See {@link BibleListParams}.
   * @param signal  Optional AbortSignal. Aborting rejects with the signal's reason.
   * @returns       Array of Bibles wrapped in {@link ApiResponse}.
   * @throws {AuthError}      on 401/403 — bad or missing api-key.
   * @throws {RateLimitError} on 429 after retries are exhausted.
   * @example
   *   const { data } = await client.bibles.list({ language: 'eng' });
   *   for (const b of data) console.log(b.id, b.abbreviation, b.name);
   */
  list(params?: BibleListParams, signal?: AbortSignal): Promise<ApiResponse<Bible[]>> {
    return this.fetcher.get(
      '/bibles',
      listResponseSchema,
      params ? bibleListToQuery(params) : undefined,
      signal,
    );
  }

  /**
   * Fetch a single Bible by its ID.
   *
   * @param bibleId  Unique identifier from {@link list} (e.g. `'bba9f40183526463-01'` for the Berean Standard Bible).
   * @param signal   Optional AbortSignal.
   * @returns        The Bible wrapped in {@link ApiResponse}.
   * @throws {NotFoundError} if the Bible does not exist.
   * @throws {AuthError}     on 401/403.
   */
  get(bibleId: string, signal?: AbortSignal): Promise<ApiResponse<Bible>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}`,
      getResponseSchema,
      undefined,
      signal,
    );
  }
}
