import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, Passage, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { usePassages } from '../src/use-passages.js';

const BIBLE_ID = 'bba9f40183526463-01';
const PASSAGE_ID = 'JHN.3.16-JHN.3.17';

const mockPassage: Passage = {
  id: PASSAGE_ID,
  bibleId: BIBLE_ID,
  reference: 'John 3:16-17',
  content: '<p>For God so loved the world…</p>',
};

const okResponse: ApiResponse<Passage> = { data: mockPassage, meta: {} };

// The fake client only needs `passages.get`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(get: unknown): BibleClient {
  return { passages: { get } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('usePassages', () => {
  it('transitions loading -> data and forwards params + the abort signal', async () => {
    const get = vi.fn().mockResolvedValue(okResponse);
    const params = { contentType: 'html' } as const;
    const { result } = renderHook(() => usePassages(BIBLE_ID, PASSAGE_ID, params), {
      wrapper: wrapperFor(makeClient(get)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockPassage);
    expect(result.current.error).toBeUndefined();
    // Params object is passed straight through to the client method.
    expect(get).toHaveBeenCalledWith(BIBLE_ID, PASSAGE_ID, params, expect.any(AbortSignal));
  });

  it('works without params (undefined forwarded)', async () => {
    const get = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => usePassages(BIBLE_ID, PASSAGE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockPassage));
    expect(get).toHaveBeenCalledWith(BIBLE_ID, PASSAGE_ID, undefined, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const get = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => usePassages(BIBLE_ID, PASSAGE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when either id is empty', () => {
    const get = vi.fn();

    const noBible = renderHook(() => usePassages('', PASSAGE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });
    expect(noBible.result.current.isLoading).toBe(false);

    const noPassage = renderHook(() => usePassages(BIBLE_ID, ''), {
      wrapper: wrapperFor(makeClient(get)),
    });
    expect(noPassage.result.current.isLoading).toBe(false);

    expect(get).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const get = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => usePassages(BIBLE_ID, PASSAGE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockPassage));
    expect(get).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual(mockPassage);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
