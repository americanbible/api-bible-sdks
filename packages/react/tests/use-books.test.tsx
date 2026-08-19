import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, Book, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError, RateLimitError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useBooks } from '../src/use-books.js';

const BIBLE_ID = 'bba9f40183526463-01';

const mockBook: Book = {
  id: 'GEN',
  bibleId: BIBLE_ID,
  abbreviation: 'Gen',
  name: 'Genesis',
  nameLong: 'The First Book of Moses, called Genesis',
};

const okResponse: ApiResponse<Book[]> = { data: [mockBook], meta: {} };

// The fake client only needs `books.list`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(list: unknown): BibleClient {
  return { books: { list } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useBooks', () => {
  it('transitions loading -> data and forwards the abort signal', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useBooks(BIBLE_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([mockBook]);
    expect(result.current.error).toBeUndefined();
    expect(list).toHaveBeenCalledWith(BIBLE_ID, undefined, expect.any(AbortSignal));
  });

  it('walks the full status / isFetching lifecycle through the hook', async () => {
    const controls: Array<{
      resolve: (v: ApiResponse<Book[]>) => void;
      reject: (e: unknown) => void;
    }> = [];
    const list = vi.fn(
      () => new Promise<ApiResponse<Book[]>>((resolve, reject) => controls.push({ resolve, reject })),
    );
    const { result } = renderHook(() => useBooks(BIBLE_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    // First load — no data yet: status 'loading', both flags true.
    expect(result.current.status).toBe('loading');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);

    // Resolved — status 'success', both flags false, data present.
    act(() => controls[0].resolve(okResponse));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toEqual([mockBook]);

    // Refetch — a *background* fetch: isFetching true, but isLoading stays false
    // (data already on screen) so a spinner won't flash over existing content.
    act(() => result.current.refetch());
    expect(result.current.status).toBe('loading');
    expect(result.current.isFetching).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual([mockBook]);

    // Refetch fails — status 'error', flags cleared, last-good data retained.
    act(() => controls[1].reject(new NotFoundError('gone', 404, '')));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.isFetching).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual([mockBook]);
    expect(result.current.error).toBeInstanceOf(NotFoundError);
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const list = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useBooks(BIBLE_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('preserves a non-NotFound typed error (RateLimitError) through the hook', async () => {
    const err = new RateLimitError('rate limited', 429, '');
    const list = vi.fn().mockRejectedValue(err);
    const { result } = renderHook(() => useBooks(BIBLE_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    // The concrete subclass survives the React layer — not flattened to BibleError.
    await waitFor(() => expect(result.current.error).toBeInstanceOf(RateLimitError));
    expect(result.current.error).toBe(err);
    expect(result.current.data).toBeUndefined();
  });

  it('de-dupes callers that pass the same params in a different key order', () => {
    const list = vi.fn(() => new Promise<never>(() => {})); // pending; we only count calls
    const wrapper = wrapperFor(makeClient(list));

    // Same values, opposite key order. The dedup key is built with stableStringify,
    // so both must collapse to a single in-flight request (plain JSON.stringify
    // would hash them differently and fire twice).
    renderHook(
      () => useBooks(BIBLE_ID, { includeChapters: true, includeChaptersAndSections: false }),
      { wrapper },
    );
    renderHook(
      () => useBooks(BIBLE_ID, { includeChaptersAndSections: false, includeChapters: true }),
      { wrapper },
    );

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('stays idle and issues no request when bibleId is empty', () => {
    const list = vi.fn();
    const { result } = renderHook(() => useBooks(''), {
      wrapper: wrapperFor(makeClient(list)),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(list).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useBooks(BIBLE_ID), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockBook]));
    expect(list).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual([mockBook]);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
