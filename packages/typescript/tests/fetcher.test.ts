import { describe, it, expect, vi } from 'vitest';
import { Fetcher, DEFAULT_USER_AGENT, nextRetryDelay, type RetryMeta } from '../src/http/fetcher.js';
import { SDK_VERSION } from '../src/version.js';
import {
  ApiError,
  AuthError,
  BadRequestError,
  InvalidInputError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '../src/http/errors.js';
import { apiResponseSchema } from '../src/schemas/common.js';
import { z } from 'zod';

// Minimal schema used across tests.
const DataSchema = z.object({ id: z.string() });
const TestSchema = apiResponseSchema(DataSchema);

function mockResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// makeFetcher injects a mock fetch and sets zero-delay retries so tests run instantly.
function makeFetcher(fetchFn: typeof globalThis.fetch): Fetcher {
  return new Fetcher({
    baseUrl: 'https://rest.api.bible/v1',
    apiKey: 'test-key',
    fetch: fetchFn,
    retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
  });
}

// Reads a request header by name from a mock fetch call. Wraps the init's
// headers in a fresh `Headers` so assertions are case-insensitive and resilient
// to whatever concrete `HeadersInit` shape the Fetcher uses internally.
function getRequestHeader(
  fetchFn: ReturnType<typeof vi.fn>,
  name: string,
  callIndex = 0,
): string | null {
  const init = fetchFn.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  if (!init?.headers) return null;
  return new Headers(init.headers as HeadersInit).get(name);
}

const SUCCESS_BODY = { data: { id: 'abc' }, meta: {} };

describe('Fetcher', () => {
  describe('request construction', () => {
    it('sends the api-key header on every request', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      await makeFetcher(fetchFn as unknown as typeof fetch).get('/test', TestSchema);
      expect(getRequestHeader(fetchFn, 'api-key')).toBe('test-key');
    });

    it('sends a default User-Agent header identifying the SDK and version', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      await makeFetcher(fetchFn as unknown as typeof fetch).get('/test', TestSchema);
      expect(getRequestHeader(fetchFn, 'User-Agent')).toBe(DEFAULT_USER_AGENT);
      // Sanity check: the constant is sourced from SDK_VERSION.
      expect(DEFAULT_USER_AGENT).toBe(`api-bible-sdk-js/${SDK_VERSION}`);
    });

    it('sends a default Accept: application/json header', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      await makeFetcher(fetchFn as unknown as typeof fetch).get('/test', TestSchema);
      expect(getRequestHeader(fetchFn, 'Accept')).toBe('application/json');
    });

    it('lets a caller-supplied Accept override the default', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        headers: { 'Accept': 'application/vnd.api+json' },
      });
      await fetcher.get('/test', TestSchema);
      expect(getRequestHeader(fetchFn, 'Accept')).toBe('application/vnd.api+json');
    });

    it('merges caller-supplied headers with the defaults', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        headers: { 'X-Request-ID': 'req-123' },
      });
      await fetcher.get('/test', TestSchema);
      expect(getRequestHeader(fetchFn, 'X-Request-ID')).toBe('req-123');
      expect(getRequestHeader(fetchFn, 'User-Agent')).toBe(DEFAULT_USER_AGENT);
      expect(getRequestHeader(fetchFn, 'api-key')).toBe('test-key');
    });

    it('lets a caller-supplied User-Agent override the default', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        headers: { 'User-Agent': 'my-wrapper/2.0' },
      });
      await fetcher.get('/test', TestSchema);
      expect(getRequestHeader(fetchFn, 'User-Agent')).toBe('my-wrapper/2.0');
    });

    it('does not let caller-supplied headers override the api-key', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'real-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        headers: { 'api-key': 'attacker-key' },
      });
      await fetcher.get('/test', TestSchema);
      expect(getRequestHeader(fetchFn, 'api-key')).toBe('real-key');
    });

    it('does not let caller-supplied mixed-case API-Key override the api-key', async () => {
      // Regression: HTTP header names are case-insensitive. A plain-object
      // header merge treats 'API-Key' and 'api-key' as distinct keys, so a
      // caller could previously slip an attacker-controlled value past the
      // last-wins override. With `Headers` internally, both casings normalize
      // and the real key always wins.
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'real-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        headers: { 'API-Key': 'attacker-key', 'Api-Key': 'attacker-key-2' },
      });
      await fetcher.get('/test', TestSchema);
      // Case-insensitive lookup — only one effective api-key value, the real one.
      expect(getRequestHeader(fetchFn, 'api-key')).toBe('real-key');
      expect(getRequestHeader(fetchFn, 'API-Key')).toBe('real-key');
      expect(getRequestHeader(fetchFn, 'Api-Key')).toBe('real-key');
    });

    it('canonicalizes mixed-case caller headers (no duplicate entries on the wire)', async () => {
      // A caller passing 'user-agent' (lowercase) must replace the default
      // 'User-Agent' rather than ship both as duplicate header entries.
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        headers: { 'user-agent': 'wrap/1' },
      });
      await fetcher.get('/test', TestSchema);
      expect(getRequestHeader(fetchFn, 'user-agent')).toBe('wrap/1');
      expect(getRequestHeader(fetchFn, 'User-Agent')).toBe('wrap/1');
    });

    it('appends query params to the URL', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      await makeFetcher(fetchFn as unknown as typeof fetch).get('/test', TestSchema, {
        'include-chapters': 'true',
      });
      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain('include-chapters=true');
    });

    it('throws if path does not start with /', async () => {
      const fetchFn = vi.fn();
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      await expect(fetcher.get('no-slash', TestSchema)).rejects.toThrow("path must start with '/'");
    });
  });

  describe('error mapping', () => {
    it.each([
      [400, BadRequestError],
      [401, AuthError],
      [403, AuthError],
      [404, NotFoundError],
      [429, RateLimitError],
      [500, ServerError],
      [503, ServerError],
    ])('maps HTTP %i to %s', async (status, ErrorClass) => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(status, { message: 'err' }));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(ErrorClass);
    });

    it('maps unexpected 4xx to base ApiError (not ServerError)', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(405, { message: 'Method Not Allowed' }));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).not.toBeInstanceOf(ServerError);
    });

    it('includes statusCode and raw body on errors', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(404, { message: 'Not found' }));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as NotFoundError;
      expect(err.statusCode).toBe(404);
      expect(err.body).toContain('Not found');
    });

    it('throws ValidationError when response is not valid JSON', async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('not json'),
      } as unknown as Response);
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ApiError (not ValidationError) on a 2xx with a non-JSON Content-Type', async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        text: () => Promise.resolve('<!DOCTYPE html><html>blocked</html>'),
      } as unknown as Response);
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err).not.toBeInstanceOf(ValidationError);
      expect(err.statusCode).toBe(200);
      expect(err.body).toContain('<!DOCTYPE html>');
      expect(err.message).toContain('text/html');
    });

    it('forwards JSON.parse SyntaxError as ValidationError.cause', async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{ malformed'),
      } as unknown as Response);
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ValidationError;
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.cause).toBeInstanceOf(SyntaxError);
    });

    it('accepts +json suffix content types (e.g. application/vnd.api+json)', async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/vnd.api+json' }),
        text: () => Promise.resolve(JSON.stringify(SUCCESS_BODY)),
      } as unknown as Response);
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const result = await fetcher.get('/test', TestSchema);
      expect(result.data.id).toBe('abc');
    });

    it('throws ValidationError when response shape does not match schema', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { wrong: 'shape' }));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ValidationError;
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.issues.length).toBeGreaterThan(0);
    });

    it('throws ApiError (not ValidationError) on a 2xx with empty body', async () => {
      // CDN stale-while-revalidate, captive portal, or misconfigured proxy can
      // return 2xx with an empty body. Surface as ApiError so consumers can
      // distinguish "server gave us nothing" from "server gave us malformed JSON."
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve(''),
      } as unknown as Response);
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err).not.toBeInstanceOf(ValidationError);
      expect(err.statusCode).toBe(200);
      expect(err.message).toContain('empty body');
    });

    it('throws ApiError on a 2xx with empty body even when Content-Type is application/json', async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(''),
      } as unknown as Response);
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err).not.toBeInstanceOf(ValidationError);
      expect(err.message).toContain('empty body');
    });
  });

  describe('error message extraction (toTypedError)', () => {
    function rawResponse(status: number, body: string): Response {
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(),
        text: () => Promise.resolve(body),
      } as unknown as Response;
    }

    it('uses the server-provided message when body is { message }', async () => {
      const fetchFn = vi.fn().mockResolvedValue(rawResponse(404, JSON.stringify({ message: 'Bible not found' })));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as NotFoundError;
      expect(err.message).toBe('Bible not found');
    });

    it('uses the nested message when body is { error: { message } }', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        rawResponse(400, JSON.stringify({ error: { message: 'Invalid parameter' } })),
      );
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as BadRequestError;
      expect(err.message).toBe('Invalid parameter');
    });

    it('falls back to "HTTP <status>" when body is the JSON literal null', async () => {
      // Regression: previously `parsed.message` threw on null and was silently swallowed.
      const fetchFn = vi.fn().mockResolvedValue(rawResponse(500, 'null'));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ServerError;
      expect(err.message).toBe('HTTP 500');
      expect(err.body).toBe('null');
    });

    it('falls back to "HTTP <status>" when body is a JSON array', async () => {
      const fetchFn = vi.fn().mockResolvedValue(rawResponse(400, '[]'));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as BadRequestError;
      expect(err.message).toBe('HTTP 400');
    });

    it('falls back to "HTTP <status>" when body is a JSON primitive (string/number)', async () => {
      const fetchFn = vi.fn().mockResolvedValue(rawResponse(404, '"some string"'));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as NotFoundError;
      expect(err.message).toBe('HTTP 404');
    });

    it('falls back to "HTTP <status>" when body is not JSON at all', async () => {
      const fetchFn = vi.fn().mockResolvedValue(rawResponse(503, 'Service Unavailable'));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ServerError;
      expect(err.message).toBe('HTTP 503');
      expect(err.body).toBe('Service Unavailable');
    });

    it('falls back to "HTTP <status>" when message field is empty string', async () => {
      const fetchFn = vi.fn().mockResolvedValue(rawResponse(404, JSON.stringify({ message: '' })));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as NotFoundError;
      expect(err.message).toBe('HTTP 404');
    });
  });

  describe('response body size cap', () => {
    // Builds a Response whose body is a real ReadableStream (no Content-Length),
    // exercising the streaming read path that runs by default under undici.
    function streamResponse(chunks: string[], headers: Record<string, string> = {}): Response {
      const enc = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const c of chunks) controller.enqueue(enc.encode(c));
          controller.close();
        },
      });
      return {
        ok: true,
        status: 200,
        headers: new Headers(headers),
        body: stream,
        text: () => Promise.resolve(chunks.join('')),
      } as unknown as Response;
    }

    function makeCappedFetcher(fetchFn: typeof globalThis.fetch, maxResponseBytes: number): Fetcher {
      return new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        maxResponseBytes,
      });
    }

    it('rejects (without buffering) when Content-Length exceeds the cap', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        mockResponse(200, SUCCESS_BODY, { 'content-length': '5000' }),
      );
      const fetcher = makeCappedFetcher(fetchFn as unknown as typeof fetch, 100);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err).not.toBeInstanceOf(ValidationError);
      expect(err.message).toContain('exceeded');
      // Terminal, not retried.
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('rejects via the text() fallback when no stream and body exceeds the cap', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = makeCappedFetcher(fetchFn as unknown as typeof fetch, 5);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toContain('exceeded');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('rejects a chunked (no Content-Length) body that exceeds the cap mid-stream', async () => {
      const fetchFn = vi.fn().mockResolvedValue(streamResponse(['aaaa', 'bbbb', 'cccc']));
      const fetcher = makeCappedFetcher(fetchFn as unknown as typeof fetch, 6);
      const err = await fetcher.get('/test', TestSchema).catch(e => e) as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toContain('exceeded');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('reads and parses a streamed body that is under the cap (default undici path)', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        streamResponse([JSON.stringify(SUCCESS_BODY)], { 'content-type': 'application/json' }),
      );
      const fetcher = makeCappedFetcher(fetchFn as unknown as typeof fetch, 1_000);
      const result = await fetcher.get('/test', TestSchema);
      expect(result.data.id).toBe('abc');
    });

    it('reassembles multibyte characters split across stream chunks', async () => {
      // '€' is 3 UTF-8 bytes (E2 82 AC); split it across two chunks to prove the
      // decoder joins bytes rather than decoding each chunk independently.
      const enc = new TextEncoder();
      const full = enc.encode(JSON.stringify({ data: { id: '€' }, meta: {} }));
      const splitAt = full.indexOf(0x82); // middle byte of the euro sign
      const chunkResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(full.slice(0, splitAt));
            controller.enqueue(full.slice(splitAt));
            controller.close();
          },
        }),
      } as unknown as Response;
      const fetchFn = vi.fn().mockResolvedValue(chunkResponse);
      const fetcher = makeCappedFetcher(fetchFn as unknown as typeof fetch, 1_000);
      const result = await fetcher.get('/test', TestSchema);
      expect(result.data.id).toBe('€');
    });
  });

  describe('retry logic', () => {
    it('retries on 429 and succeeds on the third attempt', async () => {
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, {}))
        .mockResolvedValueOnce(mockResponse(429, {}))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const result = await fetcher.get('/test', TestSchema);
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(result.data.id).toBe('abc');
    });

    it('retries on 500 and succeeds', async () => {
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(500, {}))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      await fetcher.get('/test', TestSchema);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all retry attempts', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(429, {}));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(RateLimitError);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('does not retry on 404', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(404, {}));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(NotFoundError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 401', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(401, {}));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(AuthError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('does not retry on unexpected 4xx (e.g. 405)', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(405, {}));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(ApiError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('constructor validation', () => {
    it('throws if maxAttempts is less than 1', () => {
      expect(() =>
        new Fetcher({
          baseUrl: 'https://rest.api.bible/v1',
          apiKey: 'key',
          retry: { maxAttempts: 0 },
        }),
      ).toThrow('maxAttempts');
    });

    it('throws InvalidInputError (not a bare Error) on bad retry bounds', () => {
      expect(() =>
        new Fetcher({
          baseUrl: 'https://rest.api.bible/v1',
          apiKey: 'key',
          retry: { maxAttempts: 0 },
        }),
      ).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when maxResponseBytes is below 1', () => {
      expect(() =>
        new Fetcher({
          baseUrl: 'https://rest.api.bible/v1',
          apiKey: 'key',
          maxResponseBytes: 0,
        }),
      ).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when maxElapsedMs is zero or negative', () => {
      for (const maxElapsedMs of [0, -1]) {
        expect(() =>
          new Fetcher({
            baseUrl: 'https://rest.api.bible/v1',
            apiKey: 'key',
            retry: { maxElapsedMs },
          }),
        ).toThrow(InvalidInputError);
      }
    });

    it('accepts maxElapsedMs: null to disable the budget', () => {
      expect(() =>
        new Fetcher({
          baseUrl: 'https://rest.api.bible/v1',
          apiKey: 'key',
          retry: { maxElapsedMs: null },
        }),
      ).not.toThrow();
    });
  });

  describe('total-time budget (maxElapsedMs)', () => {
    it('gives up rather than sleeping past the budget (429)', async () => {
      const calls: Array<{ willRetry: boolean }> = [];
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(429, {}));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        // The first retry would sleep ~500ms (floor(0.5 * 1000)) against a 1ms
        // budget, so the call gives up after the initial attempt without sleeping.
        retry: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 1000, jitter: () => 0.5, maxElapsedMs: 1 },
        onRetry: (m) => calls.push({ willRetry: m.willRetry }),
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(RateLimitError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([{ willRetry: false }]);
    });

    it('gives up rather than sleeping past the budget (network error)', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 1000, jitter: () => 0.5, maxElapsedMs: 1 },
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(NetworkError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('retries fully when the budget is disabled (null)', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(429, {}));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0, maxElapsedMs: null },
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(RateLimitError);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('does not curtail retries when the budget is generous', async () => {
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, {}))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0, maxElapsedMs: 60_000 },
      });

      const result = await fetcher.get('/test', TestSchema);
      expect(result.data.id).toBe('abc');
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('nextRetryDelay', () => {
    const cfg = (over: Partial<{ maxAttempts: number; baseDelayMs: number; maxDelayMs: number; maxElapsedMs: number | null; jitter: () => number }> = {}) => ({
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 30_000,
      maxElapsedMs: 60_000,
      jitter: () => 0.5,
      ...over,
    });

    it('returns a plain jittered backoff when there is no Retry-After', () => {
      // attempt 0: ceiling = min(500 * 2^0, 30000) = 500; floor(0.5 * 500) = 250.
      expect(nextRetryDelay(0, null, cfg())).toBe(250);
    });

    it('adds jitter on top of the Retry-After floor (no lockstep)', () => {
      // 1000ms floor + floor(0.5 * 500) jitter = 1250.
      expect(nextRetryDelay(0, 1000, cfg({ jitter: () => 0.5 }))).toBe(1250);
      // Different jitter draws must produce different total delays so clients
      // handed the same Retry-After spread out instead of waking together.
      const low = nextRetryDelay(0, 1000, cfg({ jitter: () => 0.1 }));
      const high = nextRetryDelay(0, 1000, cfg({ jitter: () => 0.9 }));
      expect(low).not.toBe(high);
      expect(low).toBeGreaterThanOrEqual(1000);
      expect(high).toBeGreaterThanOrEqual(1000);
    });

    it('clamps Retry-After + jitter to maxDelayMs', () => {
      expect(nextRetryDelay(0, 1_000_000, cfg({ jitter: () => 1 }))).toBe(30_000);
    });
  });

  describe('Retry-After header', () => {
    it('retries successfully when Retry-After: 0 is present on a 429', async () => {
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, {}, { 'retry-after': '0' }))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const result = await fetcher.get('/test', TestSchema);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(result.data.id).toBe('abc');
    });

    it('retries successfully when Retry-After header is absent', async () => {
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, {}))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      await fetcher.get('/test', TestSchema);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('retries successfully when Retry-After header is unparseable', async () => {
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, {}, { 'retry-after': 'not-a-value' }))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      await fetcher.get('/test', TestSchema);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('honors Retry-After on 503 within maxDelayMs by retrying (RFC 7231 §7.1.3)', async () => {
      // RFC 7231 explicitly defines Retry-After for 503 Service Unavailable.
      // Cloudflare/ALB emit it during maintenance windows. A `Retry-After: 0`
      // is within any budget, so the SDK retries (instantly, with maxDelayMs=0).
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(503, {}, { 'retry-after': '0' }))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      await fetcher.get('/test', TestSchema);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    // When the server asks us to wait longer than maxDelayMs, retrying would only
    // burn an attempt sleeping a clamped delay before hitting the same wall — so
    // the SDK surfaces the error immediately and lets the caller decide. These
    // run instantly precisely *because* there is no sleep on the throw path.
    it('throws immediately, without retrying, when Retry-After exceeds maxDelayMs (429)', async () => {
      const fetchFn = vi.fn()
        .mockResolvedValue(mockResponse(429, {}, { 'retry-after': '999999' }));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 1000, jitter: () => 0 },
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(RateLimitError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('throws immediately, without retrying, when Retry-After exceeds maxDelayMs (503)', async () => {
      const fetchFn = vi.fn()
        .mockResolvedValue(mockResponse(503, {}, { 'retry-after': '60' }));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 1000, jitter: () => 0 },
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(ServerError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('throws immediately when a far-future Retry-After HTTP-date exceeds maxDelayMs', async () => {
      const farFuture = new Date(Date.now() + 3_600_000).toUTCString();
      const fetchFn = vi.fn()
        .mockResolvedValue(mockResponse(429, {}, { 'retry-after': farFuture }));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 1000, jitter: () => 0 },
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(RateLimitError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('network errors', () => {
    it('retries when fetch rejects with a network-layer error', async () => {
      const networkErr = new TypeError('fetch failed');
      const fetchFn = vi.fn()
        .mockRejectedValueOnce(networkErr)
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const result = await fetcher.get('/test', TestSchema);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(result.data.id).toBe('abc');
    });

    it('throws NetworkError with cause set when retries are exhausted', async () => {
      const networkErr = new TypeError('fetch failed');
      const fetchFn = vi.fn().mockRejectedValue(networkErr);
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const err = await fetcher.get('/test', TestSchema).catch(e => e) as NetworkError;
      expect(err).toBeInstanceOf(NetworkError);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(0);
      expect(err.cause).toBe(networkErr);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('wraps internal timeout aborts as NetworkError and retries', async () => {
      let firstCall = true;
      const fetchFn = vi.fn().mockImplementation(async (_url, init) => {
        if (firstCall) {
          firstCall = false;
          // Hang until the Fetcher's internal controller aborts (the timeout),
          // then reject with AbortError exactly as the real fetch would.
          return new Promise((_, reject) => {
            const innerSignal = init.signal as AbortSignal;
            innerSignal.addEventListener('abort', () => {
              const e = new Error('The operation was aborted');
              e.name = 'AbortError';
              reject(e);
            });
          });
        }
        return mockResponse(200, SUCCESS_BODY);
      });

      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        timeout: 20,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
      });

      const result = await fetcher.get('/test', TestSchema);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(result.data.id).toBe('abc');
    });
  });

  describe('onResponse observer', () => {
    it('fires once per HTTP response with status, headers, and attempt index', async () => {
      const calls: Array<{ status: number; remaining: string | null; attempt: number }> = [];
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, {}, { 'x-ratelimit-remaining': '0' }))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY, { 'x-ratelimit-remaining': '99' }));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        onResponse: (m) => calls.push({
          status: m.status,
          remaining: m.headers.get('x-ratelimit-remaining'),
          attempt: m.attempt,
        }),
      });

      await fetcher.get('/test', TestSchema);
      expect(calls).toEqual([
        { status: 429, remaining: '0', attempt: 0 },
        { status: 200, remaining: '99', attempt: 1 },
      ]);
    });

    it('reports a finite, non-negative durationMs on each response', async () => {
      const durations: number[] = [];
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, {}))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        onResponse: (m) => durations.push(m.durationMs),
      });

      await fetcher.get('/test', TestSchema);
      expect(durations).toHaveLength(2);
      for (const d of durations) {
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
      }
    });

    it('swallows a throwing observer so it cannot break a successful request', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        onResponse: () => { throw new Error('observer boom'); },
      });

      const result = await fetcher.get('/test', TestSchema);
      expect(result.data.id).toBe('abc');
    });
  });

  describe('onRetry observer', () => {
    type Seen = { attempt: number; delayMs: number; status: number; willRetry: boolean };
    const record = (calls: Seen[]) => (m: RetryMeta) =>
      calls.push({ attempt: m.attempt, delayMs: m.delayMs, status: m.error.statusCode, willRetry: m.willRetry });

    it('fires willRetry=true per retry then willRetry=false on the final give-up (429)', async () => {
      const calls: Seen[] = [];
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(429, {}));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        onRetry: record(calls),
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(RateLimitError);
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(calls).toEqual([
        { attempt: 0, delayMs: 0, status: 429, willRetry: true },
        { attempt: 1, delayMs: 0, status: 429, willRetry: true },
        { attempt: 2, delayMs: 0, status: 429, willRetry: false },
      ]);
    });

    it('reports a finite, non-negative durationMs on each retry notification (response and network paths)', async () => {
      // 429 path exercises the response-branch durationMs; a rejecting fetch
      // exercises the network-branch durationMs.
      for (const failure of ['response', 'network'] as const) {
        const durations: number[] = [];
        const fetchFn = failure === 'response'
          ? vi.fn().mockResolvedValue(mockResponse(429, {}))
          : vi.fn().mockRejectedValue(new TypeError('fetch failed'));
        const fetcher = new Fetcher({
          baseUrl: 'https://rest.api.bible/v1',
          apiKey: 'test-key',
          fetch: fetchFn as unknown as typeof fetch,
          retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
          onRetry: (m) => durations.push(m.durationMs),
        });

        await expect(fetcher.get('/test', TestSchema)).rejects.toBeDefined();
        expect(durations).toHaveLength(2); // willRetry:true then the give-up
        for (const d of durations) {
          expect(Number.isFinite(d)).toBe(true);
          expect(d).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('fires for network errors, including the give-up (statusCode 0)', async () => {
      const calls: Seen[] = [];
      const fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        onRetry: record(calls),
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(NetworkError);
      expect(calls).toEqual([
        { attempt: 0, delayMs: 0, status: 0, willRetry: true },
        { attempt: 1, delayMs: 0, status: 0, willRetry: false },
      ]);
    });

    it('fires willRetry=false immediately when Retry-After exceeds maxDelayMs', async () => {
      const calls: Seen[] = [];
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(503, {}, { 'retry-after': '999999' }));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 1000, jitter: () => 0 },
        onRetry: record(calls),
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(ServerError);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([{ attempt: 0, delayMs: 0, status: 503, willRetry: false }]);
    });

    it('does not fire for non-retryable errors (404)', async () => {
      const calls: Seen[] = [];
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(404, { message: 'nope' }));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        onRetry: record(calls),
      });

      await expect(fetcher.get('/test', TestSchema)).rejects.toBeInstanceOf(NotFoundError);
      expect(calls).toEqual([]);
    });

    it('does not fire on a successful request', async () => {
      const calls: Seen[] = [];
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        onRetry: record(calls),
      });

      await fetcher.get('/test', TestSchema);
      expect(calls).toEqual([]);
    });

    it('swallows a throwing onRetry so it cannot alter the retry flow', async () => {
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, {}))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitter: () => 0 },
        onRetry: () => { throw new Error('observer boom'); },
      });

      const result = await fetcher.get('/test', TestSchema);
      expect(result.data.id).toBe('abc');
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('AbortSignal support', () => {
    it('rejects immediately without calling fetch when signal is already aborted', async () => {
      const fetchFn = vi.fn();
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);
      const controller = new AbortController();
      controller.abort();

      await expect(
        fetcher.get('/test', TestSchema, undefined, controller.signal),
      ).rejects.toThrow();
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('propagates the caller abort untouched when aborted during fetch (no NetworkError wrap, no retry)', async () => {
      const controller = new AbortController();
      const fetchFn = vi.fn().mockImplementation(async (_url, init) => {
        // The Fetcher bridges the caller's signal into its internal controller,
        // so the inner signal aborts when controller.abort() fires.
        return new Promise((_, reject) => {
          const innerSignal = init.signal as AbortSignal;
          innerSignal.addEventListener('abort', () => {
            const e = new Error('The operation was aborted');
            e.name = 'AbortError';
            reject(e);
          });
          // Trigger the caller abort on the next microtask, while fetch is "in flight".
          queueMicrotask(() => controller.abort());
        });
      });
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      const err = await fetcher.get('/test', TestSchema, undefined, controller.signal).catch(e => e) as Error;
      expect(err).not.toBeInstanceOf(NetworkError);
      expect(err.name).toBe('AbortError');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('does not leak abort listeners across retried sleeps on a reused signal', async () => {
      // Regression: sleep() used `{ once: true }`, which only detaches the
      // listener when it *fires*. On the timer-resolved path the listener
      // lingered, so a long-lived signal reused across retried requests
      // accumulated dead listeners. Assert add/remove stay balanced.
      const controller = new AbortController();
      const { signal } = controller;
      let added = 0;
      let removed = 0;
      const origAdd = signal.addEventListener.bind(signal);
      const origRemove = signal.removeEventListener.bind(signal);
      vi.spyOn(signal, 'addEventListener').mockImplementation((type, ...rest) => {
        if (type === 'abort') added++;
        return origAdd(type, ...(rest as [EventListener]));
      });
      vi.spyOn(signal, 'removeEventListener').mockImplementation((type, ...rest) => {
        if (type === 'abort') removed++;
        return origRemove(type, ...(rest as [EventListener]));
      });

      // Two 429s then success → two retry sleeps, three attempts.
      const fetchFn = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, {}))
        .mockResolvedValueOnce(mockResponse(429, {}))
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      const fetcher = makeFetcher(fetchFn as unknown as typeof fetch);

      await fetcher.get('/test', TestSchema, undefined, signal);

      expect(added).toBeGreaterThan(0);
      expect(removed).toBe(added);
    });

    it('stops retrying when signal is aborted during the retry sleep', async () => {
      const controller = new AbortController();
      const fetchFn = vi.fn()
        .mockImplementationOnce(async () => {
          // Abort synchronously after the first request completes so the
          // signal is already aborted when sleep() is called.
          controller.abort();
          return mockResponse(500, {});
        })
        .mockResolvedValue(mockResponse(200, SUCCESS_BODY));

      const fetcher = new Fetcher({
        baseUrl: 'https://rest.api.bible/v1',
        apiKey: 'test-key',
        fetch: fetchFn as unknown as typeof fetch,
        retry: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000, jitter: () => 1 },
      });

      await expect(
        fetcher.get('/test', TestSchema, undefined, controller.signal),
      ).rejects.toThrow();
      // First request ran, sleep was aborted — second request never started.
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('redirects', () => {
    // The api-key header is not stripped across origins by fetch, so a followed
    // redirect would disclose it. The SDK refuses to follow and says why.
    function mockRedirect(status: number, location?: string): Response {
      return {
        ok: false,
        status,
        headers: new Headers(location ? { location } : {}),
        text: () => Promise.resolve(''),
      } as unknown as Response;
    }

    it("asks fetch not to follow redirects", async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      await makeFetcher(fetchFn as unknown as typeof fetch).get('/test', TestSchema);
      expect(fetchFn.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    });

    it('throws on a 302 instead of following it', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockRedirect(302, 'https://evil.example.com/v1/bibles'));
      const err = await makeFetcher(fetchFn as unknown as typeof fetch)
        .get('/test', TestSchema)
        .catch((e: unknown) => e as ApiError);

      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(302);
      expect(err.message).toContain('https://evil.example.com');
      expect(err.message).toContain('api-key');
    });

    it('does not retry a redirect', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockRedirect(307, 'https://elsewhere.example.com/'));
      await expect(makeFetcher(fetchFn as unknown as typeof fetch).get('/test', TestSchema)).rejects.toThrow(
        ApiError,
      );
      // maxAttempts is 3 — a redirect is terminal, so only one request goes out.
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('reports the origin only, never the redirect query string', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockRedirect(301, 'https://evil.example.com/steal?api-key=leaked'));
      const err = await makeFetcher(fetchFn as unknown as typeof fetch)
        .get('/test', TestSchema)
        .catch((e: unknown) => e as ApiError);

      expect(err.message).toContain('https://evil.example.com');
      expect(err.message).not.toContain('leaked');
      expect(err.message).not.toContain('/steal');
    });

    it('resolves a relative Location against the request URL', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockRedirect(308, '/v1/moved'));
      const err = await makeFetcher(fetchFn as unknown as typeof fetch)
        .get('/test', TestSchema)
        .catch((e: unknown) => e as ApiError);

      expect(err.message).toContain('https://rest.api.bible');
    });

    it('handles a redirect with no Location header', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockRedirect(302));
      const err = await makeFetcher(fetchFn as unknown as typeof fetch)
        .get('/test', TestSchema)
        .catch((e: unknown) => e as ApiError);

      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toContain('undisclosed host');
    });

    it('recognizes a browser opaque-redirect response', async () => {
      // Browsers answer redirect:'manual' with status 0 and no headers, which
      // would otherwise surface as the useless `ApiError('HTTP 0')`.
      const opaque = {
        ok: false,
        status: 0,
        type: 'opaqueredirect',
        headers: new Headers(),
        text: () => Promise.resolve(''),
      } as unknown as Response;
      const fetchFn = vi.fn().mockResolvedValue(opaque);
      const err = await makeFetcher(fetchFn as unknown as typeof fetch)
        .get('/test', TestSchema)
        .catch((e: unknown) => e as ApiError);

      expect(err).toBeInstanceOf(ApiError);
      expect(err.message).toContain('opaque redirect');
      expect(err.message).toContain('api-key');
    });

    it('leaves normal responses unaffected', async () => {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, SUCCESS_BODY));
      await expect(makeFetcher(fetchFn as unknown as typeof fetch).get('/test', TestSchema)).resolves.toEqual(
        SUCCESS_BODY,
      );
    });
  });
});
