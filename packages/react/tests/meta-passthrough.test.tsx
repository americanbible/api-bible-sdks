import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BibleClient } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import type { AsyncResource } from '../src/types.js';
import {
  useAudioBible,
  useAudioBibles,
  useAudioBook,
  useAudioBooks,
  useAudioChapter,
  useAudioChapters,
  useBible,
  useBibles,
  useBooks,
  useChapter,
  useChapters,
  usePassages,
  useSearch,
  useSection,
  useSectionsForBook,
  useSectionsForChapter,
  useVerse,
  useVerses,
} from '../src/index.js';

// Every hook gets a response carrying a FUMS token. The content hooks must hand
// it to the caller; every other hook must drop it. Guards against a content hook
// picking up a pattern that silently loses `meta` while its own tests stay green.

const response = { data: { id: 'x' }, meta: { fumsToken: 'tok-1' } };

interface Case {
  name: string;
  resource: keyof BibleClient;
  method: string;
  render: () => AsyncResource<unknown>;
}

const contentHooks: Case[] = [
  { name: 'useVerse', resource: 'verses', method: 'get', render: () => useVerse('b', 'JHN.3.16') },
  { name: 'useChapter', resource: 'chapters', method: 'get', render: () => useChapter('b', 'JHN.3') },
  { name: 'usePassages', resource: 'passages', method: 'get', render: () => usePassages('b', 'JHN.3.16-JHN.3.17') },
  { name: 'useSection', resource: 'sections', method: 'get', render: () => useSection('b', 'JHN.S1') },
  { name: 'useSearch', resource: 'search', method: 'search', render: () => useSearch('b', { query: 'faith' }) },
  { name: 'useAudioChapter', resource: 'audioBibles', method: 'getChapter', render: () => useAudioChapter('a', 'GEN.1') },
];

const otherHooks: Case[] = [
  { name: 'useBibles', resource: 'bibles', method: 'list', render: () => useBibles() },
  { name: 'useBible', resource: 'bibles', method: 'get', render: () => useBible('b') },
  { name: 'useBooks', resource: 'books', method: 'list', render: () => useBooks('b') },
  { name: 'useChapters', resource: 'chapters', method: 'list', render: () => useChapters('b', 'JHN') },
  { name: 'useVerses', resource: 'verses', method: 'list', render: () => useVerses('b', 'JHN.3') },
  { name: 'useSectionsForBook', resource: 'sections', method: 'listForBook', render: () => useSectionsForBook('b', 'JHN') },
  { name: 'useSectionsForChapter', resource: 'sections', method: 'listForChapter', render: () => useSectionsForChapter('b', 'JHN.3') },
  { name: 'useAudioBibles', resource: 'audioBibles', method: 'list', render: () => useAudioBibles() },
  { name: 'useAudioBible', resource: 'audioBibles', method: 'get', render: () => useAudioBible('a') },
  { name: 'useAudioBooks', resource: 'audioBibles', method: 'listBooks', render: () => useAudioBooks('a') },
  { name: 'useAudioBook', resource: 'audioBibles', method: 'getBook', render: () => useAudioBook('a', 'GEN') },
  { name: 'useAudioChapters', resource: 'audioBibles', method: 'listChapters', render: () => useAudioChapters('a', 'GEN') },
];

function wrapperFor({ resource, method }: Case, fn: unknown) {
  const client = { [resource]: { [method]: fn } } as unknown as BibleClient;
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('meta pass-through', () => {
  it.each(contentHooks)('$name returns the response meta', async (c) => {
    const fn = vi.fn().mockResolvedValue(response);
    const { result } = renderHook(c.render, { wrapper: wrapperFor(c, fn) });
    await waitFor(() => expect(result.current.data).toEqual(response.data));
    expect(result.current.meta).toEqual({ fumsToken: 'tok-1' });
  });

  it.each(otherHooks)('$name leaves meta undefined', async (c) => {
    const fn = vi.fn().mockResolvedValue(response);
    const { result } = renderHook(c.render, { wrapper: wrapperFor(c, fn) });
    await waitFor(() => expect(result.current.data).toEqual(response.data));
    expect(result.current.meta).toBeUndefined();
  });

  it('useSearch resets meta as soon as the query changes, under debounceMs', async () => {
    vi.useFakeTimers();
    try {
      const search = vi.fn(() => Promise.resolve(response));
      const c = contentHooks.find((h) => h.name === 'useSearch')!;
      const { result, rerender } = renderHook(
        ({ q }) => useSearch('b', { query: q }, { debounceMs: 300 }),
        { wrapper: wrapperFor(c, search), initialProps: { q: 'faith' } },
      );
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(result.current.meta).toEqual({ fumsToken: 'tok-1' });

      rerender({ q: 'hope' });
      expect(search).toHaveBeenCalledTimes(1); // 'hope' still within the window
      expect(result.current).toMatchObject({ status: 'loading', data: undefined, meta: undefined });
    } finally {
      vi.useRealTimers();
    }
  });
});
