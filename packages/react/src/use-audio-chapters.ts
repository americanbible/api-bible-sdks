import type { AudioChapterSummary } from '@americanbible/api-bible-sdk';
import { useAsyncResource } from './use-async-resource.js';
import type { AsyncResource } from './types.js';

/**
 * List the audio chapter summaries within a book of an audio Bible.
 *
 * Thin by design: maps 1:1 to `client.audioBibles.listChapters`, forwards the
 * abort signal, and unwraps the `{ data }` envelope. All lifecycle/state lives
 * in {@link useAsyncResource} — this mirrors the `useChapters` template.
 *
 * @param audioBibleId  Audio Bible ID. When falsy the hook stays idle (no request).
 * @param bookId        Book ID (e.g. 'GEN'). When falsy the hook stays idle.
 */
export function useAudioChapters(
  audioBibleId: string,
  bookId: string,
): AsyncResource<AudioChapterSummary[]> {
  return useAsyncResource<AudioChapterSummary[]>(
    (client, signal) => client.audioBibles.listChapters(audioBibleId, bookId, signal).then((res) => res.data),
    // Two required ids and no params object, so the raw ids are a stable dep
    // key on their own — no JSON.stringify needed (unlike params-bearing hooks).
    [audioBibleId, bookId],
    { enabled: Boolean(audioBibleId && bookId), resourceKey: 'audioBibles.listChapters' },
  );
}
