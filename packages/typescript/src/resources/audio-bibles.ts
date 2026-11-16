import { type Fetcher } from '../http/fetcher.js';
import { joinIds } from './_shared.js';
import {
  AudioBibleSummarySchema,
  AudioBibleSchema,
  AudioBookSummarySchema,
  AudioChapterSummarySchema,
  AudioChapterSchema,
  type AudioBible,
  type AudioBibleSummary,
  type AudioBibleListParams,
  type AudioBookSummary,
  type AudioBookListParams,
  type AudioBookGetParams,
  type AudioChapterSummary,
  type AudioChapter,
  type AudioChapterGetParams,
} from '../schemas/audio-bible.schema.js';
import { apiResponseSchema, type ApiResponse } from '../schemas/common.js';

const listBiblesResponseSchema = apiResponseSchema(AudioBibleSummarySchema.array());
const getBibleResponseSchema = apiResponseSchema(AudioBibleSchema);
const listBooksResponseSchema = apiResponseSchema(AudioBookSummarySchema.array());
const getBookResponseSchema = apiResponseSchema(AudioBookSummarySchema);
const listChaptersResponseSchema = apiResponseSchema(AudioChapterSummarySchema.array());
const getChapterResponseSchema = apiResponseSchema(AudioChapterSchema);

// Three separate per-method builders rather than one union-typed function that
// discriminates with `'key' in params`. The `in`-check approach compiled fine
// but offered no protection against a typo'd key string or a new param added
// to the schema that nobody wired through. Each builder below takes its exact
// param type, so the compiler will catch every drift.

function audioBiblesListToQuery(
  params: AudioBibleListParams,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  if (params.language !== undefined) result['language'] = params.language;
  if (params.abbreviation !== undefined) result['abbreviation'] = params.abbreviation;
  if (params.name !== undefined) result['name'] = params.name;
  if (params.ids !== undefined && params.ids.length > 0) {
    result['ids'] = joinIds(params.ids, 'audioBibles.list');
  }
  if (typeof params.includeFullDetails === 'boolean') {
    result['include-full-details'] = params.includeFullDetails ? 'true' : 'false';
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function audioBooksListToQuery(
  params: AudioBookListParams,
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

function audioBookGetToQuery(
  params: AudioBookGetParams,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  if (typeof params.includeChapters === 'boolean') {
    result['include-chapters'] = params.includeChapters ? 'true' : 'false';
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function audioChapterGetToQuery(
  params: AudioChapterGetParams,
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  if (typeof params.includeTimecodes === 'boolean') {
    result['include-timecodes'] = params.includeTimecodes ? 'true' : 'false';
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Handle for `/audio-bibles` endpoints. Returned as `client.audioBibles` from
 * {@link createBibleClient}. Audio chapters carry a presigned `resourceUrl`
 * (with `expiresAt`); verse-level `timecodes` are included only when requested
 * with `includeTimecodes` and api.bible has them for that chapter. Fetch the
 * URL directly to stream the audio.
 */
export class AudioBiblesResource {
  constructor(private readonly fetcher: Fetcher) {}

  /**
   * List available audio Bibles, optionally filtered by language, abbreviation,
   * name, or specific IDs.
   *
   * @param params  Optional filters. See {@link AudioBibleListParams}.
   * @param signal  Optional AbortSignal.
   */
  list(params?: AudioBibleListParams, signal?: AbortSignal): Promise<ApiResponse<AudioBibleSummary[]>> {
    return this.fetcher.get(
      '/audio-bibles',
      listBiblesResponseSchema,
      params ? audioBiblesListToQuery(params) : undefined,
      signal,
    );
  }

  /**
   * Fetch a single audio Bible by ID, including copyright and info text.
   *
   * @param audioBibleId  Audio Bible ID.
   * @param signal        Optional AbortSignal.
   * @throws {NotFoundError} if the audio Bible does not exist.
   */
  get(audioBibleId: string, signal?: AbortSignal): Promise<ApiResponse<AudioBible>> {
    return this.fetcher.get(
      `/audio-bibles/${encodeURIComponent(audioBibleId)}`,
      getBibleResponseSchema,
      undefined,
      signal,
    );
  }

  /**
   * List books within an audio Bible.
   *
   * @param audioBibleId  Audio Bible ID.
   * @param params        Optional flags. See {@link AudioBookListParams}.
   * @param signal        Optional AbortSignal.
   */
  listBooks(audioBibleId: string, params?: AudioBookListParams, signal?: AbortSignal): Promise<ApiResponse<AudioBookSummary[]>> {
    return this.fetcher.get(
      `/audio-bibles/${encodeURIComponent(audioBibleId)}/books`,
      listBooksResponseSchema,
      params ? audioBooksListToQuery(params) : undefined,
      signal,
    );
  }

  /**
   * Fetch a single book within an audio Bible.
   *
   * @param audioBibleId  Audio Bible ID.
   * @param bookId        Book ID.
   * @param params        Optional flags. See {@link AudioBookGetParams}.
   * @param signal        Optional AbortSignal.
   * @throws {NotFoundError} if the audio Bible or book does not exist.
   */
  getBook(audioBibleId: string, bookId: string, params?: AudioBookGetParams, signal?: AbortSignal): Promise<ApiResponse<AudioBookSummary>> {
    return this.fetcher.get(
      `/audio-bibles/${encodeURIComponent(audioBibleId)}/books/${encodeURIComponent(bookId)}`,
      getBookResponseSchema,
      params ? audioBookGetToQuery(params) : undefined,
      signal,
    );
  }

  /**
   * List the audio chapter summaries within a book.
   *
   * @param audioBibleId  Audio Bible ID.
   * @param bookId        Book ID.
   * @param signal        Optional AbortSignal.
   */
  listChapters(audioBibleId: string, bookId: string, signal?: AbortSignal): Promise<ApiResponse<AudioChapterSummary[]>> {
    return this.fetcher.get(
      `/audio-bibles/${encodeURIComponent(audioBibleId)}/books/${encodeURIComponent(bookId)}/chapters`,
      listChaptersResponseSchema,
      undefined,
      signal,
    );
  }

  /**
   * Fetch an audio chapter, including the presigned `resourceUrl`. Pass
   * `{ includeTimecodes: true }` to request verse-level `timecodes`; they are
   * returned only when requested and api.bible has timecode data for the
   * chapter, so the field may still be absent. The URL expires at `expiresAt`
   * (epoch seconds) — refetch the chapter to get a new URL.
   *
   * The `(audioBibleId, chapterId, signal)` form is kept for compatibility.
   *
   * @param audioBibleId  Audio Bible ID.
   * @param chapterId     Audio chapter ID (e.g. `'GEN.1'`).
   * @param params        Optional flags. See {@link AudioChapterGetParams}.
   * @param signal        Optional AbortSignal.
   * @throws {NotFoundError} if the chapter does not exist.
   * @example
   *   const { data } = await client.audioBibles.getChapter(audioBibleId, 'GEN.1', { includeTimecodes: true });
   *   const audio = await fetch(data.resourceUrl);
   *   console.log(data.timecodes?.[0]); // { start: '0.000', end: '4.240', verseId: 'GEN.1.1' }
   */
  getChapter(audioBibleId: string, chapterId: string, signal?: AbortSignal): Promise<ApiResponse<AudioChapter>>;
  getChapter(audioBibleId: string, chapterId: string, params?: AudioChapterGetParams, signal?: AbortSignal): Promise<ApiResponse<AudioChapter>>;
  getChapter(
    audioBibleId: string,
    chapterId: string,
    paramsOrSignal?: AudioChapterGetParams | AbortSignal,
    signal?: AbortSignal,
  ): Promise<ApiResponse<AudioChapter>> {
    // Before 2.1.0 the third argument was the signal; keep accepting it there.
    let params: AudioChapterGetParams | undefined;
    if (isAbortSignal(paramsOrSignal)) {
      signal = paramsOrSignal;
    } else {
      params = paramsOrSignal;
    }
    return this.fetcher.get(
      `/audio-bibles/${encodeURIComponent(audioBibleId)}/chapters/${encodeURIComponent(chapterId)}`,
      getChapterResponseSchema,
      params ? audioChapterGetToQuery(params) : undefined,
      signal,
    );
  }
}

// `instanceof` alone misses signals from another realm (iframes, jsdom vs Node
// globals), so fall back to the shape a params object can never have.
function isAbortSignal(value: unknown): value is AbortSignal {
  if (value === undefined || value === null || typeof value !== 'object') return false;
  if (typeof AbortSignal !== 'undefined' && value instanceof AbortSignal) return true;
  return typeof (value as AbortSignal).aborted === 'boolean'
    && typeof (value as AbortSignal).addEventListener === 'function';
}
