import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, SectionSummary, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useSectionsForBook } from '../src/use-sections-for-book.js';

const BIBLE_ID = 'bba9f40183526463-01';
const BOOK_ID = 'GEN';

const mockSection: SectionSummary = {
  id: 'GEN.intro',
  bibleId: BIBLE_ID,
  bookId: BOOK_ID,
  title: 'The Creation of the World',
};

const okResponse: ApiResponse<SectionSummary[]> = { data: [mockSection], meta: {} };

// The fake client only needs `sections.listForBook`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(listForBook: unknown): BibleClient {
  return { sections: { listForBook } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useSectionsForBook', () => {
  it('transitions loading -> data and forwards both ids + the abort signal', async () => {
    const listForBook = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useSectionsForBook(BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(listForBook)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([mockSection]);
    expect(result.current.error).toBeUndefined();
    expect(listForBook).toHaveBeenCalledWith(BIBLE_ID, BOOK_ID, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const listForBook = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useSectionsForBook(BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(listForBook)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when either id is empty', () => {
    const listForBook = vi.fn();

    const noBible = renderHook(() => useSectionsForBook('', BOOK_ID), {
      wrapper: wrapperFor(makeClient(listForBook)),
    });
    expect(noBible.result.current.isLoading).toBe(false);

    const noBook = renderHook(() => useSectionsForBook(BIBLE_ID, ''), {
      wrapper: wrapperFor(makeClient(listForBook)),
    });
    expect(noBook.result.current.isLoading).toBe(false);

    expect(listForBook).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const listForBook = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useSectionsForBook(BIBLE_ID, BOOK_ID), {
      wrapper: wrapperFor(makeClient(listForBook)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockSection]));
    expect(listForBook).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual([mockSection]);
    await waitFor(() => expect(listForBook).toHaveBeenCalledTimes(2));
  });
});
