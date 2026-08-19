import { describe, it, expect, vi } from 'vitest';
import { StrictMode, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import type { ApiResponse, Book, BibleClient } from '@americanbible/api-bible-sdk';
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

function makeClient(list: unknown): BibleClient {
  return { books: { list } } as unknown as BibleClient;
}

describe('StrictMode', () => {
  it('settles to a single correct result under the mount→unmount→mount double-invoke', async () => {
    // StrictMode (dev) may run each effect twice on mount: setup → cleanup → setup.
    // Capture every request's signal so we can prove any superseded request was
    // cancelled and only the live one produces the result — no torn state.
    const signals: AbortSignal[] = [];
    const list = vi.fn((_bibleId: string, _params: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve(okResponse);
    });

    const { result } = renderHook(() => useBooks(BIBLE_ID), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>
          <ApiBibleProvider client={makeClient(list)}>{children}</ApiBibleProvider>
        </StrictMode>
      ),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual([mockBook]);
    expect(result.current.error).toBeUndefined();
    expect(result.current.isFetching).toBe(false);

    // Whether StrictMode fires a second request is React-version/harness specific
    // (React 18 double-invokes here; React 19 in this harness does not). What must
    // hold either way: a request was issued, every *superseded* one was aborted,
    // and the final live one is not aborted.
    expect(list).toHaveBeenCalled();
    for (const superseded of signals.slice(0, -1)) expect(superseded.aborted).toBe(true);
    expect(signals.at(-1)!.aborted).toBe(false);
  });
});

describe('server rendering (SSR)', () => {
  function Books(): ReactNode {
    const { status } = useBooks(BIBLE_ID);
    return <span>{status}</span>;
  }

  it('renders provider + hook to a string without throwing, fetching, or warning', () => {
    const list = vi.fn();
    // Fail loudly if React emits any console error/warning during server render
    // (e.g. a client-only-API warning) — a v1 SDK must be safe to SSR.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const html = renderToString(
        <ApiBibleProvider client={makeClient(list)}>
          <Books />
        </ApiBibleProvider>,
      );

      // Effects don't run on the server: no request is issued, and the hook emits
      // its initial synchronous state ('loading', since bibleId is present).
      expect(html).toContain('loading');
      expect(list).not.toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
