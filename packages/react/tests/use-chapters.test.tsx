import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, ChapterSummary, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useChapters } from '../src/use-chapters.js';

const BIBLE_ID = 'bba9f40183526463-01';
const BOOK_ID = 'GEN';

const mockChapter: ChapterSummary = {
  id: 'GEN.1',
  bibleId: BIBLE_ID,
  bookId: BOOK_ID,
  number: '1',
};

const okResponse: ApiResponse<ChapterSummary[]> = { data: [mockChapter], meta: {} };

// The fake client only needs `chapters.list`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(list: unknown): BibleClient {
  return { chapters: { list } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useChapters', () => {
  it('transitions loading -> data and forwards both ids + the abort signal', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useChapters(BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([mockChapter]);
    expect(result.current.error).toBeUndefined();
    expect(list).toHaveBeenCalledWith(BIBLE_ID, BOOK_ID, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const list = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useChapters(BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when either id is empty', () => {
    const list = vi.fn();

    const noBible = renderHook(() => useChapters('', BOOK_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });
    expect(noBible.result.current.isLoading).toBe(false);

    const noBook = renderHook(() => useChapters(BIBLE_ID, ''), {
      wrapper: wrapperFor(makeClient(list)),
    });
    expect(noBook.result.current.isLoading).toBe(false);

    expect(list).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useChapters(BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockChapter]));
    expect(list).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual([mockChapter]);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
