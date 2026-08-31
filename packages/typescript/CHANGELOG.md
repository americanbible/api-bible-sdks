# Changelog

All notable changes to `@americanbible/api-bible-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-08-26

Bringing the schemas in line with what api.bible actually returns fixed four
endpoints that threw on valid responses, but doing so widened two public types.
That is a breaking change for TypeScript consumers even though no runtime
behaviour regressed, so this is a major release — see **Changed** for the two
migrations, both one-liners.

### Added

- `isKeywordSearchResult` / `isReferenceSearchResult` type guards, and the
  `KeywordSearchResult` / `ReferenceSearchResult` types they narrow to. `/search`
  answers in one of two disjoint shapes depending on the query, and nothing in
  the response says which; the guards let callers branch without null-checking
  every field. `isKeywordSearchResult` narrows `total` and `verses`;
  `isReferenceSearchResult` narrows `passages`.
- `Bible.copyright` and `Bible.info` are now typed. Both are returned by
  `bibles.get` and by `bibles.list({ includeFullDetails: true })`, and both are
  the fields API.Bible's Terms §7 require you to display — previously they
  survived only as untyped passthrough, so displaying them meant casting around
  the SDK. Optional, because the plain `/bibles` listing omits them, and
  nullable, because `info` is null on some Bibles.
- `Chapter.copyright` is now typed, matching `Verse`, `Passage`, and `Section`,
  which already declared it.
- `Meta.fumsToken` is now typed. It is the value you submit when reporting FUMS
  usage, and the only field current responses populate; the four previously
  declared fields (`fumsId`, `fums`, `fumsJs`, `fumsJsInclude`) belong to the
  older JavaScript-embed flow and are kept for backward compatibility.
- `SearchPassage.bookId` and `SearchPassage.chapterIds`, both returned by the
  API and previously unmodelled.

### Fixed

- **Reference searches no longer throw.** A query the API parses as a scripture
  reference (`"John 3:16-19"`) returns `passages` alone, omitting `query`,
  `limit`, `offset`, `total`, and `verseCount`. All five were required, so every
  reference query failed with `ValidationError` and that branch of `/search` was
  unusable through the SDK. They are now optional, and `SearchPassage` is as
  lenient as the structurally identical `Passage`.
- `verses.get` no longer throws at the first and last verse of a Bible. The API
  returns `next: {}` / `previous: {}` there rather than omitting the key, so the
  nav pointer's required `id` failed to validate. Every `VerseNavSchema` field is
  now optional. (Chapters and sections omit the key instead and were unaffected.)
- `audioBibles.listBooks` / `getBook` with `includeChapters` no longer throw.
  Embedded chapters omit `reference`, which `AudioChapterSummary` required.
- `audioBibles.getChapter` no longer throws for audio Bibles that return the nav
  pointer's `number` as a JSON number rather than a string; it is coerced to a
  string, matching every other chapter `number` in the SDK.

### Changed

- **`SearchResult`'s five paging fields are now optional** (`query`, `limit`,
  `offset`, `total`, `verseCount`). This is the fix above, but it widens the
  public type: code like `data.total.toFixed()` or `const n: number = data.total`
  no longer typechecks. The old type was unsound — it promised a `number` the API
  does not always send. Migrate by narrowing with `isKeywordSearchResult`, which
  restores `total` as a non-optional `number`, or by using `data.total ?? 0`.
  Runtime behaviour is unchanged for keyword searches.
- **`VerseNav.id` is now optional**, the type-surface half of the boundary fix
  above. `verse.next?.id` was already `string | undefined` and is unaffected;
  only an explicit `if (verse.next) { f(verse.next.id) }` needs a second check.
  Chapter and section nav pointers are unchanged.
- **`AudioChapterSummary.reference` is now optional**, so the summaries inside
  `AudioBookSummary.chapters` typecheck. `audioBibles.getChapter` re-narrows it
  to a required `string` — that endpoint always sends it — so only code reading
  `reference` off a *list* or *embedded* summary needs a guard.
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
