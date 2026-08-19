import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, Bible, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useBible } from '../src/use-bible.js';

const BIBLE_ID = 'bba9f40183526463-01';

const mockBible: Bible = {
  id: BIBLE_ID,
  abbreviation: 'BSB',
  name: 'Berean Standard Bible',
  type: 'text',
  updatedAt: '2023-01-01T00:00:00.000Z',
  language: { id: 'eng', name: 'English' },
  countries: [{ id: 'US', name: 'United States' }],
  audioBibles: [],
};

const okResponse: ApiResponse<Bible> = { data: mockBible, meta: {} };

// The fake client only needs `bibles.get`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(get: unknown): BibleClient {
  return { bibles: { get } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useBible', () => {
  it('transitions loading -> data and forwards the abort signal', async () => {
    const get = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useBible(BIBLE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockBible);
    expect(result.current.error).toBeUndefined();
    expect(get).toHaveBeenCalledWith(BIBLE_ID, expect.any(AbortSignal));
  });

  it('stays idle and issues no request when bibleId is empty', () => {
    const get = vi.fn();
    const { result } = renderHook(() => useBible(''), {
      wrapper: wrapperFor(makeClient(get)),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const get = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useBible(BIBLE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const get = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useBible(BIBLE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockBible));
    expect(get).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual(mockBible);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
