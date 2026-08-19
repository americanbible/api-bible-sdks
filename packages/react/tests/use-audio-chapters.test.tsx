import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, AudioChapterSummary, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useAudioChapters } from '../src/use-audio-chapters.js';

const AUDIO_BIBLE_ID = '32333e5d5d63e60c-01';
const BOOK_ID = 'GEN';

const mockAudioChapter: AudioChapterSummary = {
  id: 'GEN.1',
  bibleId: AUDIO_BIBLE_ID,
  number: '1',
  bookId: BOOK_ID,
  reference: 'Genesis 1',
};

const okResponse: ApiResponse<AudioChapterSummary[]> = { data: [mockAudioChapter], meta: {} };

// The fake client only needs `audioBibles.listChapters`; the whole object is
// cast to BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(listChapters: unknown): BibleClient {
  return { audioBibles: { listChapters } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useAudioChapters', () => {
  it('transitions loading -> data and forwards both ids + the abort signal', async () => {
    const listChapters = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioChapters(AUDIO_BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(listChapters)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([mockAudioChapter]);
    expect(result.current.error).toBeUndefined();
    expect(listChapters).toHaveBeenCalledWith(AUDIO_BIBLE_ID, BOOK_ID, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const listChapters = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useAudioChapters(AUDIO_BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(listChapters)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when either id is empty', () => {
    const listChapters = vi.fn();

    const noBible = renderHook(() => useAudioChapters('', BOOK_ID), {
      wrapper: wrapperFor(makeClient(listChapters)),
    });
    expect(noBible.result.current.isLoading).toBe(false);

    const noBook = renderHook(() => useAudioChapters(AUDIO_BIBLE_ID, ''), {
      wrapper: wrapperFor(makeClient(listChapters)),
    });
    expect(noBook.result.current.isLoading).toBe(false);

    expect(listChapters).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const listChapters = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioChapters(AUDIO_BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(listChapters)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockAudioChapter]));
    expect(listChapters).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual([mockAudioChapter]);
    await waitFor(() => expect(listChapters).toHaveBeenCalledTimes(2));
  });
});
