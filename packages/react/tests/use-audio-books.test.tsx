import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, AudioBookSummary, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useAudioBooks } from '../src/use-audio-books.js';

const AUDIO_BIBLE_ID = '32333e5d5d63e60c-01';

const mockAudioBook: AudioBookSummary = {
  id: 'GEN',
  bibleId: AUDIO_BIBLE_ID,
  abbreviation: 'Gen',
  name: 'Genesis',
};

const okResponse: ApiResponse<AudioBookSummary[]> = { data: [mockAudioBook], meta: {} };

// The fake client only needs `audioBibles.listBooks`; the whole object is cast
// to BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(listBooks: unknown): BibleClient {
  return { audioBibles: { listBooks } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useAudioBooks', () => {
  it('transitions loading -> data and forwards params + the abort signal', async () => {
    const listBooks = vi.fn().mockResolvedValue(okResponse);
    const params = { includeChapters: true } as const;
    const { result } = renderHook(() => useAudioBooks(AUDIO_BIBLE_ID, params), {
      wrapper: wrapperFor(makeClient(listBooks)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([mockAudioBook]);
    expect(result.current.error).toBeUndefined();
    // Params object is passed straight through to the client method.
    expect(listBooks).toHaveBeenCalledWith(AUDIO_BIBLE_ID, params, expect.any(AbortSignal));
  });

  it('works without params (undefined forwarded)', async () => {
    const listBooks = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioBooks(AUDIO_BIBLE_ID), {
      wrapper: wrapperFor(makeClient(listBooks)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockAudioBook]));
    expect(listBooks).toHaveBeenCalledWith(AUDIO_BIBLE_ID, undefined, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const listBooks = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useAudioBooks(AUDIO_BIBLE_ID), {
      wrapper: wrapperFor(makeClient(listBooks)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when audioBibleId is empty', () => {
    const listBooks = vi.fn();
    const { result } = renderHook(() => useAudioBooks(''), {
      wrapper: wrapperFor(makeClient(listBooks)),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(listBooks).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const listBooks = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioBooks(AUDIO_BIBLE_ID), {
      wrapper: wrapperFor(makeClient(listBooks)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockAudioBook]));
    expect(listBooks).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual([mockAudioBook]);
    await waitFor(() => expect(listBooks).toHaveBeenCalledTimes(2));
  });
});
