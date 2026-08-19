import type { AudioChapter } from '@americanbible/api-bible-sdk';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * Fetch a single audio chapter, including its presigned `resourceUrl`.
 *
 * Thin by design: maps 1:1 to `client.audioBibles.getChapter`, forwards the
 * abort signal, and unwraps the `{ data }` envelope. All lifecycle/state lives
 * in {@link useAsyncResource} — the single-`get` counterpart to
 * {@link useAudioChapters}.
 *
 * The returned `resourceUrl` is presigned and expires at `expiresAt` (epoch
 * seconds); call `refetch()` to obtain a fresh URL.
 *
 * @param audioBibleId  Audio Bible ID. When falsy the hook stays idle (no request).
 * @param chapterId     Audio chapter ID (e.g. 'GEN.1'). When falsy the hook stays idle.
 */
export function useAudioChapter(
  audioBibleId: string,
  chapterId: string,
): AsyncResource<AudioChapter> {
  return useAsyncResource<AudioChapter>(
    (client, signal) => client.audioBibles.getChapter(audioBibleId, chapterId, signal).then((res) => res.data),
    // Two required ids and no params object, so the raw ids are a stable dep
    // key on their own — no JSON.stringify needed (unlike params-bearing hooks).
    [audioBibleId, chapterId],
    { enabled: Boolean(audioBibleId && chapterId), resourceKey: 'audioBibles.getChapter' },
  );
}
