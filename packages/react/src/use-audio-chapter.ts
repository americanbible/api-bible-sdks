import type { AudioChapter, AudioChapterGetParams } from '@americanbible/api-bible-sdk';
import { stableStringify } from './stable-stringify.js';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch a single audio chapter, including its presigned `resourceUrl`.
 *
 * Thin by design: maps 1:1 to `client.audioBibles.getChapter`, forwards the
 * abort signal, and passes the `{ data, meta }` envelope through so
 * `meta.fumsToken` (report it with `trackListen`) reaches the caller. All
 * lifecycle/state lives in {@link useAsyncResource} — the single-`get`
 * counterpart to {@link useAudioChapters}.
 *
 * The returned `resourceUrl` is presigned and expires at `expiresAt` (epoch
 * seconds); call `refetch()` to obtain a fresh URL.
 *
 * Pass `{ includeTimecodes: true }` to request verse-level `timecodes`; they are
 * returned only when requested and api.bible has them for the chapter.
 *
 * @param audioBibleId  Audio Bible ID. When falsy the hook stays idle (no request).
 * @param chapterId     Audio chapter ID (e.g. 'GEN.1'). When falsy the hook stays idle.
 * @param params        Optional `includeTimecodes` flag.
 */
export function useAudioChapter(
  audioBibleId: string,
  chapterId: string,
  params?: AudioChapterGetParams,
): AsyncResource<AudioChapter> {
  return useAsyncResource<AudioChapter>(
    (client, signal) =>
      // Without params, use the 3-argument form: core 2.0.x reads the third
      // argument as the signal, so this keeps cancellation working there.
      params
        ? client.audioBibles.getChapter(audioBibleId, chapterId, params, signal)
        : client.audioBibles.getChapter(audioBibleId, chapterId, signal),
    // stableStringify turns a possibly-new-every-render params object into a
    // stable, key-order-independent string, so callers needn't memoize.
    [audioBibleId, chapterId, stableStringify(params ?? {})],
    {
      enabled: Boolean(audioBibleId && chapterId),
      resourceKey: 'audioBibles.getChapter',
      exposeMeta: true,
    },
  );
}
