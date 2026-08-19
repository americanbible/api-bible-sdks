import type { ZodIssue } from 'zod';

// Names are hardcoded as string literals — constructor.name breaks under minification.

// All error classes accept an optional `cause` (Node 16.9+ / ES2022 Error.cause).
// Only forward the options bag when cause is provided so we don't set
// `err.cause = undefined` and pollute property enumeration.
function errorOptions(cause: unknown): ErrorOptions | undefined {
  return cause !== undefined ? { cause } : undefined;
}

/**
 * Hard cap on the response body retained inside an `ApiError` instance.
 *
 * Without a cap, a 50 KB Cloudflare HTML error page (or a misconfigured server
 * returning multi-MB content) would land on every thrown error — and the
 * common `logger.error({ err })` pattern serializes the whole thing on every
 * call. Under load that's the difference between a benign error spike and a
 * log-pipeline incident.
 *
 * Truncation happens at construction and is signaled by `bodyTruncated: true`
 * on the resulting error. The `message` field is extracted from the full body
 * upstream, so truncation doesn't degrade error messages.
 */
export const MAX_ERROR_BODY_BYTES = 4096;

/**
 * Root of every error the SDK throws. Catch `instanceof BibleError` to handle
 * any SDK failure in one place; narrow to a subtype for specific handling:
 *
 *   BibleError
 *     ├─ ApiError            an HTTP request was made and failed
 *     │    ├─ AuthError        401 / 403
 *     │    ├─ NotFoundError    404
 *     │    ├─ BadRequestError  400
 *     │    ├─ RateLimitError   429
 *     │    ├─ ServerError      5xx
 *     │    └─ NetworkError     transport failure — statusCode 0, empty body
 *     ├─ InvalidInputError   caller passed bad config/params; no request made
 *     └─ ValidationError     API response didn't match the expected schema
 */
export class BibleError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, errorOptions(cause));
    this.name = 'BibleError';
  }
}

/**
 * Base class for every failure where an HTTP request was attempted — both
 * error responses (4xx/5xx) and transport failures (`NetworkError`).
 *
 * Use `instanceof ApiError` to catch any of these, or one of the subclasses
 * below for status-specific handling. For a catch-all across the entire SDK
 * (including `InvalidInputError` / `ValidationError`), use `instanceof BibleError`.
 *
 * @example
 *   try {
 *     await client.bibles.get('bad-id');
 *   } catch (err) {
 *     if (err instanceof NotFoundError) { ... }
 *     else if (err instanceof ApiError) { console.error(err.statusCode, err.body); }
 *     else if (err instanceof BibleError) { ... } // InvalidInputError / ValidationError
 *   }
 */
export class ApiError extends BibleError {
  /** HTTP status code from the response. `0` for `NetworkError` (no response received). */
  public readonly statusCode: number;
  /**
   * Response body (`text()`) captured at request time, truncated to
   * {@link MAX_ERROR_BODY_BYTES} to keep log payloads bounded. Check
   * `bodyTruncated` if you need to know whether the full body was larger.
   */
  public readonly body: string;
  /** `true` if the captured body was longer than {@link MAX_ERROR_BODY_BYTES} and was sliced. */
  public readonly bodyTruncated: boolean;

  constructor(message: string, statusCode: number, body: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    if (body.length > MAX_ERROR_BODY_BYTES) {
      this.body = body.slice(0, MAX_ERROR_BODY_BYTES);
      this.bodyTruncated = true;
    } else {
      this.body = body;
      this.bodyTruncated = false;
    }
  }
}

/**
 * Thrown synchronously when caller-supplied configuration or method input is
 * invalid — a missing api-key, a plaintext/unparseable baseUrl, out-of-range
 * retry bounds, or a malformed parameter (empty search query, comma inside an
 * `ids[]` element, …).
 *
 * A `BibleError` but deliberately NOT an `ApiError`: no HTTP request was
 * attempted, so there is no status code or response body. Catch it with
 * `instanceof InvalidInputError` to distinguish "I called the SDK wrong" from
 * a real API or transport failure.
 */
export class InvalidInputError extends BibleError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'InvalidInputError';
  }
}

/** Thrown on HTTP 401 / 403 — the api-key is missing, invalid, or lacks permission. */
export class AuthError extends ApiError {
  constructor(message: string, statusCode: number, body: string, cause?: unknown) {
    super(message, statusCode, body, cause);
    this.name = 'AuthError';
  }
}

/** Thrown on HTTP 404 — the requested resource (Bible, book, chapter, …) does not exist. */
export class NotFoundError extends ApiError {
  constructor(message: string, statusCode: number, body: string, cause?: unknown) {
    super(message, statusCode, body, cause);
    this.name = 'NotFoundError';
  }
}

/** Thrown on HTTP 400 — request parameters were rejected by the API. */
export class BadRequestError extends ApiError {
  constructor(message: string, statusCode: number, body: string, cause?: unknown) {
    super(message, statusCode, body, cause);
    this.name = 'BadRequestError';
  }
}

/**
 * Thrown on HTTP 429. The transport backs off with full jitter before each
 * retry and respects `Retry-After`. This error surfaces either after the retry
 * budget is exhausted, or immediately (without retrying) when the server's
 * `Retry-After` exceeds `retry.maxDelayMs` — i.e. it asked us to wait longer
 * than we're willing to, so the caller decides what to do next.
 */
export class RateLimitError extends ApiError {
  constructor(message: string, statusCode: number, body: string, cause?: unknown) {
    super(message, statusCode, body, cause);
    this.name = 'RateLimitError';
  }
}

/**
 * Thrown on any HTTP 5xx. 5xx responses are retried with backoff, honoring
 * `Retry-After` if present. Surfaces after the retry budget is exhausted, or
 * immediately (without retrying) when `Retry-After` exceeds `retry.maxDelayMs`.
 */
export class ServerError extends ApiError {
  constructor(message: string, statusCode: number, body: string, cause?: unknown) {
    super(message, statusCode, body, cause);
    this.name = 'ServerError';
  }
}

/**
 * Transport-layer failure before any HTTP response was received: DNS, TCP, TLS,
 * mid-stream socket reset, undici's `TypeError: fetch failed`, or an internal
 * timeout abort. `statusCode` is `0` to signal "no response." Retried with the
 * same policy as 429 / 5xx.
 */
export class NetworkError extends ApiError {
  constructor(message: string, cause?: unknown) {
    super(message, 0, '', cause);
    this.name = 'NetworkError';
  }
}

/**
 * SDK-side fault — the API returned something that didn't match the expected
 * Zod schema (response shape drift, malformed JSON, etc.). A `BibleError` but
 * NOT an `ApiError`: this represents an SDK / contract problem, not an API
 * problem. Inspect `issues` (Zod's path-based issue list) for the mismatch.
 */
export class ValidationError extends BibleError {
  constructor(
    message: string,
    public readonly issues: ZodIssue[],
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'ValidationError';
  }

  // Human-readable multi-line summary suitable for logs:
  //   Response validation failed:
  //     data.chapters.0.number: Expected string, received number
  //     data.id: Required
  // When there are no issues (e.g. "Response is not valid JSON") returns the
  // top-level message alone so callers can log err.format() unconditionally.
  format(): string {
    if (this.issues.length === 0) return this.message;
    const lines = this.issues.map(issue => {
      const path = issue.path.length === 0 ? '<root>' : issue.path.join('.');
      return `  ${path}: ${issue.message}`;
    });
    return `${this.message}:\n${lines.join('\n')}`;
  }
}
