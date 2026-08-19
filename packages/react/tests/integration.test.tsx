import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { ValidationError } from '@americanbible/api-bible-sdk';
import { ApiBibleProvider } from '../src/provider.js';
import { useBooks } from '../src/use-books.js';

// End-to-end smoke tier. The per-hook tests mock the BibleClient; these instead
// drive a hook through a REAL client built by the provider, stubbing only the
// network `fetch`. That exercises the full path the client-level mocks skip:
// provider -> useAsyncResource -> real Fetcher (retry/backoff) -> Zod validation
// -> unwrapped, typed data.

const BIBLE_ID = 'bba9f40183526463-01';
const book = {
  id: 'GEN',
  bibleId: BIBLE_ID,
  abbreviation: 'Gen',
  name: 'Genesis',
  nameLong: 'The First Book of Moses, called Genesis',
};
const OK_BOOKS_BODY = JSON.stringify({ data: [book] });

// Minimal stand-in for a fetch Response: no `body` stream, so the Fetcher's
// readBody falls back to text(); headers.get answers content-type as JSON and
// null otherwise (no content-length / retry-after).
function jsonResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

const fetchMock = vi.fn<Parameters<typeof fetch>, Promise<Response>>();

function realClientWrapper() {
  return ({ children }: { children: ReactNode }) => (
    <ApiBibleProvider
      config={{
        apiKey: 'test-key',
        baseUrl: 'https://api.example/v1',
        fetch: fetchMock,
        // Deterministic, instant retries — no real backoff sleep in tests.
        retry: { jitter: () => 0 },
      }}
    >
      {children}
    </ApiBibleProvider>
  );
}

describe('end-to-end: hook through a real client (fetch stubbed)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('validates and unwraps a real API response into typed data', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, OK_BOOKS_BODY));

    const { result } = renderHook(() => useBooks(BIBLE_ID), { wrapper: realClientWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([book]);
    expect(result.current.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 with backoff and then succeeds (reactive rate-limit handling)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, '{"error":"rate limited"}'))
      .mockResolvedValueOnce(jsonResponse(200, OK_BOOKS_BODY));

    const { result } = renderHook(() => useBooks(BIBLE_ID), { wrapper: realClientWrapper() });

    await waitFor(() => expect(result.current.data).toEqual([book]));
    // Two attempts: the 429, then the successful retry — proving the core's retry
    // loop runs end-to-end through the React layer.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces a malformed response as ValidationError (real Zod failure)', async () => {
    // `data` should be an array of books; a bare string fails schema validation.
    fetchMock.mockResolvedValue(jsonResponse(200, '{"data":"not-an-array"}'));

    const { result } = renderHook(() => useBooks(BIBLE_ID), { wrapper: realClientWrapper() });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(ValidationError));
    expect(result.current.data).toBeUndefined();
  });
});
