import { Fetcher, type RetryConfig, type ResponseObserver, type RetryObserver } from './http/fetcher.js';
import { InvalidInputError } from './http/errors.js';
import { AudioBiblesResource } from './resources/audio-bibles.js';
import { BiblesResource } from './resources/bibles.js';
import { BooksResource } from './resources/books.js';
import { ChaptersResource } from './resources/chapters.js';
import { PassagesResource } from './resources/passages.js';
import { SearchResource } from './resources/search.js';
import { SectionsResource } from './resources/sections.js';
import { VersesResource } from './resources/verses.js';

/**
 * Configuration for {@link createBibleClient}. Defined independently from the
 * internal `FetcherConfig` — the transport layer is an implementation detail.
 */
export interface BibleClientConfig {
  /** Your api.bible API key. Sent in the `api-key` header on every request. Required. */
  apiKey: string;
  /** Override the API base URL. Must be `https://` except for loopback hosts (localhost / 127.0.0.1 / [::1]). Default: `https://rest.api.bible/v1`. */
  baseUrl?: string;
  /**
   * Per-attempt request timeout in milliseconds. Default: `10_000` (10s).
   *
   * NOTE: this is the timeout for a single HTTP attempt, not for the whole
   * operation. With the default `retry.maxAttempts: 3`, a request that
   * consistently times out can take up to `~3 × timeout + backoffs` of wall
   * time before throwing. Use the caller-supplied `AbortSignal` for a hard
   * end-to-end deadline.
   */
  timeout?: number;
  /** Override the global `fetch`. Useful for testing or for custom transports (e.g. undici Agent with a connection pool). */
  fetch?: typeof globalThis.fetch;
  /** Retry policy for transient failures. See {@link RetryConfig}. */
  retry?: RetryConfig;
  /**
   * Hard ceiling on a single response body, in bytes. Protects against a buggy
   * or hostile upstream OOM-ing the process with an unbounded payload. Bodies
   * over the limit reject with an `ApiError`. Default: `10 * 1024 * 1024` (10 MiB).
   */
  maxResponseBytes?: number;
  /**
   * Side-channel callback fired once per HTTP response (every attempt, including
   * errors). Use it for observability or client-side throttling — e.g. read
   * `X-RateLimit-Remaining` off `meta.headers`, or record `meta.durationMs` to
   * build latency percentiles (P50/P95/P99). It cannot alter the request and
   * any error it throws is swallowed. A response whose body exceeds
   * `maxResponseBytes` is rejected before this fires, so it is not observed
   * here. See {@link ResponseObserver}.
   */
  onResponse?: ResponseObserver;
  /**
   * Side-channel callback fired on each retryable failure — a network error /
   * timeout, a `429`, or a `5xx` — including the final give-up
   * (`willRetry: false`). This is the failure-path counterpart to `onResponse`,
   * which never sees timeouts/network errors because they carry no HTTP
   * response. `meta.durationMs` carries how long the failed attempt took. It
   * cannot alter control flow and any error it throws is swallowed.
   * See {@link RetryObserver}.
   */
  onRetry?: RetryObserver;
  /**
   * Extra headers sent on every request — useful for distributed tracing
   * (X-Request-ID, X-Correlation-ID, …) or for overriding the default
   * `User-Agent` / `Accept`. The `api-key` header is always applied last by
   * the transport and cannot be overridden here.
   */
  headers?: Record<string, string>;
}

/**
 * The composed SDK client returned by {@link createBibleClient}. Each property
 * is a resource handle whose methods map 1:1 to api.bible REST endpoints.
 */
export interface BibleClient {
  /** Audio Bibles, audio books, and audio chapter resources (incl. presigned `resourceUrl`). */
  audioBibles: AudioBiblesResource;
  /** List and fetch Bibles. */
  bibles: BiblesResource;
  /** List and fetch books within a Bible. */
  books: BooksResource;
  /** List and fetch chapters; optionally render content. */
  chapters: ChaptersResource;
  /** Fetch arbitrary verse ranges as a passage. */
  passages: PassagesResource;
  /** Full-text search within a Bible. */
  search: SearchResource;
  /** List and fetch editor-defined section headings. */
  sections: SectionsResource;
  /** List and fetch individual verses. */
  verses: VersesResource;
}

// http: would ship the API key in plaintext on every request — the header-
// based auth scheme provides no protection without TLS. Reject anything
// non-https except the loopback hosts callers legitimately use for local
// proxies (mitmproxy, charles, a dev mock).
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function validateBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new InvalidInputError(`createBibleClient: baseUrl is not a valid URL: ${JSON.stringify(baseUrl)}`);
  }
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname)) return;
  throw new InvalidInputError(
    `createBibleClient: baseUrl must use https:// (got ${parsed.protocol}//). ` +
      `Sending the api-key over plaintext http risks credential exposure. ` +
      `http:// is only allowed for loopback hosts (localhost, 127.0.0.1, [::1]).`,
  );
}

/**
 * Construct a Bible API client. The returned object holds eight resource
 * handles, one per endpoint family. All network state lives in a single
 * internal Fetcher — safe to share across concurrent requests and across
 * your application.
 *
 * @param config  See {@link BibleClientConfig}. `apiKey` is required;
 *                `baseUrl` defaults to `https://rest.api.bible/v1` and must
 *                use `https://` for any non-loopback host.
 * @returns       A {@link BibleClient} with `bibles`, `books`, `chapters`,
 *                `verses`, `passages`, `sections`, `audioBibles`, `search`.
 * @throws {InvalidInputError} if `apiKey` is missing or `baseUrl` is
 *                 unparseable / uses plaintext `http://` against a non-loopback host.
 * @example
 *   import { createBibleClient } from '@americanbible/api-bible-sdk';
 *
 *   const client = createBibleClient({ apiKey: process.env.BIBLE_API_KEY! });
 *   const { data } = await client.bibles.list({ language: 'eng' });
 */
export function createBibleClient(config: BibleClientConfig): BibleClient {
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new InvalidInputError('createBibleClient: apiKey is required');
  }
  const baseUrl = config.baseUrl ?? 'https://rest.api.bible/v1';
  validateBaseUrl(baseUrl);

  const fetcher = new Fetcher({
    apiKey: config.apiKey,
    baseUrl,
    timeout: config.timeout,
    fetch: config.fetch,
    retry: config.retry,
    headers: config.headers,
    maxResponseBytes: config.maxResponseBytes,
    onResponse: config.onResponse,
    onRetry: config.onRetry,
  });

  return {
    audioBibles: new AudioBiblesResource(fetcher),
    bibles: new BiblesResource(fetcher),
    books: new BooksResource(fetcher),
    chapters: new ChaptersResource(fetcher),
    passages: new PassagesResource(fetcher),
    search: new SearchResource(fetcher),
    sections: new SectionsResource(fetcher),
    verses: new VersesResource(fetcher),
  };
}
