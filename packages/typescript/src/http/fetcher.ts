import { z, ZodError } from 'zod';
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
} from './errors.js';
import { SDK_VERSION } from '../version.js';

/**
 * Controls how the SDK retries transient failures (HTTP 429, HTTP 5xx, and
 * network-layer errors). Defaults: 3 attempts, 500 ms base, 30 s ceiling,
 * 60 s total budget, full-jitter exponential backoff.
 *
 * Each attempt's delay is `random() * min(baseDelayMs * 2^attempt, maxDelayMs)`.
 * When the response carries `Retry-After`, the server's value is used as a
 * floor with that jittered backoff added on top (so clients handed the same
 * value don't wake in lockstep) — the sum clamped to `maxDelayMs`. If the
 * server's `Retry-After` *exceeds* `maxDelayMs`, the SDK does not retry at all:
 * it surfaces the error immediately rather than burn an attempt sleeping a
 * clamped delay only to hit the same wall. Separately, `maxElapsedMs` caps the
 * total wall-clock spent retrying across all attempts.
 */
export interface RetryConfig {
  /** Total attempts including the first try. `1` disables retries. Default: `3`. */
  maxAttempts?: number;
  /** Starting backoff in ms. Default: `500`. */
  baseDelayMs?: number;
  /** Per-attempt ceiling for both backoff and `Retry-After`. Default: `30_000`. */
  maxDelayMs?: number;
  /** Random source for jitter. Overrides `Math.random` — pass `() => 0` in tests for instant, deterministic retries. */
  jitter?: () => number;
  /**
   * Total wall-clock budget, in milliseconds, that a single request may spend
   * across all attempts. Before each backoff sleep, if waiting would push past
   * this budget the SDK gives up instead — so a `Retry-After` at or above the
   * remaining budget is surfaced immediately rather than parking the caller for
   * minutes during a rate-limit storm. It bounds retry *scheduling*, not a
   * single in-flight request (that is bounded by `timeout`). Default: `60_000`
   * (60s). Pass `null` to disable. Must be `> 0`.
   */
  maxElapsedMs?: number | null;
}

/** Metadata about a single HTTP response, passed to a {@link ResponseObserver}. */
export interface ResponseMeta {
  /** HTTP status code of the response. */
  status: number;
  /** Response headers. Read rate-limit headers here (e.g. `X-RateLimit-Remaining`). */
  headers: Headers;
  /** 0-based index of the attempt that produced this response (retries increment it). */
  attempt: number;
  /** Fully-qualified request URL. */
  url: string;
  /**
   * Wall-clock milliseconds this attempt took — from just before `fetch` until
   * the body finished reading — measured with a monotonic clock. Feed it into a
   * histogram to compute latency percentiles (P50/P95/P99).
   */
  durationMs: number;
}

/**
 * Side-channel callback invoked once per received HTTP response — including
 * each retried attempt and error responses. Intended for observability and
 * client-side throttling (inspect rate-limit headers). It cannot alter the
 * request, and any error it throws is swallowed so telemetry can't break a
 * real response.
 *
 * One exception: a response whose body exceeds `maxResponseBytes` is rejected
 * with an `ApiError` during the body read, before this fires — so an
 * over-cap response is not observed here.
 */
export type ResponseObserver = (meta: ResponseMeta) => void;

/** Metadata about a retryable failure, passed to a {@link RetryObserver}. */
export interface RetryMeta {
  /** 0-based index of the attempt that just failed. */
  attempt: number;
  /** Milliseconds the SDK will wait before the next attempt. `0` when `willRetry` is `false`. */
  delayMs: number;
  /** The retryable error that triggered this notification — a {@link NetworkError}, {@link RateLimitError}, or {@link ServerError}. */
  error: ApiError;
  /** `true` if another attempt follows after `delayMs`; `false` if the SDK has given up and is about to throw `error`. */
  willRetry: boolean;
  /**
   * Wall-clock milliseconds the failed attempt took before erroring (monotonic
   * clock). For a timeout this is approximately the configured `timeout`; for a
   * `429`/`5xx` it's the round-trip that produced the error response.
   */
  durationMs: number;
}

/**
 * Side-channel callback invoked on each retryable failure — a network error /
 * timeout, a `429`, or a `5xx` — once per retry decision, *including* the final
 * give-up (fired with `willRetry: false` right before the error is thrown).
 *
 * This is the failure-path counterpart to {@link ResponseObserver}: timeouts
 * and network errors carry no HTTP response, so `onResponse` never sees them —
 * `onRetry` does. It cannot alter control flow, and any error it throws is
 * swallowed so telemetry can't break a request. Non-retryable errors (401, 404,
 * 400, validation failures, caller-driven aborts) do not fire it — they were
 * never part of the retry lifecycle.
 */
export type RetryObserver = (meta: RetryMeta) => void;

export interface FetcherConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  fetch?: typeof globalThis.fetch;
  retry?: RetryConfig;
  onResponse?: ResponseObserver;
  onRetry?: RetryObserver;
  // Extra headers sent on every request — useful for distributed tracing
  // (X-Request-ID, X-Correlation-ID, …) or for overriding the default
  // User-Agent. The `api-key` header is always re-applied last so callers
  // cannot accidentally null it out by passing `{ 'api-key': '' }`.
  headers?: Record<string, string>;
  /** Hard ceiling on a single response body, in bytes. Default: 10 MiB. */
  maxResponseBytes?: number;
}

export const DEFAULT_USER_AGENT = `api-bible-sdk-js/${SDK_VERSION}`;

/**
 * Default ceiling on a single response body. `fetch`/undici buffers the whole
 * body into memory with no built-in limit, so without a cap a buggy or hostile
 * upstream returning a multi-GB body would OOM the process. 10 MiB comfortably
 * exceeds any real api.bible payload (a whole Bible's books with chapters and
 * sections inline) while bounding the blast radius.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function utf8ByteLength(text: string): number {
  return textEncoder.encode(text).byteLength;
}

function decodeChunks(chunks: Uint8Array[]): string {
  if (chunks.length === 1) return textDecoder.decode(chunks[0]);
  let total = 0;
  for (const chunk of chunks) total += chunk.byteLength;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return textDecoder.decode(merged);
}

const DEFAULT_RETRY = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  maxElapsedMs: 60_000 as number | null,
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortError(signal.reason));
      return;
    }
    let timeoutId: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(toAbortError(signal!.reason));
    };
    timeoutId = setTimeout(() => {
      // Detach on the happy path. `{ once: true }` only removes the listener
      // *after it fires* — on timer resolution it never fires, so without this
      // a long-lived signal reused across many retried requests would
      // accumulate one dead listener per retry sleep for the signal's lifetime.
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}

function toAbortError(reason: unknown): Error {
  return reason instanceof Error ? reason : new DOMException('This operation was aborted', 'AbortError');
}

// Full jitter: random value in [0, min(base * 2^attempt, cap)].
// Prevents thundering herd when multiple clients share one API key.
function backoffDelay(attempt: number, config: Required<RetryConfig>): number {
  const ceiling = Math.min(config.baseDelayMs * 2 ** attempt, config.maxDelayMs);
  return Math.floor(config.jitter() * ceiling);
}

/**
 * Delay before the next retry. Starts from a full-jitter backoff. When the
 * server sent `Retry-After`, waits at least that long *plus* the jittered
 * backoff on top — adding jitter to the floor (rather than taking
 * `max(jitter, retryAfter)`) is what keeps clients that were handed the same
 * `Retry-After` value from waking in lockstep. The sum is clamped to
 * `maxDelayMs` as defense-in-depth.
 *
 * NOTE: the transport only calls this when `retryAfterMs <= maxDelayMs` (a
 * larger value short-circuits to an immediate throw upstream), so in practice
 * the clamp here only ever trims the jitter overshoot.
 */
export function nextRetryDelay(
  attempt: number,
  retryAfterMs: number | null,
  config: Required<RetryConfig>,
): number {
  const jittered = backoffDelay(attempt, config);
  if (retryAfterMs === null) return jittered;
  return Math.min(retryAfterMs + jittered, config.maxDelayMs);
}

// Extracts a human-readable message from an error response body. Defensive against:
//   - non-JSON bodies (HTML pages, plain text)         → caught, default message
//   - JSON primitives (`null`, `"str"`, `42`) and arrays → ignored, default message
//   - { message: "..." } shape                          → used
//   - { error: { message: "..." } } shape (alternative API convention) → used
function extractMessage(body: string, fallback: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallback;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.message === 'string' && obj.message.length > 0) {
    return obj.message;
  }
  const nested = obj.error;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const nestedMessage = (nested as Record<string, unknown>).message;
    if (typeof nestedMessage === 'string' && nestedMessage.length > 0) {
      return nestedMessage;
    }
  }
  return fallback;
}

function toTypedError(statusCode: number, body: string): ApiError {
  const message = extractMessage(body, `HTTP ${statusCode}`);

  if (statusCode === 401 || statusCode === 403) return new AuthError(message, statusCode, body);
  if (statusCode === 404) return new NotFoundError(message, statusCode, body);
  if (statusCode === 400) return new BadRequestError(message, statusCode, body);
  if (statusCode === 429) return new RateLimitError(message, statusCode, body);
  // Only 5xx responses are retryable server errors.
  // Other unexpected 4xx (405, 409, etc.) become a base ApiError and are NOT retried.
  if (statusCode >= 500) return new ServerError(message, statusCode, body);
  return new ApiError(message, statusCode, body);
}

// Redirects are never followed — see the `redirect: 'manual'` note at the fetch
// call site. The two runtimes report a suppressed redirect differently: Node and
// undici hand back the real 3xx with `Location` readable, while browsers return
// an opaque-redirect response (status 0, no headers, null body).
function isRedirect(response: Response): boolean {
  return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
}

function toRedirectError(response: Response, requestUrl: string): ApiError {
  let target = 'an undisclosed host';
  const location = response.headers?.get('location');
  if (location) {
    try {
      // Origin only. A Location URL can carry credentials in its query string,
      // and this message may well end up in someone's logs.
      target = new URL(location, requestUrl).origin;
    } catch {
      target = 'an unparseable location';
    }
  }
  const what = response.status >= 300 ? `a redirect (HTTP ${response.status})` : 'an opaque redirect';
  return new ApiError(
    `api.bible responded with ${what} to ${target}. The SDK does not follow redirects: fetch strips ` +
      'only Authorization, Cookie, and Proxy-Authorization across origins, so following this one ' +
      'would disclose your api-key to the redirect target.',
    response.status,
    '',
  );
}

// Matches application/json and the +json suffix family (application/vnd.api+json,
// application/ld+json, …), with or without a charset parameter. Strict on purpose:
// `text/json` and `application/json5` are non-standard and not accepted.
function isJsonContentType(contentType: string): boolean {
  return /^application\/(?:[^;]+\+)?json(?:\s*;|\s*$)/i.test(contentType);
}

// Parses the Retry-After response header into a millisecond delay.
// Accepts both numeric seconds ("120") and HTTP-date formats.
// Returns null if the header is absent or unparseable.
function parseRetryAfter(response: Response): number | null {
  const header = response.headers?.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (!isNaN(seconds) && seconds >= 0) return seconds * 1000;
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return null;
}

export class Fetcher {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly maxResponseBytes: number;
  private readonly onResponse?: ResponseObserver;
  private readonly onRetry?: RetryObserver;
  private readonly retryConfig: Required<RetryConfig>;
  // Precomputed at construction so we don't rebuild it per request. Stored as
  // a `Headers` instance — not a plain object — because HTTP header names are
  // case-insensitive and a `Record<string, string>` spread is not. With a
  // plain-object merge, a caller passing `{ 'API-Key': 'attacker' }` would
  // slip past the api-key-wins-last invariant (we'd set 'api-key' but their
  // 'API-Key' would persist as a *second* entry; undici's dedup behavior is
  // impl-defined). `Headers.set` is case-insensitive, so this can't happen.
  private readonly defaultHeaders: Headers;

  constructor(config: FetcherConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 10_000;
    this.fetchFn = config.fetch ?? globalThis.fetch;
    this.maxResponseBytes = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (this.maxResponseBytes < 1) throw new InvalidInputError('maxResponseBytes must be >= 1');
    this.onResponse = config.onResponse;
    this.onRetry = config.onRetry;

    const h = new Headers();
    h.set('User-Agent', DEFAULT_USER_AGENT);
    // Some CDN error layers serve text/html when Accept is missing, even for
    // endpoints that would otherwise return JSON. Asking explicitly also makes
    // the request more legible in network logs.
    h.set('Accept', 'application/json');
    if (config.headers) {
      // Iterate-and-set rather than passing the object to `new Headers()` —
      // the constructor `append`s entries (joining duplicates with commas),
      // but `set` replaces, which is what we want for last-wins override
      // semantics on caller-supplied headers.
      for (const [name, value] of Object.entries(config.headers)) {
        h.set(name, value);
      }
    }
    this.defaultHeaders = h;

    const maxAttempts = config.retry?.maxAttempts ?? DEFAULT_RETRY.maxAttempts;
    const baseDelayMs = config.retry?.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs;
    const maxDelayMs = config.retry?.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs;
    // `null` disables the budget, so distinguish it from `undefined` (use the
    // default) — `??` would collapse both onto the default.
    const maxElapsedMs =
      config.retry?.maxElapsedMs === undefined ? DEFAULT_RETRY.maxElapsedMs : config.retry.maxElapsedMs;

    if (maxAttempts < 1) throw new InvalidInputError('retry.maxAttempts must be >= 1');
    if (baseDelayMs < 0) throw new InvalidInputError('retry.baseDelayMs must be >= 0');
    if (maxDelayMs < 0) throw new InvalidInputError('retry.maxDelayMs must be >= 0');
    if (maxElapsedMs !== null && maxElapsedMs <= 0) {
      throw new InvalidInputError('retry.maxElapsedMs must be > 0, or null to disable');
    }

    this.retryConfig = {
      maxAttempts,
      baseDelayMs,
      maxDelayMs,
      maxElapsedMs,
      jitter: config.retry?.jitter ?? Math.random,
    };
  }

  private notifyRetry(meta: RetryMeta): void {
    if (!this.onRetry) return;
    try {
      this.onRetry(meta);
    } catch {
      // Same contract as onResponse: a telemetry hook must never alter control
      // flow. The consumer's callback owns its own failures.
    }
  }

  // True when sleeping `delay` ms now would carry the request past its total
  // retry budget (maxElapsedMs). A `null` deadline means the budget is disabled.
  private exceedsBudget(deadline: number | null, delay: number): boolean {
    return deadline !== null && performance.now() + delay > deadline;
  }

  private tooLargeError(statusCode: number, observedBytes: number): ApiError {
    return new ApiError(
      `Response body exceeded the ${this.maxResponseBytes}-byte limit ` +
        `(observed ${observedBytes} bytes). Raise maxResponseBytes if this is expected.`,
      statusCode,
      '',
    );
  }

  // Reads the response body with a hard byte ceiling so a huge (buggy or
  // hostile) payload can't OOM the process. Three layers:
  //   1. A declared Content-Length over the cap fails before buffering a byte.
  //   2. When a readable stream is available (the default under undici), read
  //      it chunk-by-chunk with a running total — this catches chunked
  //      responses that omit Content-Length.
  //   3. No stream (test doubles, exotic runtimes): fall back to text() and
  //      enforce the cap after the fact.
  // Throws an ApiError (not NetworkError) on overflow so the retry loop treats
  // it as terminal rather than transient.
  private async readBody(response: Response): Promise<string> {
    const max = this.maxResponseBytes;

    const declared = Number(response.headers?.get('content-length'));
    if (Number.isFinite(declared) && declared > max) {
      await response.body?.cancel?.().catch(() => {});
      throw this.tooLargeError(response.status, declared);
    }

    const reader = response.body?.getReader?.();
    if (!reader) {
      const text = await response.text();
      const size = utf8ByteLength(text);
      if (size > max) throw this.tooLargeError(response.status, size);
      return text;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
          await reader.cancel().catch(() => {});
          throw this.tooLargeError(response.status, total);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock?.();
    }
    return decodeChunks(chunks);
  }

  // Isolated so that AbortController + clearTimeout are always paired.
  // Body is read here: a fetch Response body stream can only be consumed once.
  // The caller's signal is bridged into the internal timeout controller so either
  // cancellation source (timeout or external abort) can stop the request.
  private async executeRequest(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ response: Response; body: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let onAbort: (() => void) | undefined;
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        throw toAbortError(signal.reason);
      }
      onAbort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', onAbort);
    }

    try {
      // Clone the precomputed defaults and apply api-key last. `Headers.set`
      // is case-insensitive, so a caller-supplied `'API-Key': '<attacker>'`
      // (any casing) is overwritten here rather than slipping through as a
      // duplicate entry.
      const headers = new Headers(this.defaultHeaders);
      headers.set('api-key', this.apiKey);
      // `redirect: 'manual'` rather than the fetch default of 'follow'. The
      // WHATWG Fetch spec strips only Authorization, Cookie, and
      // Proxy-Authorization when a redirect crosses origins — a custom `api-key`
      // header is not on that list, so a followed 3xx would resend the caller's
      // key to whatever host the Location names. api.bible does not redirect in
      // normal operation, so surfacing the 3xx is both safe and more informative
      // than silently following it. Redirect support can be added later behind a
      // config flag if a real need appears.
      const response = await this.fetchFn(url, {
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
      const body = await this.readBody(response);
      return { response, body };
    } catch (err) {
      // Three failure modes to disambiguate:
      //   1. Caller aborted — rethrow the caller's abort error; do NOT retry.
      //   2. Internal controller aborted (timeout) — wrap as NetworkError so the
      //      retry loop treats it as a transient failure.
      //   3. Genuine network-layer error (DNS, TLS, ECONNRESET, fetch failed) —
      //      also wrap as NetworkError; retryable.
      // Check caller signal first: if both signals aborted in the same tick, the
      // caller's intent wins.
      if (signal?.aborted) throw toAbortError(signal.reason);
      // A body-size-cap rejection is a deliberate ApiError, not a transport
      // failure — let it propagate so the retry loop treats it as terminal.
      // Genuine fetch/stream failures are TypeError / AbortError / DOMException,
      // never ApiError.
      if (err instanceof ApiError) throw err;
      if (controller.signal.aborted) {
        throw new NetworkError(`Request timed out after ${this.timeout}ms`, err);
      }
      const causeMessage = err instanceof Error ? err.message : String(err);
      throw new NetworkError(`Network request failed: ${causeMessage}`, err);
    } finally {
      // Always cancel — without this the timer holds the Node event loop open
      // after the request completes.
      clearTimeout(timeoutId);
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  async get<T>(
    path: string,
    schema: z.ZodType<T>,
    params?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!path.startsWith('/')) {
      throw new InvalidInputError(`Fetcher: path must start with '/' — received: ${JSON.stringify(path)}`);
    }

    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    // Total-time budget for the whole call (across all attempts). Computed once
    // up front; each retry checks it before sleeping. null = budget disabled.
    const deadline =
      this.retryConfig.maxElapsedMs === null
        ? null
        : performance.now() + this.retryConfig.maxElapsedMs;

    let attempt = 0;
    while (true) {
      const startedAt = performance.now();
      let response: Response;
      let body: string;
      try {
        ({ response, body } = await this.executeRequest(url.toString(), signal));
      } catch (err) {
        // executeRequest only throws caller-driven abort errors (propagate
        // untouched, no onRetry) or NetworkError (timeout / true network
        // failure — retry alongside 429/5xx).
        if (err instanceof NetworkError) {
          const durationMs = performance.now() - startedAt;
          if (attempt < this.retryConfig.maxAttempts - 1) {
            const delay = backoffDelay(attempt, this.retryConfig);
            if (!this.exceedsBudget(deadline, delay)) {
              this.notifyRetry({ attempt, delayMs: delay, error: err, willRetry: true, durationMs });
              await sleep(delay, signal);
              attempt++;
              continue;
            }
          }
          this.notifyRetry({ attempt, delayMs: 0, error: err, willRetry: false, durationMs });
        }
        throw err;
      }

      // Monotonic round-trip for this attempt (fetch + body read), surfaced to
      // both observers so callers can build latency percentiles (P50/P95/P99).
      const durationMs = performance.now() - startedAt;

      if (this.onResponse) {
        try {
          this.onResponse({
            status: response.status,
            headers: response.headers,
            attempt,
            url: url.toString(),
            durationMs,
          });
        } catch {
          // A telemetry hook must never convert a real HTTP response into a
          // thrown error. The consumer's callback owns its own failures.
        }
      }

      // Ahead of the !ok branch so a suppressed redirect gets its own message
      // rather than a bare `ApiError('HTTP 302')` — or, in a browser, the
      // useless `ApiError('HTTP 0')` an opaque redirect would otherwise produce.
      // Terminal by design: a redirect is a configuration change, not a
      // transient fault, so retrying it just resends the key.
      if (isRedirect(response)) {
        throw toRedirectError(response, url.toString());
      }

      if (!response.ok) {
        const error = toTypedError(response.status, body);
        const retryable = error instanceof RateLimitError || error instanceof ServerError;
        if (retryable && attempt < this.retryConfig.maxAttempts - 1) {
          // Honor Retry-After on both 429 and 5xx — RFC 7231 §7.1.3 explicitly
          // defines it for 503 Service Unavailable, and proxies (Cloudflare,
          // ALB, …) emit it on maintenance windows.
          const retryAfter = parseRetryAfter(response);
          // When the server asks us to wait longer than we're ever willing to
          // (maxDelayMs), retrying would only burn an attempt sleeping a clamped
          // delay and then almost certainly hit the same wall. Surface the error
          // now so the caller can decide (queue, alert, back off externally)
          // instead of silently eating the retry budget.
          if (retryAfter === null || retryAfter <= this.retryConfig.maxDelayMs) {
            // `nextRetryDelay` treats Retry-After as a floor and adds jitter on
            // top (clamped to maxDelayMs) so a shared Retry-After doesn't herd
            // every client into the same instant.
            const delay = nextRetryDelay(attempt, retryAfter, this.retryConfig);
            if (!this.exceedsBudget(deadline, delay)) {
              this.notifyRetry({ attempt, delayMs: delay, error, willRetry: true, durationMs });
              await sleep(delay, signal);
              attempt++;
              continue;
            }
          }
        }
        // Giving up on a retryable error (budget exhausted, or Retry-After
        // exceeds maxDelayMs) — report the terminal attempt. Non-retryable
        // errors (401/404/400/…) were never part of the retry lifecycle.
        if (retryable) {
          this.notifyRetry({ attempt, delayMs: 0, error, willRetry: false, durationMs });
        }
        throw error;
      }

      // A 2xx with HTML or text body (CDN intercept, captive portal, misrouted
      // proxy) is an API-level failure, not SDK schema drift — surface it as
      // ApiError so consumers don't conflate it with ValidationError. An absent
      // Content-Type is treated as "trust the body" since not all servers set it.
      const contentType = response.headers?.get('content-type') ?? '';
      if (contentType !== '' && !isJsonContentType(contentType)) {
        throw new ApiError(
          `Expected JSON response, got Content-Type: ${contentType}`,
          response.status,
          body,
        );
      }

      // An empty 2xx body (stale-while-revalidate cache hit, captive portal,
      // misconfigured proxy) is also an infra problem, not schema drift. Without
      // this guard, JSON.parse('') below throws a SyntaxError that surfaces as
      // ValidationError("Response is not valid JSON") — misleading. Treat it
      // as an ApiError so consumers can distinguish "the server gave us
      // nothing" from "the server gave us a malformed payload."
      if (body.length === 0) {
        throw new ApiError(
          `Server returned ${response.status} with empty body`,
          response.status,
          body,
        );
      }

      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch (err) {
        throw new ValidationError('Response is not valid JSON', [], err);
      }

      try {
        return schema.parse(json);
      } catch (err) {
        if (err instanceof ZodError) {
          throw new ValidationError('Response validation failed', err.issues);
        }
        throw err;
      }
    }
  }
}
