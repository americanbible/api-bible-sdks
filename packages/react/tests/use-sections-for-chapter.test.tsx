import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, SectionSummary, BibleClient } from '@americanbible/api-bible-sdk';
import { NotFoundError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useSectionsForChapter } from '../src/use-sections-for-chapter.js';

const BIBLE_ID = 'bba9f40183526463-01';
const CHAPTER_ID = 'GEN.1';

const mockSection: SectionSummary = {
  id: 'GEN.1.1',
  bibleId: BIBLE_ID,
  bookId: 'GEN',
  chapterId: CHAPTER_ID,
  title: 'The Creation of the World',
};

const okResponse: ApiResponse<SectionSummary[]> = { data: [mockSection], meta: {} };

// The fake client only needs `sections.listForChapter`; the whole object is cast
// to BibleClient so tests exercise the hook wiring without any HTTP.
function makeClient(listForChapter: unknown): BibleClient {
  return { sections: { listForChapter } } as unknown as BibleClient;
}

function wrapperFor(client: BibleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
  );
}

describe('useSectionsForChapter', () => {
  it('transitions loading -> data and forwards both ids + the abort signal', async () => {
    const listForChapter = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useSectionsForChapter(BIBLE_ID, CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(listForChapter)),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([mockSection]);
    expect(result.current.error).toBeUndefined();
    expect(listForChapter).toHaveBeenCalledWith(BIBLE_ID, CHAPTER_ID, expect.any(AbortSignal));
  });

  it('surfaces a NotFoundError in `error`', async () => {
    const listForChapter = vi.fn().mockRejectedValue(new NotFoundError('Resource not found', 404, ''));
    const { result } = renderHook(() => useSectionsForChapter(BIBLE_ID, CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(listForChapter)),
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NotFoundError));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('stays idle and issues no request when either id is empty', () => {
    const listForChapter = vi.fn();

    const noBible = renderHook(() => useSectionsForChapter('', CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(listForChapter)),
    });
    expect(noBible.result.current.isLoading).toBe(false);

    const noChapter = renderHook(() => useSectionsForChapter(BIBLE_ID, ''), {
      wrapper: wrapperFor(makeClient(listForChapter)),
    });
    expect(noChapter.result.current.isLoading).toBe(false);

    expect(listForChapter).not.toHaveBeenCalled();
  });

  it('refetch re-runs the request and keeps prior data while loading', async () => {
    const listForChapter = vi.fn().mockResolvedValue(okResponse);
    const { result } = renderHook(() => useSectionsForChapter(BIBLE_ID, CHAPTER_ID), {
      wrapper: wrapperFor(makeClient(listForChapter)),
    });

    await waitFor(() => expect(result.current.data).toEqual([mockSection]));
    expect(listForChapter).toHaveBeenCalledTimes(1);

    act(() => result.current.refetch());

    // Prior data stays visible during the refetch.
    expect(result.current.data).toEqual([mockSection]);
    await waitFor(() => expect(listForChapter).toHaveBeenCalledTimes(2));
  });
});
