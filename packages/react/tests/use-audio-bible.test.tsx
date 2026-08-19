import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, AudioBible, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useAudioBible } from '../src/use-audio-bible.js';

const AUDIO_BIBLE_ID = '32333e5d5d63e60c-01';

const mockAudioBible: AudioBible = {
  id: AUDIO_BIBLE_ID,
  abbreviation: 'WEB',
  language: { id: 'eng', name: 'English' },
  countries: [{ id: 'US', name: 'United States' }],
  name: 'World English Bible',
  type: 'audio',
  updatedAt: '2023-01-01T00:00:00.000Z',
  copyright: 'Public Domain',
  info: 'An audio edition.',
};

const okResponse: ApiResponse<AudioBible> = { data: mockAudioBible, meta: {} };

// The fake client only needs `audioBibles.get`; the whole object is cast to
// BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(get: unknown): BibleClient {
  return { audioBibles: { get } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useAudioBible', () => {
  it('transitions loading -> data and forwards the abort signal', async () => {
    const get = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioBible(AUDIO_BIBLE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual(mockAudioBible);
    expect(result.current.error).toBeUndefined();
    expect(get).toHaveBeenCalledWith(AUDIO_BIBLE_ID, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const get = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useAudioBible(AUDIO_BIBLE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when audioBibleId is empty', () => {
    const get = vi.fn();
    const { result } = renderHook(() => useAudioBible(''), {
      wrapper: wrapperFor(makeClient(get)),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const get = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useAudioBible(AUDIO_BIBLE_ID), {
      wrapper: wrapperFor(makeClient(get)),
    });

    await waitFor(() => expect(result.current.data).toEqual(mockAudioBible));
    expect(get).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual(mockAudioBible);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
