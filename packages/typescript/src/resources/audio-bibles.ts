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

/**
 * Handle for `/audio-bibles` endpoints. Returned as `client.audioBibles` from
 * {@link createBibleClient}. Audio chapters carry a presigned `resourceUrl`
 * (with `expiresAt`); verse-level `timecodes` are included only when api.bible
 * has them for that chapter (not a request option). Fetch the URL directly to
 * stream the audio.
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
   * Fetch an audio chapter, including the presigned `resourceUrl`. `timecodes`
   * are returned only when api.bible has timecode data for the chapter, so the
   * field may be absent. The URL expires at `expiresAt` (epoch seconds) —
   * refetch the chapter to get a new URL.
   *
   * @param audioBibleId  Audio Bible ID.
   * @param chapterId     Audio chapter ID (e.g. `'GEN.1'`).
   * @param signal        Optional AbortSignal.
   * @throws {NotFoundError} if the chapter does not exist.
   * @example
   *   const { data } = await client.audioBibles.getChapter(audioBibleId, 'GEN.1');
   *   const audio = await fetch(data.resourceUrl);
   */
  getChapter(audioBibleId: string, chapterId: string, signal?: AbortSignal): Promise<ApiResponse<AudioChapter>> {
    return this.fetcher.get(
      `/audio-bibles/${encodeURIComponent(audioBibleId)}/chapters/${encodeURIComponent(chapterId)}`,
      getChapterResponseSchema,
      undefined,
      signal,
    );
  }
}
