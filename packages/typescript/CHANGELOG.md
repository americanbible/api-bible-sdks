# Changelog

All notable changes to `@americanbible/api-bible-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Redirects are no longer followed.** Requests are sent with
  `redirect: "manual"`, and a 3xx response now throws an `ApiError` naming the
  redirect target's origin instead of being followed. `fetch` strips only
  `Authorization`, `Cookie`, and `Proxy-Authorization` across origins — the
  `api-key` header is not on that list, so a followed redirect would have resent
  your key to the redirect target. The error is terminal and is not retried.
  api.bible does not redirect in normal operation, so this should not affect
  working code.
- **License changed from MIT to Apache License 2.0.** Apache 2.0 adds an express
  patent grant and a patent-retaliation clause that MIT does not provide.
  Copyright remains American Bible Society. Already-published versions keep the
  license they were released under; this applies from the next release onward.

## [1.1.0] - 2026-07-01

### Added

- `durationMs` on `ResponseMeta` and `RetryMeta` — the monotonic wall-clock time
  each attempt took (fetch + body read), surfaced to the `onResponse` and
  `onRetry` hooks so callers can build latency percentiles (P50/P95/P99) without
  wrapping every call site.
- `RetryConfig.maxElapsedMs` — a total wall-clock budget (default 60s) across all
  retry attempts. Before each backoff sleep the SDK gives up rather than sleep
  past the budget, so a long `Retry-After` during a rate-limit storm surfaces
  promptly instead of parking the caller. Pass `null` to disable.

### Fixed

- `Section.next` / `Section.previous` navigation pointers no longer require
  `bookId`. The API omits it on section nav pointers, so a section-detail
  response carrying a `next`/`previous` pointer now validates instead of throwing
  `ValidationError`. (`bookId` on the top-level section is still required.)

## [1.0.0]

Initial public release.

- `createBibleClient` factory returning a client with attribute-style resources
  (`bibles`, `books`, `chapters`, `verses`, `passages`, `sections`,
  `audioBibles`, `search`).
- API-key authentication via the `api-key` header; `https://` is enforced for
  the base URL (loopback hosts excepted) so the key is never sent in cleartext.
- Automatic retries with full-jitter exponential backoff, honoring `Retry-After`
  on `429`/`5xx` (`RetryConfig`).
- Per-attempt timeout via `AbortController`, plus caller-supplied `AbortSignal`
  for end-to-end cancellation.
- Typed Zod response schemas (`.passthrough()`, so unknown API fields are
  preserved) and a granular error hierarchy (`BibleError` → `ApiError` →
  `AuthError` / `NotFoundError` / `BadRequestError` / `RateLimitError` /
  `ServerError` / `NetworkError`, plus `InvalidInputError` and
  `ValidationError`).
- Response body size cap (10 MiB default) to bound memory on hostile/buggy
  upstreams.
- FUMS response metadata via `ApiResponse.meta`.
- `onResponse` / `onRetry` observability hooks.
- Dual ESM + CJS builds with type declarations for each; requires Node 20+.

[Unreleased]: https://github.com/americanbible/api-bible-sdks/compare/ts-v1.1.0...HEAD
[1.1.0]: https://github.com/americanbible/api-bible-sdks/compare/ts-v1.0.0...ts-v1.1.0
[1.0.0]: https://github.com/americanbible/api-bible-sdks/releases/tag/ts-v1.0.0
