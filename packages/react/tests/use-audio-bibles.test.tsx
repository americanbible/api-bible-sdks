import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, AudioBibleSummary, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useAudioBibles } from '../src/use-audio-bibles.js';

const AUDIO_BIBLE_ID = '32333e5d5d63e60c-01';

const mockAudioBible: AudioBibleSummary = {
  id: AUDIO_BIBLE_ID,
  abbreviation: 'WEB',
  language: { id: 'eng', name: 'English' },
  countries: [{ id: 'US', name: 'United States' }],
  name: 'World English Bible',
  type: 'audio',
  updatedAt: '2023-01-01T00:00:00.000Z',
};

const okResponse: ApiResponse<AudioBibleSummary[]> = { data: [mockAudioBible], meta: {} };

// The fake client only needs `audioBibles.list`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(list: unknown): BibleClient {
  return { audioBibles: { list } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useAudioBibles', () => {
  it('transitions loading -> data and forwards params + the abort signal', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const params = { language: 'eng' } as const;
    const { result } = renderHook(() => useAudioBibles(params), {
      wrapper: wrapperFor(makeClient(list)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([mockAudioBible]);
    expect(result.current.error).toBeUndefined();
    // Params object is passed straight through to the client method.
    expect(list).toHaveBeenCalledWith(params, expect.any(AbortSignal));
  });

  it('works without params (undefined forwarded)', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioBibles(), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockAudioBible]));
    expect(list).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const list = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useAudioBibles(), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const list = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioBibles(), {
      wrapper: wrapperFor(makeClient(list)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockAudioBible]));
    expect(list).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual([mockAudioBible]);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
