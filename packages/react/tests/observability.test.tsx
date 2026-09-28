import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { BibleError, type BibleClient, type BibleClientConfig } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useBooks } from '../src/use-books.js';
import type { SettledObserver } from '../src/types.js';

// Mock ONLY the core client factory so we can assert exactly what config the
// provider forwards to it — the observability seam (onResponse / onRetry) plus
// the transport config. Every other core export the provider touches stays real.
// The generic `vi.fn<[config], client>` types the call so toHaveBeenCalledWith
// accepts a config matcher without an unused parameter.
const createBibleClient = vi.hoisted(() =>
  vi.fn<[BibleClientConfig], BibleClient>(
    () => ({ books: { list: vi.fn() } }) as unknown as BibleClient,
  ),
);

vi.mock('@americanbible/api-bible-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@americanbible/api-bible-sdk')>();
  return { ...actual, createBibleClient };
});

describe('provider forwards observability + transport config to the core client', () => {
  it('passes onResponse / onRetry (and retry / timeout) through unchanged', () => {
    const onResponse = vi.fn();
    const onRetry = vi.fn();

    render(
      <ApiBibleProvider
        config={{
          apiKey: 'test-key',
          baseUrl: 'https://x.example/api',
          onResponse,
          onRetry,
          timeout: 5000,
          retry: { maxAttempts: 4 },
        }}
      >
        <div />
      </ApiBibleProvider>,
    );

    expect(createBibleClient).toHaveBeenCalledTimes(1);
    expect(createBibleClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        // Same references — the React layer neither wraps nor intercepts them, so
        // the telemetry callbacks fire exactly as the core documents.
        onResponse,
        onRetry,
        timeout: 5000,
        retry: { maxAttempts: 4 },
      }),
    );
  });

  it('still forwards observers in proxy mode (apiKey omitted -> sentinel injected)', () => {
    createBibleClient.mockClear();
    const onResponse = vi.fn();

    render(
      <ApiBibleProvider config={{ baseUrl: 'https://proxy.example/api', onResponse }}>
        <div />
      </ApiBibleProvider>,
    );

    // The observer rides along with the injected non-secret proxy sentinel key.
    expect(createBibleClient).toHaveBeenCalledWith(
      expect.objectContaining({ onResponse, apiKey: 'proxy' }),
    );
  });
});

describe('onSettled: one telemetry event per network request', () => {
  const BIBLE_ID = 'bba9f40183526463-01';

  // A books.list whose (latest) promise the test settles by hand.
  function deferredClient() {
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const list = vi.fn(
      () =>
        new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        }),
    );
    const client = { books: { list } } as unknown as BibleClient;
    return { client, list, resolve: (v: unknown) => resolve(v), reject: (e: unknown) => reject(e) };
  }

  function wrapperWith(client: BibleClient, onSettled: SettledObserver) {
    return ({ children }: { children: ReactNode }) => (
      <ApiBibleProvider client={client} onSettled={onSettled}>
        {children}
      </ApiBibleProvider>
    );
  }

  it('reports once for components sharing a de-duplicated request, with no ids or params', async () => {
    const { client, list, resolve } = deferredClient();
    const onSettled = vi.fn<Parameters<SettledObserver>, void>();
    const { result } = renderHook(() => [useBooks(BIBLE_ID), useBooks(BIBLE_ID)], {
      wrapper: wrapperWith(client, onSettled),
    });

    await act(async () => resolve({ data: [] }));
    await waitFor(() => expect(result.current[1]!.status).toBe('success'));

    expect(list).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
    const event = onSettled.mock.calls[0]![0];
    expect(Object.keys(event).sort()).toEqual(['durationMs', 'outcome', 'resourceKey']);
    expect(event).toMatchObject({ resourceKey: 'books.list', outcome: 'success' });
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a failure with the typed error', async () => {
    const { client, reject } = deferredClient();
    const onSettled = vi.fn<Parameters<SettledObserver>, void>();
    const { result } = renderHook(() => useBooks(BIBLE_ID), { wrapper: wrapperWith(client, onSettled) });

    await act(async () => reject(new Error('boom')));
    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(onSettled).toHaveBeenCalledTimes(1);
    const event = onSettled.mock.calls[0]![0];
    expect(event.outcome).toBe('error');
    expect(event.error).toBeInstanceOf(BibleError);
  });

  it('does not report a request cancelled by unmount', async () => {
    const { client, resolve } = deferredClient();
    const onSettled = vi.fn<Parameters<SettledObserver>, void>();
    const { unmount } = renderHook(() => useBooks(BIBLE_ID), { wrapper: wrapperWith(client, onSettled) });

    unmount();
    await act(async () => resolve({ data: [] }));

    expect(onSettled).not.toHaveBeenCalled();
  });

  it('keeps the hook working when the observer throws', async () => {
    const { client, resolve } = deferredClient();
    const onSettled = vi.fn(() => {
      throw new Error('telemetry down');
    });
    const { result } = renderHook(() => useBooks(BIBLE_ID), { wrapper: wrapperWith(client, onSettled) });

    await act(async () => resolve({ data: [] }));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('uses the latest onSettled prop without remounting the provider', async () => {
    const { client, list, resolve } = deferredClient();
    const first = vi.fn<Parameters<SettledObserver>, void>();
    const second = vi.fn<Parameters<SettledObserver>, void>();
    function Books() {
      useBooks(BIBLE_ID);
      return null;
    }
    const { rerender } = render(
      <ApiBibleProvider client={client} onSettled={first}>
        <Books />
      </ApiBibleProvider>,
    );
    rerender(
      <ApiBibleProvider client={client} onSettled={second}>
        <Books />
      </ApiBibleProvider>,
    );

    await act(async () => resolve({ data: [] }));

    expect(list).toHaveBeenCalledTimes(1); // same request — nothing remounted or refetched
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
