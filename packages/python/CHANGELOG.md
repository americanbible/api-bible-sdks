# Changelog

All notable changes to `americanbible-api-bible-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-08-26

Closes the parity gap with the TypeScript SDK's 2.0.0 schema fixes. Two of those
four bugs existed here too, and the shared contract-case table had drifted so
that neither could be caught — the two missing cases are added below.

### Added

- `Bible.copyright` and `Bible.info` are now typed. Both are returned by
  `bibles.get` and by `bibles.list(include_full_details=True)`, and both are the
  fields API.Bible's Terms §7 require you to display — previously they reached
  consumers only through `model_extra`.
- `SearchPassage.content`, `.verse_count`, and `.copyright`, all returned by the
  API and previously unmodelled.
- Contract cases `verses.get.boundary` and `search.reference`, mirroring the
  TypeScript case table. Their absence is why the two fixes below went unnoticed:
  `GEN.1.1` never reaches either edge of a Bible, and the keyword search case
  cannot reach the reference branch.

### Fixed

- **`verses.get` no longer raises at the first and last verse of a Bible.** The
  API returns `next: {}` / `previous: {}` there rather than omitting the key, and
  `_Nav.id` was required, so `REV.22.21` and `GEN.intro.0` failed to validate.
  `id` is now optional. Chapters and sections omit the key instead and were
  unaffected, though they share the model.

### Removed

- **`SearchPassage.text`**, which the API never sends — a passage carries
  `content`; it is `SearchVerse` that carries `text`. The attribute was always
  `None`, and the real content was landing in `model_extra`. Read `.content`
  instead.

### Changed

- **Redirects are refused explicitly.** `follow_redirects=False` is now set per
  request rather than relying on the httpx default, so a caller-supplied
  `http_client` that enables redirects can no longer cause the `api-key` header
  to be resent to another host. A 3xx response raises `ApiError` naming the
  redirect target's origin; previously it fell through to the response parser
  and surfaced as a misleading "empty response body" error. Not retried.
- **License changed from MIT to Apache License 2.0.** Apache 2.0 adds an express
  patent grant and a patent-retaliation clause that MIT does not provide.
  Copyright remains American Bible Society. Already-published versions keep the
  license they were released under; this applies from the next release onward.

## [1.2.0] - 2026-07-08

### Added

- `RequestEvent.headers`: the response headers are now handed to the `on_request`
  observer, so an application can read rate-limit headers (e.g.
  `X-RateLimit-Remaining`) and throttle proactively. `None` when the attempt
  received no response (timeout or transport failure).
- `ConflictError` (409) and `UnprocessableEntityError` (422) exception classes.
  Both are subclasses of `ApiError`, so existing `except ApiError` handlers are
  unaffected; they are not retried.

### Changed

- A `2xx` response with an empty body or a non-JSON `Content-Type` now raises a
  precise `ApiError` (e.g. naming the unexpected content type) instead of a
  generic JSON decode failure. Such responses are not retried.

## [1.1.0] - 2026-06-30

### Added

- Per-request `headers` argument on every resource method, merged into that
  single request (and unable to override the `api-key`). Lets callers propagate a
  distributed-tracing context (`traceparent`) or correlation id without a separate
  client.
- `max_response_bytes` (default 10 MiB) on `BibleClient` and `BibleClient.from_env`.
  Responses are now streamed and read under this cap, so an over-large or hostile
  body is aborted mid-stream with an `ApiError` instead of being buffered whole.
  Pass `None` to disable the cap.
- `on_retry` observer (and the `RetryEvent`/`RetryObserver` types) on `BibleClient`
  and `BibleClient.from_env`. Fired once per retry, just before the backoff sleep,
  with the scheduled `delay_ms`, the failure `reason`, and the server's
  `retry_after_ms` hint — so retries and backoff are observable, which the
  per-attempt `on_request` hook can't express.
- `Meta.fums_token` (and `Meta.fums_no_script`): typed fields for the current
  api.bible FUMS `fumsToken` response key, which earlier releases exposed only as
  an undeclared passthrough field.

### Documentation

- Document that the `sections` endpoints return `404` (`NotFoundError`) for a book
  or chapter with no section data, rather than an empty list.

## [1.0.0]

Initial public release.

- Synchronous `BibleClient` with attribute-style resources (`bibles`, `books`,
  `chapters`, `verses`, `passages`, `sections`, `audio_bibles`, `search`).
- API-key authentication via constructor or `BibleClient.from_env`
  (`API_BIBLE_KEY`, falling back to `BIBLE_API_KEY`).
- Automatic retries with full-jitter exponential backoff, honoring `Retry-After`
  and bounded by a total-time budget (`RetryConfig`).
- Connection-pool timeouts fail fast rather than retrying.
- Typed Pydantic v2 response models and a granular exception hierarchy.
- FUMS response metadata via `last_meta` and `*_with_meta` methods.

[Unreleased]: https://github.com/americanbible/api-bible-sdks/compare/py-v1.2.0...HEAD
[1.2.0]: https://github.com/americanbible/api-bible-sdks/compare/py-v1.1.0...py-v1.2.0
[1.1.0]: https://github.com/americanbible/api-bible-sdks/compare/py-v1.0.0...py-v1.1.0
[1.0.0]: https://github.com/americanbible/api-bible-sdks/releases/tag/py-v1.0.0
