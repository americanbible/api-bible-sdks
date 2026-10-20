# api-bible-sdk

A TypeScript SDK for the [API.Bible](https://api.bible/) REST API — type-safe access to Bibles, books, chapters, verses, passages, audio content, and search.

![Node.js ≥20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![ESM](https://img.shields.io/badge/module-ESM-orange)

---

## Table of Contents

- [Installation](#installation)
- [Authentication](#authentication)
- [Quickstart](#quickstart)
- [Key Features](#key-features)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Content Parameters](#content-parameters)
- [Error Handling](#error-handling)
- [Advanced Usage](#advanced-usage)
- [Development](#development)
- [Contributing](#contributing)
- [License and terms](#license-and-terms)

---

## Installation

```bash
npm install @americanbible/api-bible-sdk
```

> **Requires Node.js ≥20.** The SDK relies on the native `fetch` API and `Headers` global. Node 18 is end-of-life as of April 2025; consumers on EOL runtimes should upgrade before adopting this SDK.

> **ESM and CommonJS.** This package ships both builds with full TypeScript types for each.
> `import` resolves to the ESM build, `require()` to the CommonJS build — so it works in
> Node 20+ (with or without `"type": "module"`), bundlers (Vite, Webpack 5+, esbuild, Rollup),
> and test runners including Jest's default CJS transformer and Vitest.

---

## Authentication

1. Sign up for a free API key at [api.bible](https://api.bible/).
2. Pass the key as `apiKey` when creating the client.

The key is sent as an `api-key` header on every request. Never hard-code keys in source files — use an environment variable instead:

```bash
export BIBLE_API_KEY="your-api-key-here"
```

---

## Quickstart

```typescript
import { createBibleClient } from "@americanbible/api-bible-sdk";

const client = createBibleClient({
  apiKey: process.env.BIBLE_API_KEY!,
});

// List all available Bibles
const { data: bibles } = await client.bibles.list();
console.log(bibles.map((b) => `${b.id} — ${b.name}`));

// Get a specific chapter (Berean Standard Bible, Genesis 1)
const { data: chapter } = await client.chapters.get(
  "bba9f40183526463-01", // Bible ID
  "GEN.1", // Chapter ID
  { contentType: "text", includeVerseNumbers: true },
);
console.log(chapter.content);
```

---

## Key Features

- **Full TypeScript support** — all responses are runtime-validated with [Zod](https://zod.dev/) and exposed as precise TypeScript types.
- **Complete API coverage** — `bibles`, `books`, `chapters`, `verses`, `passages`, `sections`, `audioBibles`, and `search` resources.
- **Automatic retry** — exponential backoff with full jitter on `429` and `5xx` responses, plus transport failures and timeouts; respects the `Retry-After` header.
- **Request cancellation** — every method accepts an optional `AbortSignal`.
- **Configurable timeout** — global timeout (default 10 s) enforced via `AbortController`.
- **Flexible content types** — retrieve content as `html`, `json`, or plain `text`.
- **Custom fetch injection** — swap in your own `fetch` implementation for testing or edge runtimes.
- **ESM-only, minimal dependencies** — zero runtime dependencies beyond Zod.

---

## Configuration

### `createBibleClient(config)`

| Option             | Type                      | Default                     | Description                                                                                                  |
| ------------------ | ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apiKey`           | `string`                  | —                           | **Required.** Your API.Bible key.                                                                            |
| `baseUrl`          | `string`                  | `https://rest.api.bible/v1` | Override the API base URL. Must be `https://` except for loopback hosts (`localhost` / `127.0.0.1` / `[::1]`). |
| `timeout`          | `number`                  | `10000`                     | **Per-attempt** request timeout in ms — not an end-to-end deadline. See [Timeouts are per-attempt](#timeouts-are-per-attempt). |
| `retry`            | `RetryConfig`             | see below                   | Retry strategy configuration.                                                                                |
| `maxResponseBytes` | `number`                  | `10485760` (10 MiB)         | Hard ceiling on a single response body. See [Response size and validation](#response-size-and-validation).   |
| `headers`          | `Record<string, string>`  | —                           | Extra headers sent on every request (e.g. tracing IDs). The `api-key` header is always applied last and cannot be overridden. |
| `fetch`            | `typeof globalThis.fetch` | `globalThis.fetch`          | Custom fetch implementation.                                                                                 |
| `onResponse`       | `ResponseObserver`        | —                           | Observability hook fired per HTTP response received (each attempt, including error statuses). Carries `status`, `headers`, `attempt`, `url`, and `durationMs` (per-attempt latency). See [Observability](#observability). |
| `onRetry`          | `RetryObserver`           | —                           | Observability hook fired on each retryable failure — including timeouts and network errors, which carry no HTTP response and so are invisible to `onResponse`. Carries `durationMs` for the failed attempt. |

### `RetryConfig`

| Option         | Default       | Description                                        |
| -------------- | ------------- | -------------------------------------------------- |
| `maxAttempts`  | `3`           | Total number of attempts (initial + retries).      |
| `baseDelayMs`  | `500`         | Initial backoff delay in milliseconds.             |
| `maxDelayMs`   | `30000`       | Maximum backoff delay in milliseconds.             |
| `maxElapsedMs` | `60000`       | Total wall-clock budget (ms) across **all** attempts. Before each backoff sleep, if waiting would exceed it the SDK gives up instead. Bounds retry *scheduling*, not a single in-flight request. Pass `null` to disable. |
| `jitter`       | `Math.random` | Function returning a value in `[0, 1)` for jitter. |

Retry uses the formula `floor(jitter() * min(baseDelayMs * 2^attempt, maxDelayMs))`, with the server's `Retry-After` header value used as a floor when present. If the server's `Retry-After` exceeds `maxDelayMs`, the SDK does **not** retry — it throws `RateLimitError` / `ServerError` immediately so you can decide how to handle a wait longer than you've allowed, rather than silently consuming the retry budget.

### Timeouts are per-attempt

`timeout` bounds a **single HTTP attempt**, not the whole operation. With the default `retry.maxAttempts: 3`, a request that keeps timing out can take up to roughly `3 × timeout` plus the backoff sleeps between attempts before it finally throws.

`retry.maxElapsedMs` (default 60s) caps the total wall-clock spent across attempts: before each backoff sleep the SDK checks the budget and gives up rather than sleep past it — so a long `Retry-After` during a rate-limit storm surfaces the error promptly instead of parking the caller for minutes. Note it bounds retry *scheduling*, not an in-flight request, so it is not a hard deadline. If you need a hard end-to-end deadline that also aborts the in-flight request, pass an `AbortSignal` and abort it on your own timer (see [Request cancellation](#request-cancellation-with-abortsignal)) — aborting takes priority over the internal timeout and stops retrying immediately.

### Response size and validation

Every response is buffered fully into memory and validated against a [Zod](https://zod.dev/) schema before it is returned. Two things are worth knowing for high-throughput or large-payload workloads:

- **Size cap.** Bodies larger than `maxResponseBytes` (default 10 MiB) are rejected with an `ApiError` before the whole payload is buffered. Raise it if you legitimately fetch larger responses — e.g. a whole Bible with chapter content inline.
- **Validation is synchronous.** Parsing and validating a multi-megabyte response holds several copies of it in memory and runs on the event loop for the duration. This is negligible for typical payloads, but if you fetch very large bodies under high concurrency, budget for the CPU and memory cost.

### Observability

The SDK emits no logs of its own. Instead it exposes two side-channel hooks so you can wire requests into whatever metrics/logging backend you use. `onResponse` fires once per HTTP response (every attempt, including error statuses); `onRetry` fires on every retryable failure — network errors, timeouts, `429`, `5xx` — including the final give-up. Both payloads carry `durationMs`, the monotonic time the attempt took, so you can build latency percentiles (P50/P95/P99) without wrapping every call site:

```typescript
import { createBibleClient, type ResponseMeta } from '@americanbible/api-bible-sdk';

const latencies: number[] = [];

const client = createBibleClient({
  apiKey: process.env.BIBLE_API_KEY!,
  onResponse: (meta: ResponseMeta) => {
    latencies.push(meta.durationMs);
    // or record straight into your metrics backend, tagged by status:
    // histogram.record(meta.durationMs, { status: meta.status });
  },
  onRetry: (meta) => {
    const took = Math.round(meta.durationMs);
    console.warn(
      `attempt ${meta.attempt} failed in ${took}ms` +
        (meta.willRetry ? `, retrying in ${meta.delayMs}ms` : ' — giving up'),
    );
  },
});

function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
// ...later: percentile(latencies, 99) → P99 latency in ms
```

`ResponseMeta` also exposes `status`, `headers`, `attempt`, and `url`; `RetryMeta` exposes `attempt`, `delayMs`, `error`, and `willRetry`. The hooks run on the request's hot path and any error they throw is swallowed, so keep them cheap and non-throwing. The api-key is never passed to these callbacks.

### Rate limiting

The SDK handles rate limits **reactively**: a `429` is retried with full-jitter backoff that honors the server's `Retry-After`, bounded by `retry.maxAttempts` and `retry.maxElapsedMs` (see [RetryConfig](#retryconfig)). If retries are exhausted it throws `RateLimitError`, whose `.statusCode` is `429` and whose response body is on `.body`.

It does **not** throttle proactively — it won't slow down before you hit the limit. If you want to avoid `429`s in the first place (e.g. a batch job), read the rate-limit headers off `onResponse` and pace your own requests. api.bible returns `X-RateLimit-Remaining`; treat any reset hint as advisory and confirm the exact header semantics against a live response.

```typescript
import { createBibleClient } from '@americanbible/api-bible-sdk';

let remaining = Infinity;
let resetAtMs = 0; // when the window resets, if the API reports it

const client = createBibleClient({
  apiKey: process.env.BIBLE_API_KEY!,
  onResponse: (meta) => {
    const rem = meta.headers.get('x-ratelimit-remaining');
    if (rem !== null) remaining = Number(rem);
    // Adjust to your API's actual reset header (seconds-until-reset shown here):
    const reset = meta.headers.get('x-ratelimit-reset');
    if (reset !== null) resetAtMs = Date.now() + Number(reset) * 1000;
  },
});

// Call before a request when you'd rather wait than spend your last token.
async function throttle(): Promise<void> {
  if (remaining > 0) return;
  const waitMs = Math.max(0, resetAtMs - Date.now());
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
}

await throttle();
const bibles = await client.bibles.list();
```

For multiple clients or processes sharing one API key, enforce the limit in a shared place (a queue or a distributed limiter) rather than per-instance — the backoff already adds jitter so concurrent clients don't retry in lockstep, but only a shared limiter actually caps aggregate request rate.

---

## API Reference

All resource methods return `Promise<ApiResponse<T>>`, where `ApiResponse<T>` is:

```typescript
type ApiResponse<T> = {
  data: T;
  meta?: Meta; // FUMS analytics metadata from API.Bible
};
```

Every method accepts an optional `AbortSignal` as its final argument.

#### FUMS metadata

API.Bible's Fair Use Management System tracks how scripture content is used, and reporting usage back is a requirement for web applications. The field you report is `meta.fumsToken`:

```typescript
const { data, meta } = await client.chapters.get(bibleId, 'JHN.3');
if (meta?.fumsToken) reportToFums(meta.fumsToken);
```

`fumsToken` is the only field current responses populate. `Meta` also declares `fumsId`, `fums`, `fumsJs`, and `fumsJsInclude` — these belong to the older JavaScript-embed flow and are typically absent. Responses that return no content, such as `bibles.get`, carry no `meta` at all, so always check before reading it.

Separately, `Bible.copyright` and `Bible.info` are the two fields API.Bible's Terms §7 require you to display. Both are returned by `bibles.get` and by `bibles.list({ includeFullDetails: true })`, and both are omitted from the plain listing.

---

### `client.bibles`

```typescript
// List all Bibles, optionally filtered
bibles.list(params?: BibleListParams, signal?: AbortSignal): Promise<ApiResponse<Bible[]>>

// Get a single Bible by ID
bibles.get(bibleId: string, signal?: AbortSignal): Promise<ApiResponse<Bible>>
```

**`BibleListParams`:** `language?`, `abbreviation?`, `name?`, `ids?: string[]`, `includeFullDetails?: boolean`

---

### `client.books`

```typescript
books.list(bibleId: string, params?: BookListParams, signal?: AbortSignal): Promise<ApiResponse<Book[]>>
books.get(bibleId: string, bookId: string, params?: BookGetParams, signal?: AbortSignal): Promise<ApiResponse<Book>>
```

**`BookListParams`:** `includeChapters?: boolean`, `includeChaptersAndSections?: boolean`  
**`BookGetParams`:** `includeChapters?: boolean`

---

### `client.chapters`

```typescript
chapters.list(bibleId: string, bookId: string, signal?: AbortSignal): Promise<ApiResponse<ChapterSummary[]>>
chapters.get(bibleId: string, chapterId: string, params?: ChapterGetParams, signal?: AbortSignal): Promise<ApiResponse<Chapter>>
```

---

### `client.verses`

```typescript
verses.list(bibleId: string, chapterId: string, signal?: AbortSignal): Promise<ApiResponse<VerseSummary[]>>
verses.get(bibleId: string, verseId: string, params?: VerseGetParams, signal?: AbortSignal): Promise<ApiResponse<Verse>>
```

---

### `client.passages`

```typescript
// passageId is a range like "GEN.1.1-GEN.1.10"
passages.get(bibleId: string, passageId: string, params?: PassageGetParams, signal?: AbortSignal): Promise<ApiResponse<Passage>>
```

---

### `client.sections`

```typescript
sections.listForBook(bibleId: string, bookId: string, signal?: AbortSignal): Promise<ApiResponse<SectionSummary[]>>
sections.listForChapter(bibleId: string, chapterId: string, signal?: AbortSignal): Promise<ApiResponse<SectionSummary[]>>
sections.get(bibleId: string, sectionId: string, params?: SectionGetParams, signal?: AbortSignal): Promise<ApiResponse<Section>>
```

---

### `client.audioBibles`

```typescript
audioBibles.list(params?: AudioBibleListParams, signal?: AbortSignal): Promise<ApiResponse<AudioBibleSummary[]>>
audioBibles.get(audioBibleId: string, signal?: AbortSignal): Promise<ApiResponse<AudioBible>>

audioBibles.listBooks(audioBibleId: string, params?: AudioBookListParams, signal?: AbortSignal): Promise<ApiResponse<AudioBookSummary[]>>
audioBibles.getBook(audioBibleId: string, bookId: string, params?: AudioBookGetParams, signal?: AbortSignal): Promise<ApiResponse<AudioBookSummary>>

audioBibles.listChapters(audioBibleId: string, bookId: string, signal?: AbortSignal): Promise<ApiResponse<AudioChapterSummary[]>>
// Returns resourceUrl (signed audio stream URL); timecodes are included only when api.bible has them
audioBibles.getChapter(audioBibleId: string, chapterId: string, signal?: AbortSignal): Promise<ApiResponse<AudioChapter>>
```

`AudioChapter` includes a signed `resourceUrl` for the audio stream. The `timecodes` array (mapping timestamps to verse IDs) is present only when api.bible provides timecode data for that chapter — it is not a request option, so it will be absent for audio Bibles that have no timecodes.

---

### `client.search`

```typescript
search.search(bibleId: string, params: SearchParams, signal?: AbortSignal): Promise<ApiResponse<SearchResult>>
```

`params` is required, because `query` is.

**`SearchParams`:**

| Param       | Type                                                | Description                                                      |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| `query`     | `string`                                            | **Required.** Search query string.                               |
| `limit`     | `number`                                            | Max results to return.                                           |
| `offset`    | `number`                                            | Pagination offset.                                               |
| `sort`      | `'relevance' \| 'canonical' \| 'reverse-canonical'` | Sort order.                                                      |
| `range`     | `string`                                            | Limit search to a passage range (e.g. `"GEN"`, `"MAT.1-MAT.5"`). |
| `fuzziness` | `'AUTO' \| '0' \| '1' \| '2'`                       | Fuzzy match level.                                               |

**Two response shapes.** API.Bible answers a search in one of two ways, and it picks based on the query — no parameter selects between them, and no field in the response tags which one you got:

| Query | You get |
| ----- | ------- |
| A keyword (`"love"`, `"Jude"`, or a query matching nothing) | `query`, `limit`, `offset`, `total`, `verseCount`, `verses` — never `passages` |
| Something it parses as a scripture reference (`"John 3:16-19"`, `"John 3"`) | `passages` — and nothing else |

Every field on `SearchResult` is therefore optional. Rather than null-checking each one, narrow with the exported guards:

```typescript
import { isKeywordSearchResult, isReferenceSearchResult } from '@americanbible/api-bible-sdk';

const { data } = await client.search.search(bibleId, { query });

if (isReferenceSearchResult(data)) {
  // `passages` is non-optional here
  for (const passage of data.passages) console.log(passage.reference);
} else if (isKeywordSearchResult(data)) {
  // `total` and `verses` are non-optional here
  console.log(`${data.total} matches`);
  for (const verse of data.verses) console.log(verse.reference, verse.text);
}
```

`isKeywordSearchResult` narrows to `KeywordSearchResult` and `isReferenceSearchResult` to `ReferenceSearchResult`; both are exported. A keyword search with no matches still returns the full keyword shape with `verses: []`, so it takes the keyword branch rather than falling through.

---

## Content Parameters

The `get` methods on `chapters`, `verses`, `passages`, and `sections` share a common set of content parameters:

| Param                   | Type                         | Description                                          |
| ----------------------- | ---------------------------- | ---------------------------------------------------- |
| `contentType`           | `'html' \| 'json' \| 'text'` | Format for the `content` field.                      |
| `includeNotes`          | `boolean`                    | Include footnotes.                                   |
| `includeTitles`         | `boolean`                    | Include section titles.                              |
| `includeChapterNumbers` | `boolean`                    | Include chapter number markers.                      |
| `includeVerseNumbers`   | `boolean`                    | Include verse number markers.                        |
| `includeVerseSpans`     | `boolean`                    | Include verse span markers.                          |
| `parallels`             | `string[]`                   | Additional Bible IDs to include as parallel content. |

---

## Error Handling

Every error the SDK throws extends a single root, `BibleError`, so one
`instanceof BibleError` catches anything the SDK can throw. Narrow to a subtype
for specific handling:

```
BibleError                  ← catch-all for every error the SDK throws
├─ ApiError                 ← a request was attempted; exposes statusCode + body
│  ├─ AuthError               401 / 403
│  ├─ NotFoundError           404
│  ├─ BadRequestError         400
│  ├─ RateLimitError          429        (auto-retried)
│  ├─ ServerError             5xx        (auto-retried)
│  └─ NetworkError            transport failure / timeout (auto-retried)
├─ InvalidInputError        ← you called the SDK wrong; no request was made
└─ ValidationError          ← API response didn't match the schema; exposes issues
```

Import the error classes you need and use `instanceof` checks. Order subtypes
before their supertypes (e.g. `NetworkError` before the `ApiError` catch-all):

```typescript
import {
  createBibleClient,
  InvalidInputError,
  AuthError,
  NotFoundError,
  BadRequestError,
  RateLimitError,
  ServerError,
  NetworkError,
  ValidationError,
  ApiError,
  BibleError,
} from "@americanbible/api-bible-sdk";

const client = createBibleClient({ apiKey: process.env.BIBLE_API_KEY! });

try {
  const { data } = await client.verses.get("invalid-bible-id", "GEN.1.1");
} catch (err) {
  if (err instanceof InvalidInputError) {
    // You called the SDK wrong (missing apiKey, malformed params) — no request was sent
    console.error("Invalid input:", err.message);
  } else if (err instanceof AuthError) {
    // 401 or 403 — check your API key
    console.error("Authentication failed:", err.message);
  } else if (err instanceof NotFoundError) {
    // 404 — Bible or verse ID does not exist
    console.error("Not found:", err.message);
  } else if (err instanceof BadRequestError) {
    // 400 — malformed request
    console.error("Bad request:", err.message);
  } else if (err instanceof RateLimitError) {
    // 429 — automatically retried; only thrown when retries are exhausted
    console.error("Rate limit exceeded");
  } else if (err instanceof ServerError) {
    // 5xx — automatically retried; only thrown when retries are exhausted
    console.error("Server error:", err.statusCode);
  } else if (err instanceof NetworkError) {
    // DNS/TCP/TLS failure or timeout before any response — auto-retried.
    // statusCode is 0 and body is "" (no response was received).
    console.error("Network error:", err.message);
  } else if (err instanceof ValidationError) {
    // SDK received a response that didn't match its schema
    console.error("Schema validation failed:", err.format());
  } else if (err instanceof ApiError) {
    // Catch-all for any other error where a request was attempted
    console.error(`HTTP ${err.statusCode}:`, err.body);
  } else if (err instanceof BibleError) {
    // Catch-all for any SDK error
    console.error("SDK error:", err.message);
  }
}
```

| Error | Extends | Thrown when | Auto-retried | `statusCode` / `body` |
| --- | --- | --- | --- | --- |
| `AuthError` | `ApiError` | HTTP 401 / 403 | no | real / response body |
| `NotFoundError` | `ApiError` | HTTP 404 | no | real / response body |
| `BadRequestError` | `ApiError` | HTTP 400 | no | real / response body |
| `RateLimitError` | `ApiError` | HTTP 429 | **yes** | real / response body |
| `ServerError` | `ApiError` | HTTP 5xx | **yes** | real / response body |
| `NetworkError` | `ApiError` | transport failure / timeout, before any response | **yes** | `0` / `""` |
| `InvalidInputError` | `BibleError` | bad caller input — thrown **synchronously**, no request sent | no | — |
| `ValidationError` | `BibleError` | API response failed Zod validation (contract drift / bad JSON) | no | `issues` + `format()` |

Notes:

- **`BibleError`** is the single root — use it when you just want "did the SDK
  throw?" `ApiError` narrows that to "a request was attempted," and includes
  `NetworkError` even though no HTTP response came back (`statusCode` `0`,
  `body` `""`).
- **`InvalidInputError`** is deliberately *not* an `ApiError`: it's raised before
  any request (missing `apiKey`, a plaintext `baseUrl`, out-of-range retry
  bounds, an empty search query, a comma inside an `ids[]`/`parallels` element).
  Catch it to distinguish "I called the SDK wrong" from a real API/transport
  failure.
- **`ValidationError`** is also not an `ApiError`: it signals an SDK/contract
  problem, not an API failure. Inspect `issues` (Zod's path-based list) or call
  `format()` for a log-ready multi-line summary.
- **`RateLimitError`**, **`ServerError`**, and **`NetworkError`** are retried
  automatically; they only reach your code once retries are exhausted — or, for
  429/5xx, immediately when the server's `Retry-After` exceeds `retry.maxDelayMs`.

### Redirects are not followed

The SDK sends every request with `redirect: "manual"`. A 3xx response throws a
plain `ApiError` naming the redirect target's origin, and is never retried.

This is deliberate. `fetch` strips only `Authorization`, `Cookie`, and
`Proxy-Authorization` when a redirect crosses origins — a custom header like
api.bible's `api-key` is not on that list, so a followed redirect would resend
your key to whatever host the `Location` names. api.bible does not redirect in
normal operation, so a 3xx means something has changed and is worth looking at
before the key goes out again. Redirect support can be added behind a config
flag later if a real need appears.

---

## Advanced Usage

### Request cancellation with `AbortSignal`

```typescript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const { data } = await client.chapters.get(
    "bba9f40183526463-01",
    "GEN.1",
    { contentType: "text" },
    controller.signal,
  );
} catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") {
    console.log("Request cancelled");
  }
}
```

### Custom retry configuration

```typescript
const client = createBibleClient({
  apiKey: process.env.BIBLE_API_KEY!,
  retry: {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 60_000,
  },
});
```

### Custom fetch implementation

Useful for testing, edge runtimes, or adding middleware:

```typescript
import { createBibleClient } from "@americanbible/api-bible-sdk";

const client = createBibleClient({
  apiKey: process.env.BIBLE_API_KEY!,
  fetch: async (url, init) => {
    console.log("→", url);
    return globalThis.fetch(url, init);
  },
});
```

### Paginating search results

```typescript
const PAGE_SIZE = 20;
let offset = 0;
let total = Infinity;

while (offset < total) {
  const { data } = await client.search.search("bba9f40183526463-01", {
    query: "love",
    limit: PAGE_SIZE,
    offset,
  });

  total = data.total;
  console.log(data.verses);
  offset += PAGE_SIZE;
}
```

---

## Versioning and support

This package follows [Semantic Versioning](https://semver.org/). Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

- **Patch** (`1.0.x`) — bug fixes and internal changes with no API impact.
- **Minor** (`1.x.0`) — backwards-compatible additions: new methods, new optional config, new fields on response/observer types. Because every response schema uses `.passthrough()`, new fields returned by api.bible do **not** require a release and will not break validation.
- **Major** (`x.0.0`) — breaking changes to the public API: removed or renamed exports, changed method signatures, changed error types, or raising the minimum Node version.

The **public API** is everything exported from the package entry point — `createBibleClient`, the resource interfaces, the config/response types, and the error classes. Anything reached through `dist/` internals is not a stable surface.

**Runtime support:** Node 20+. Dropping an end-of-life Node version is a breaking change and ships only in a major release.

**Security support:** fixes land on the latest published minor release; see [SECURITY.md](../../SECURITY.md).

---

## Development

```bash
# Run the test suite (Vitest)
npm test

# Type-check without emitting
npm run typecheck

# Run the bundled example
npm run example
```

Tests use Vitest with mocked `fetch` responses — no live API calls are made during testing.

### Contract fixtures

The offline contract tests in `tests/contract/` replay recorded api.bible responses (`tests/contract/fixtures/recordings.json`) through the real client and schemas, so schema drift is caught without touching the network. The nightly **Contract** workflow runs the same cases against the live API to *detect* drift; the monthly **Refresh Contract Fixtures** workflow re-records the fixtures and opens a PR with any changes (or run it on demand via *workflow_dispatch*). To refresh locally:

```bash
BIBLE_API_KEY=... npm run record-fixtures
```

---

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes before submitting a pull request. Make sure `npm test` and `npm run typecheck` both pass before opening a PR.

Maintainers: see [RELEASING.md](RELEASING.md) for the release process and the rollback/incident runbook.

---

## License and terms

Licensed under the Apache License 2.0 — Copyright 2026 American Bible Society.
See [LICENSE](LICENSE). That covers this SDK's source code, and nothing else.

Your use of the API is governed by api.bible's
[Terms & Conditions](https://api.bible/terms-and-conditions), and the scripture
text and audio it returns are licensed by their publishers and rights holders —
not by this package. Most translations carry attribution, usage, and reporting
obligations of their own. Read the terms before you ship.
