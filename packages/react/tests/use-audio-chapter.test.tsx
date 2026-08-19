import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, AudioChapter, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useAudioChapter } from '../src/use-audio-chapter.js';

const AUDIO_BIBLE_ID = '32333e5d5d63e60c-01';
const CHAPTER_ID = 'GEN.1';

const mockAudioChapter: AudioChapter = {
  id: CHAPTER_ID,
  bibleId: AUDIO_BIBLE_ID,
  number: '1',
  bookId: 'GEN',
  reference: 'Genesis 1',
  resourceUrl: 'https://audio.example/GEN.1.mp3?sig=abc',
  expiresAt: 1893456000,
};

const okResponse: ApiResponse<AudioChapter> = { data: mockAudioChapter, meta: {} };

// The fake client only needs `audioBibles.getChapter`; the whole object is cast
// to BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(getChapter: unknown): BibleClient {
  return { audioBibles: { getChapter } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useAudioChapter', () => {
  it('transitions loading -> data and forwards both ids + the abort signal', async () => {
    const getChapter = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioChapter(AUDIO_BIBLE_ID, CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(getChapter)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockAudioChapter);
    expect(result.current.error).toBeUndefined();
    expect(getChapter).toHaveBeenCalledWith(AUDIO_BIBLE_ID, CHAPTER_ID, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const getChapter = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useAudioChapter(AUDIO_BIBLE_ID, CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(getChapter)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when either id is empty', () => {
    const getChapter = vi.fn();

    const noBible = renderHook(() => useAudioChapter('', CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(getChapter)),
    });
    expect(noBible.result.current.isLoading).toBe(false);

    const noChapter = renderHook(() => useAudioChapter(AUDIO_BIBLE_ID, ''), {
      wrapper: wrapperFor(makeClient(getChapter)),
    });
    expect(noChapter.result.current.isLoading).toBe(false);

    expect(getChapter).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const getChapter = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioChapter(AUDIO_BIBLE_ID, CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(getChapter)),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockAudioChapter));
    expect(getChapter).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual(mockAudioChapter);
    await waitFor(() => expect(getChapter).toHaveBeenCalledTimes(2));
  });
});
