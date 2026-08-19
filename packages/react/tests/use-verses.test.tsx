import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, VerseSummary, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useVerses } from '../src/use-verses.js';

const BIBLE_ID = 'bba9f40183526463-01';
const CHAPTER_ID = 'GEN.1';

const mockVerse: VerseSummary = {
  id: 'GEN.1.1',
  bibleId: BIBLE_ID,
  bookId: 'GEN',
  chapterId: CHAPTER_ID,
  reference: 'Genesis 1:1',
};

const okResponse: ApiResponse<VerseSummary[]> = { data: [mockVerse], meta: {} };

// The fake client only needs `verses.list`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(list: unknown): BibleClient {
  return { verses: { list } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useVerses', () => {
  it('transitions loading -> data and forwards both ids + the abort signal', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useVerses(BIBLE_ID, CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([mockVerse]);
    expect(result.current.error).toBeUndefined();
    expect(list).toHaveBeenCalledWith(BIBLE_ID, CHAPTER_ID, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const list = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useVerses(BIBLE_ID, CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when either id is empty', () => {
    const list = vi.fn();

    const noBible = renderHook(() => useVerses('', CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });
    expect(noBible.result.current.isLoading).toBe(false);

    const noChapter = renderHook(() => useVerses(BIBLE_ID, ''), {
      wrapper: wrapperFor(makeClient(list)),
    });
    expect(noChapter.result.current.isLoading).toBe(false);

    expect(list).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useVerses(BIBLE_ID, CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockVerse]));
    expect(list).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual([mockVerse]);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
