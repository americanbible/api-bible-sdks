import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, AudioBookSummary, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useAudioBook } from '../src/use-audio-book.js';

const AUDIO_BIBLE_ID = '32333e5d5d63e60c-01';
const BOOK_ID = 'GEN';

const mockAudioBook: AudioBookSummary = {
  id: BOOK_ID,
  bibleId: AUDIO_BIBLE_ID,
  abbreviation: 'Gen',
  name: 'Genesis',
};

const okResponse: ApiResponse<AudioBookSummary> = { data: mockAudioBook, meta: {} };

// The fake client only needs `audioBibles.getBook`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(getBook: unknown): BibleClient {
  return { audioBibles: { getBook } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useAudioBook', () => {
  it('transitions loading -> data and forwards params + the abort signal', async () => {
    const getBook = vi.fn().mockResolvedValue(okResponse);
    const params = { includeChapters: true } as const;
    const { result } = renderHook(() => useAudioBook(AUDIO_BIBLE_ID, BOOK_ID, params), {
      wrapper: wrapperFor(makeClient(getBook)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockAudioBook);
    expect(result.current.error).toBeUndefined();
    // Params object is passed straight through to the client method.
    expect(getBook).toHaveBeenCalledWith(AUDIO_BIBLE_ID, BOOK_ID, params, expect.any(AbortSignal));
  });

  it('works without params (undefined forwarded)', async () => {
    const getBook = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioBook(AUDIO_BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(getBook)),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockAudioBook));
    expect(getBook).toHaveBeenCalledWith(AUDIO_BIBLE_ID, BOOK_ID, undefined, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const getBook = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useAudioBook(AUDIO_BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(getBook)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when either id is empty', () => {
    const getBook = vi.fn();

    const noBible = renderHook(() => useAudioBook('', BOOK_ID), {
      wrapper: wrapperFor(makeClient(getBook)),
    });
    expect(noBible.result.current.isLoading).toBe(false);

    const noBook = renderHook(() => useAudioBook(AUDIO_BIBLE_ID, ''), {
      wrapper: wrapperFor(makeClient(getBook)),
    });
    expect(noBook.result.current.isLoading).toBe(false);

    expect(getBook).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const getBook = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioBook(AUDIO_BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(getBook)),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockAudioBook));
    expect(getBook).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual(mockAudioBook);
    await waitFor(() => expect(getBook).toHaveBeenCalledTimes(2));
  });
});
