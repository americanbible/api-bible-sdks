import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, Bible, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useBibles } from '../src/use-bibles.js';

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

const okResponse: ApiResponse<Bible[]> = { data: [mockBible], meta: {} };

// The fake client only needs `bibles.list`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(list: unknown): BibleClient {
  return { bibles: { list } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useBibles', () => {
  it('transitions loading -> data and forwards params + the abort signal', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const params = { language: 'eng' } as const;
    const { result } = renderHook(() => useBibles(params), {
      wrapper: wrapperFor(makeClient(list)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([mockBible]);
    expect(result.current.error).toBeUndefined();
    // Params object is passed straight through to the client method.
    expect(list).toHaveBeenCalledWith(params, expect.any(AbortSignal));
  });

  it('works without params (undefined forwarded)', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useBibles(), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockBible]));
    expect(list).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const list = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useBibles(), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useBibles(), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockBible]));
    expect(list).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual([mockBible]);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
