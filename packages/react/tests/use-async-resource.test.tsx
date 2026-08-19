import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  AuthError,
  BadRequestError,
  BibleError,
  InvalidInputError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
  type BibleClient,
} from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useAsyncResource } from '../src/use-async-resource.js';

const client = { books: { list: vi.fn() } } as unknown as BibleClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <ApiBibleProvider client={client}>{children}</ApiBibleProvider>
);

describe('useAsyncResource', () => {
  it('aborts the in-flight request when the component unmounts', () => {
    let signal: AbortSignal | undefined;
    const run = vi.fn<[BibleClient, AbortSignal], Promise<number>>((_client, s) => {
      signal = s;
      return new Promise<number>(() => {}); // never settles
    });

    const { unmount } = renderHook(() => useAsyncResource(run, ['k']), { wrapper });
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('aborts the previous request when deps change', () => {
    const signals: AbortSignal[] = [];
    const run = vi.fn<[BibleClient, AbortSignal], Promise<number>>((_client, s) => {
      signals.push(s);
      return new Promise<number>(() => {});
    });

    const { rerender } = renderHook(({ k }) => useAsyncResource(run, [k]), {
      wrapper,
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });

    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true); // superseded
    expect(signals[1].aborted).toBe(false); // current
  });

  it('ignores a stale result that resolves after deps changed', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(
      () => new Promise<string>((resolve) => resolvers.push(resolve)),
    );

    const { result, rerender } = renderHook(({ k }) => useAsyncResource(run, [k]), {
      wrapper,
      initialProps: { k: 'a' },
    });
    rerender({ k: 'b' });

    // Resolve the current (second) request first.
    act(() => resolvers[1]('B'));
    await waitFor(() => expect(result.current.data).toBe('B'));

    // Now resolve the stale (first) request — it must NOT clobber 'B'.
    act(() => resolvers[0]('A'));
    await Promise.resolve();
    expect(result.current.data).toBe('B');
  });

  it('turns a synchronous SDK throw into error state', async () => {
    const boom = new NotFoundError('boom', 404, '');
    const run = vi.fn<[BibleClient, AbortSignal], Promise<number>>(() => {
      throw boom;
    });

    const { result } = renderHook(() => useAsyncResource<number>(run, ['k']), { wrapper });

    await waitFor(() => expect(result.current.error).toBe(boom));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('wraps a non-SDK throw as a BibleError', async () => {
    const run = vi.fn<[BibleClient, AbortSignal], Promise<number>>(() => {
      throw new TypeError('kaboom');
    });

    const { result } = renderHook(() => useAsyncResource<number>(run, ['k']), { wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(BibleError));
    expect(result.current.error?.message).toContain('kaboom');
  });

  it('distinguishes first load (isLoading) from a background refetch (isFetching)', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(
      () => new Promise<string>((resolve) => resolvers.push(resolve)),
    );

    const { result } = renderHook(() => useAsyncResource(run, ['k']), { wrapper });

    // First load — no data yet: both flags true.
    expect(result.current.status).toBe('loading');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);

    act(() => resolvers[0]('A'));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBe('A');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);

    // Refetch — data is retained, so this is a *background* fetch: isFetching
    // only, never isLoading (so a spinner won't flash over existing content).
    act(() => result.current.refetch());
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBe('A');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(true);

    act(() => resolvers[1]('B'));
    await waitFor(() => expect(result.current.data).toBe('B'));
    expect(result.current.status).toBe('success');
    expect(result.current.isFetching).toBe(false);
  });

  it('reports idle status and issues no request when disabled', () => {
    const run = vi.fn<[BibleClient, AbortSignal], Promise<number>>(() => Promise.resolve(1));

    const { result } = renderHook(() => useAsyncResource<number>(run, ['k'], { enabled: false }), {
      wrapper,
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('does not cause an extra render while staying disabled across dep changes', () => {
    let renders = 0;
    const run = vi.fn<[BibleClient, AbortSignal], Promise<number>>(() => Promise.resolve(1));

    const { rerender } = renderHook(
      ({ k }) => {
        renders++;
        return useAsyncResource<number>(run, [k], { enabled: false });
      },
      { wrapper, initialProps: { k: 'a' } },
    );

    const before = renders;
    rerender({ k: 'b' }); // deps change, but the hook stays disabled
    // Exactly one render — the rerender itself. Without the idle bail-out, the
    // disabled branch's setState(new idle object) would force a second render.
    expect(renders - before).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });

  it('sets status to error when the request rejects', async () => {
    const run = vi.fn<[BibleClient, AbortSignal], Promise<number>>(() =>
      Promise.reject(new NotFoundError('nope', 404, '')),
    );

    const { result } = renderHook(() => useAsyncResource<number>(run, ['k']), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });

  it('keeps last-good data when a refetch fails, then recovers on the next success', async () => {
    const controls: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];
    const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(
      () => new Promise<string>((resolve, reject) => controls.push({ resolve, reject })),
    );

    const { result } = renderHook(() => useAsyncResource(run, ['k']), { wrapper });

    // Initial load succeeds.
    act(() => controls[0].resolve('A'));
    await waitFor(() => expect(result.current.data).toBe('A'));

    // Refetch fails: 'A' must remain visible, error surfaced alongside it.
    act(() => result.current.refetch());
    act(() => controls[1].reject(new NotFoundError('gone', 404, '')));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBe('A'); // retained through the failure
    expect(result.current.error).toBeInstanceOf(NotFoundError);

    // Refetch again succeeds: data updates and the error clears.
    act(() => result.current.refetch());
    act(() => controls[2].resolve('B'));
    await waitFor(() => expect(result.current.data).toBe('B'));
    expect(result.current.status).toBe('success');
    expect(result.current.error).toBeUndefined();
  });
});

describe('useAsyncResource de-duplication', () => {
  it('shares one in-flight request across identical resourceKey + deps', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(
      () => new Promise<string>((resolve) => resolvers.push(resolve)),
    );

    const a = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });
    const b = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });

    // Two subscribers, one underlying call.
    expect(run).toHaveBeenCalledTimes(1);

    act(() => resolvers[0]('shared'));
    await waitFor(() => expect(a.result.current.data).toBe('shared'));
    await waitFor(() => expect(b.result.current.data).toBe('shared'));
  });

  it('does not share across different resourceKeys with identical deps', () => {
    const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(() => new Promise<string>(() => {}));

    // Same deps `['k']`, different operations — as useVerses vs useSectionsForChapter
    // would collide on `[bibleId, chapterId]`. Must stay two separate requests.
    renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'verses.list' }), { wrapper });
    renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'sections.listForChapter' }), {
      wrapper,
    });

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('keeps the shared request alive until the last subscriber unmounts', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const signals: AbortSignal[] = [];
    const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>((_c, s) => {
      signals.push(s);
      return new Promise<string>((resolve) => resolvers.push(resolve));
    });

    const a = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });
    const b = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });
    expect(run).toHaveBeenCalledTimes(1);

    a.unmount(); // one leaves — the shared fetch must NOT be aborted
    expect(signals[0].aborted).toBe(false);

    act(() => resolvers[0]('shared'));
    await waitFor(() => expect(b.result.current.data).toBe('shared'));
  });

  it('aborts the shared request only once the last subscriber unmounts', () => {
    const signals: AbortSignal[] = [];
    const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>((_c, s) => {
      signals.push(s);
      return new Promise<string>(() => {}); // never settles
    });

    const a = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });
    const b = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });
    expect(run).toHaveBeenCalledTimes(1);

    a.unmount();
    expect(signals[0].aborted).toBe(false); // b still needs it
    b.unmount();
    expect(signals[0].aborted).toBe(true); // nobody left → cancel
  });

  it('refetch() forces a fresh request instead of rejoining a shared in-flight one', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(
      () => new Promise<string>((resolve) => resolvers.push(resolve)),
    );

    // Two subscribers share ONE in-flight request.
    const a = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });
    const b = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });
    expect(run).toHaveBeenCalledTimes(1);

    // While that shared request is still in flight, `a` refetches. It must NOT
    // rejoin the shared promise (which would make refetch a no-op) — a new call fires.
    act(() => a.result.current.refetch());
    expect(run).toHaveBeenCalledTimes(2);

    // The forced request resolves independently of the still-pending shared one.
    act(() => resolvers[1]('fresh'));
    await waitFor(() => expect(a.result.current.data).toBe('fresh'));

    b.unmount();
  });

  it('issues a fresh request after the shared one settles (in-flight only, no cache)', async () => {
    const resolvers: Array<(v: string) => void> = [];
    const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(
      () => new Promise<string>((resolve) => resolvers.push(resolve)),
    );

    const a = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });
    act(() => resolvers[0]('one'));
    await waitFor(() => expect(a.result.current.data).toBe('one'));
    a.unmount();

    // The entry is evicted on settle, so a later mount fetches again.
    const b = renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op' }), { wrapper });
    expect(run).toHaveBeenCalledTimes(2);
    act(() => resolvers[1]('two'));
    await waitFor(() => expect(b.result.current.data).toBe('two'));
  });
});

describe('useAsyncResource debounce', () => {
  it('collapses a burst of dep changes into one request after the delay', () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(
        () => new Promise<string>(() => {}), // pending; we only count calls
      );

      const { rerender } = renderHook(
        ({ k }) => useAsyncResource(run, [k], { resourceKey: 'op', debounceMs: 100 }),
        { wrapper, initialProps: { k: 'a' } },
      );

      expect(run).not.toHaveBeenCalled(); // still within the debounce window

      rerender({ k: 'b' });
      act(() => vi.advanceTimersByTime(50));
      rerender({ k: 'c' });
      act(() => vi.advanceTimersByTime(50));
      expect(run).not.toHaveBeenCalled(); // each change reset the 100ms timer

      act(() => vi.advanceTimersByTime(100));
      expect(run).toHaveBeenCalledTimes(1); // only the final value fires
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fire until the debounce delay elapses', () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(() => new Promise<string>(() => {}));

      renderHook(() => useAsyncResource(run, ['k'], { resourceKey: 'op', debounceMs: 100 }), { wrapper });

      act(() => vi.advanceTimersByTime(99));
      expect(run).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending debounced request on unmount', () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn<[BibleClient, AbortSignal], Promise<string>>(() => new Promise<string>(() => {}));

      const { unmount } = renderHook(
        () => useAsyncResource(run, ['k'], { resourceKey: 'op', debounceMs: 100 }),
        { wrapper },
      );

      act(() => vi.advanceTimersByTime(50));
      unmount();
      act(() => vi.advanceTimersByTime(100));
      expect(run).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useAsyncResource typed-error preservation', () => {
  // Every SDK error extends BibleError, so the hook must surface the *concrete*
  // subclass by reference — consumers branch on `instanceof RateLimitError` (etc.).
  // Proving it for one subtype (NotFoundError) leaves the contract untested for the
  // rest; cover the whole hierarchy, both rejection paths.
  type ErrCtor = new (...args: never[]) => BibleError;
  const TYPED_ERRORS: Array<{ name: string; error: BibleError; type: ErrCtor }> = [
    { name: 'AuthError', error: new AuthError('unauthorized', 401, ''), type: AuthError },
    { name: 'BadRequestError', error: new BadRequestError('bad request', 400, ''), type: BadRequestError },
    { name: 'RateLimitError', error: new RateLimitError('rate limited', 429, ''), type: RateLimitError },
    { name: 'ServerError', error: new ServerError('server error', 503, ''), type: ServerError },
    { name: 'NetworkError', error: new NetworkError('network down'), type: NetworkError },
    { name: 'ValidationError', error: new ValidationError('invalid response', []), type: ValidationError },
    { name: 'InvalidInputError', error: new InvalidInputError('invalid input'), type: InvalidInputError },
  ];

  it.each(TYPED_ERRORS)(
    'surfaces a rejected $name unchanged (concrete type + identity)',
    async ({ error, type }) => {
      const run = vi.fn<[BibleClient, AbortSignal], Promise<number>>(() => Promise.reject(error));
      const { result } = renderHook(() => useAsyncResource<number>(run, ['k']), { wrapper });

      await waitFor(() => expect(result.current.status).toBe('error'));
      expect(result.current.error).toBe(error); // same instance — never re-wrapped
      expect(result.current.error).toBeInstanceOf(type); // concrete subclass preserved
      expect(result.current.error).toBeInstanceOf(BibleError); // and the shared root
    },
  );

  it('preserves a synchronously thrown InvalidInputError (eager arg validation)', async () => {
    const error = new InvalidInputError('bad argument');
    const run = vi.fn<[BibleClient, AbortSignal], Promise<number>>(() => {
      throw error;
    });
    const { result } = renderHook(() => useAsyncResource<number>(run, ['k']), { wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(InvalidInputError));
    expect(result.current.error).toBe(error);
  });
});
