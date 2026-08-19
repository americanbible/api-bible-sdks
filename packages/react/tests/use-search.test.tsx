import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, SearchResult, SearchParams, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useSearch } from '../src/use-search.js';

const BIBLE_ID = 'bba9f40183526463-01';

const mockResult: SearchResult = {
  query: 'faith',
  limit: 10,
  offset: 0,
  total: 1,
  verseCount: 1,
  verses: [
    {
      id: 'JHN.3.16',
      orgId: 'JHN.3.16',
      bibleId: BIBLE_ID,
      bookId: 'JHN',
      chapterId: 'JHN.3',
      reference: 'John 3:16',
      text: 'For God so loved the world…',
    },
  ],
};

const okResponse: ApiResponse<SearchResult> = { data: mockResult, meta: {} };

// The fake client only needs `search.search`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(search: unknown): BibleClient {
  return { search: { search } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useSearch', () => {
  it('transitions loading -> data and forwards params + the abort signal', async () => {
    const search = vi.fn().mockResolvedValue(okResponse);
    const params = { query: 'faith', limit: 10 } as const;
    const { result } = renderHook(() => useSearch(BIBLE_ID, params), {
      wrapper: wrapperFor(makeClient(search)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockResult);
    expect(result.current.error).toBeUndefined();
    // Params object is passed straight through to the client method.
    expect(search).toHaveBeenCalledWith(BIBLE_ID, params, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const search = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useSearch(BIBLE_ID, { query: 'faith' }), {
      wrapper: wrapperFor(makeClient(search)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when bibleId or query is empty/blank', () => {
    const search = vi.fn();

    // Missing bibleId.
    const noBible = renderHook(() => useSearch('', { query: 'faith' }), {
      wrapper: wrapperFor(makeClient(search)),
    });
    expect(noBible.result.current.isLoading).toBe(false);

    // Empty query.
    const noQuery = renderHook(() => useSearch(BIBLE_ID, { query: '' }), {
      wrapper: wrapperFor(makeClient(search)),
    });
    expect(noQuery.result.current.isLoading).toBe(false);

    // Whitespace-only query — the `.trim()` guard treats it as empty.
    const blankQuery = renderHook(() => useSearch(BIBLE_ID, { query: '   ' }), {
      wrapper: wrapperFor(makeClient(search)),
    });
    expect(blankQuery.result.current.isLoading).toBe(false);

    expect(search).not.toHaveBeenCalled();
  });

  it('stays idle without crashing when a JS caller omits query', () => {
    const search = vi.fn();
    // Simulate a JS caller bypassing the types: params with no `query` at all.
    const { result } = renderHook(() => useSearch(BIBLE_ID, {} as unknown as SearchParams), {
      wrapper: wrapperFor(makeClient(search)),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const search = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useSearch(BIBLE_ID, { query: 'faith' }), {
      wrapper: wrapperFor(makeClient(search)),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockResult));
    expect(search).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual(mockResult);
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it('debounces search-as-you-type into a single request for the final query', () => {
    vi.useFakeTimers();
    try {
      const search = vi.fn(() => new Promise(() => {})); // pending; count calls only
      const wrapper = wrapperFor(makeClient(search));
      const { rerender } = renderHook(
        ({ q }) => useSearch(BIBLE_ID, { query: q }, { debounceMs: 300 }),
        { wrapper, initialProps: { q: 'f' } },
      );

      rerender({ q: 'fa' });
      act(() => vi.advanceTimersByTime(200));
      rerender({ q: 'fai' });
      act(() => vi.advanceTimersByTime(200));
      rerender({ q: 'faith' });
      expect(search).not.toHaveBeenCalled(); // still typing, within the window

      act(() => vi.advanceTimersByTime(300));
      expect(search).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledWith(BIBLE_ID, { query: 'faith' }, expect.any(AbortSignal));
    } finally {
      vi.useRealTimers();
    }
  });
});
