# Changelog

All notable changes to `@americanbible/api-bible-sdk-react` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First public release. Requires `react` 18 or 19 and `@americanbible/api-bible-sdk`
`^2.0.1` as peer dependencies (2.0.1 fixes browser requests failing with
`Illegal invocation` in every earlier core release); ships no runtime
dependencies of its own.
Licensed under the Apache License 2.0.

### Added

- `ApiBibleProvider` and `useApiBible` — build (or accept) one shared client and
  hand it to the tree. `useApiBible()` is also the escape hatch for any endpoint
  without a dedicated hook.
- Proxy-first configuration: omit `apiKey` and point `baseUrl` at your own
  backend so the real key never reaches the browser. A relative path
  (`'/api/bible'`) is resolved against the page origin. In development, the
  provider warns when a real key is used in a browser against api.bible
  (default or explicit `*.api.bible` URL), and when neither `apiKey` nor
  `baseUrl` is set (every request would fail with an `AuthError`). Each warning
  logs once per provider, including under StrictMode.
- Resource hooks, each a thin wrapper over the matching core method:
  - Bibles: `useBibles(params?)`, `useBible(bibleId)`
  - Books and chapters: `useBooks(bibleId, params?)`,
    `useChapters(bibleId, bookId)`, `useChapter(bibleId, chapterId, params?)`
  - Verses and passages: `useVerses(bibleId, chapterId)`,
    `useVerse(bibleId, verseId, params?)`,
    `usePassages(bibleId, passageId, params?)`
  - Sections: `useSectionsForBook(bibleId, bookId)`,
    `useSectionsForChapter(bibleId, chapterId)`,
    `useSection(bibleId, sectionId, params?)`
  - Search: `useSearch(bibleId, params, options?)`, with `options.debounceMs`
    for search-as-you-type. Narrow the result with the re-exported
    `isKeywordSearchResult` / `isReferenceSearchResult`: a keyword query returns
    pagination plus `verses`, a scripture reference returns `passages`.
  - Audio: `useAudioBibles(params?)`, `useAudioBible(audioBibleId)`,
    `useAudioBooks(audioBibleId, params?)`,
    `useAudioBook(audioBibleId, bookId, params?)`,
    `useAudioChapters(audioBibleId, bookId)`,
    `useAudioChapter(audioBibleId, chapterId)` (presigned, expiring
    `resourceUrl`; call `refetch()` for a fresh one).
- A uniform `AsyncResource<T>` result on every hook: `data`, `error` (a typed
  `BibleError` subclass), `status`, `isLoading` (first load for the current
  inputs), `isFetching` (includes background refetches), and `refetch()`. The
  last successful `data` is kept through a refetch and through a failed refetch;
  changing an input (an id, params) resets `data` to `undefined` at once, even
  while a `debounceMs` wait is pending, so one input's result is never shown, or
  paired with an error, for another. `status: 'loading'` / `isFetching` cover a
  pending debounce as well as a request in flight.
- Request cancellation on unmount and on input change, and in-flight
  de-duplication: components requesting the same endpoint and params at the same
  time share one network call, cancelled only when the last one unmounts.
  StrictMode's dev remount rejoins the in-flight request instead of issuing a
  second one. Providers handed the same `client` share requests too.
- `onSettled` provider prop — one telemetry event per network request
  (`{ resourceKey, outcome, durationMs, error? }`), covering retries and
  failures such as `ValidationError` that the core's `onResponse` / `onRetry`
  never see. `resourceKey` never carries ids, params, or URLs; `error.message` /
  `error.body` are the API's response and may name the requested resource (an
  `AuthError` names the Bible ID). An event goes to the provider whose hook
  issued the request.
- Re-exports every type and error class from `@americanbible/api-bible-sdk`, so
  `instanceof NotFoundError` works from a single import. Values are re-exported
  by name, so a Server Component can import from the package in Next.js webpack
  builds (Next 15's default `next build`, Next 16's `next build --webpack`).
- Verified under React 18 and 19, StrictMode, and server-side rendering
  (`renderToString` issues no request and logs no warning).
