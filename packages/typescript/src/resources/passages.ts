import { type Fetcher } from '../http/fetcher.js';
import {
  PassageSchema,
  type Passage,
  type PassageGetParams,
} from '../schemas/passage.schema.js';
import { apiResponseSchema, type ApiResponse } from '../schemas/common.js';
import { contentRenderingToQuery } from '../schemas/content-params.js';

const getResponseSchema = apiResponseSchema(PassageSchema);

/**
 * Handle for `/bibles/{bibleId}/passages` endpoints. Returned as
 * `client.passages` from {@link createBibleClient}. A passage is an arbitrary
 * verse range — e.g. `'GEN.1.1-GEN.1.5'` or a comma-separated list of refs.
 */
export class PassagesResource {
  constructor(private readonly fetcher: Fetcher) {}

  /**
   * Fetch a passage spanning an arbitrary verse range with rendered content.
   *
   * @param bibleId    Parent Bible ID.
   * @param passageId  Passage spec (range or comma-separated refs), e.g. `'JHN.3.16-JHN.3.17'`.
   * @param params     Optional render-control flags. See {@link PassageGetParams}.
   * @param signal     Optional AbortSignal.
   * @throws {NotFoundError}    if the Bible does not exist.
   * @throws {BadRequestError}  if the passage spec is malformed.
   * @example
   *   const { data } = await client.passages.get(
   *     'bba9f40183526463-01', 'JHN.3.16',
   *     { contentType: 'text' },
   *   );
   */
  get(
    bibleId: string,
    passageId: string,
    params?: PassageGetParams,
    signal?: AbortSignal,
  ): Promise<ApiResponse<Passage>> {
    return this.fetcher.get(
      `/bibles/${encodeURIComponent(bibleId)}/passages/${encodeURIComponent(passageId)}`,
      getResponseSchema,
      params ? contentRenderingToQuery(params, 'passages.get') : undefined,
      signal,
    );
  }
}
