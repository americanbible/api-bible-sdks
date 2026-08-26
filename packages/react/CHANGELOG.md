# Changelog

All notable changes to `@americanbible/api-bible-sdk-react` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-08-26

Requires core SDK **2.0.0**. The core's schema fixes widen two public types, and
because these hooks return the core's types directly, the break passes straight
through to consumers — see **Changed**.

### Added

- `isKeywordSearchResult` / `isReferenceSearchResult` are now re-exported from
  the core SDK. `/search` answers in one of two disjoint shapes depending on the
  query — a keyword query returns pagination plus `verses`, a scripture
  reference returns `passages` and no pagination — and nothing in the response
  says which. Narrow a `useSearch` result with these before reading either side.

### Changed

- **Peer dependency is now `@americanbible/api-bible-sdk` `^2.0.0`** (was
  `^1.1.0`). Required, not cosmetic: this package re-exports the two guards
  above, which do not exist in 1.1.0, and the old range would also have accepted
  a 1.2.0 core — handing consumers the widened types with no version signal.
- **`useSearch` inherits the core's `SearchResult` widening.** `result.data.total`
  is now `number | undefined`, so `data.total.toFixed()` no longer typechecks.
  Narrow with `isKeywordSearchResult`, which restores `total` as a non-optional
  `number`, or use `data.total ?? 0`. Runtime behaviour is unchanged for keyword
  searches. See the core 2.0.0 changelog for the full list of widened types.
- **License changed from MIT to Apache License 2.0.** Apache 2.0 adds an express
  patent grant and a patent-retaliation clause that MIT does not provide.
  Copyright remains American Bible Society. Already-published versions keep the
  license they were released under; this applies from the next release onward.

## [0.2.0] - 2026-08-06

### Added

- `useBibles(params?)` / `useBible(bibleId)` — list available Bibles / fetch a
  single Bible by id (`Bible[]` / `Bible`). Thin wrappers over
  `client.bibles.list` / `client.bibles.get`.
- `useChapters(bibleId, bookId)` — list a book's chapters (`ChapterSummary[]`).
  Thin wrapper over `client.chapters.list`.
- `useChapter(bibleId, chapterId, params?)` — fetch a single chapter, optionally
  with rendered content. Thin wrapper over `client.chapters.get`.
- `useVerses(bibleId, chapterId)` — list a chapter's verse summaries
  (`VerseSummary[]`). Thin wrapper over `client.verses.list`.
- `useVerse(bibleId, verseId, params?)` — fetch a single verse with rendered
  content. Thin wrapper over `client.verses.get`.
- `usePassages(bibleId, passageId, params?)` — fetch a single passage (an
  arbitrary verse range, e.g. `'JHN.3.16-JHN.3.17'`), optionally with rendered
  content. Thin wrapper over `client.passages.get`.
- `useSearch(bibleId, params, options?)` — full-text search over a Bible
  (`params.query` required). Pass `options.debounceMs` to debounce
  search-as-you-type. Thin wrapper over `client.search.search`.
- `useSectionsForBook(bibleId, bookId)` / `useSectionsForChapter(bibleId, chapterId)`
  — list a book's / chapter's section headings (`SectionSummary[]`). Thin wrappers
  over `client.sections.listForBook` / `client.sections.listForChapter`.
- `useSection(bibleId, sectionId, params?)` — fetch a single section with rendered
  content. Thin wrapper over `client.sections.get`.
- Audio Bible hooks — `useAudioBibles(params?)`, `useAudioBible(audioBibleId)`,
  `useAudioBooks(audioBibleId, params?)`,
  `useAudioBook(audioBibleId, bookId, params?)`,
  `useAudioChapters(audioBibleId, bookId)`, and
  `useAudioChapter(audioBibleId, chapterId)` — the audio catalog plus per-chapter
  presigned, expiring `resourceUrl`s (call `refetch()` for a fresh URL). Thin
  wrappers over `client.audioBibles.*`.
- In-flight request de-duplication — components requesting the same endpoint and
  params concurrently share one network call, ref-counted so it is cancelled only
  when the last subscriber unmounts.
- Stale-while-revalidate result fields on every hook: `status`
  (`'idle' | 'loading' | 'success' | 'error'`), `isLoading` (first load only),
  `isFetching` (true during a background refetch), and `refetch()`. The last
  successful `data` is retained while a refetch is in flight and through a failed
  refetch.
- Verified safe under React 18 and 19 StrictMode (double-invoked effects) and
  server-side rendering (`renderToString` issues no request and logs no warning).

## [0.1.0] - 2026-07-23

### Added

- Initial release: `ApiBibleProvider`, `useApiBible`, and `useBooks`.
- Self-contained data fetching — loading/error state and request cancellation
  on unmount/param change — with no external data-fetching dependency.
- Proxy-first configuration: omit `apiKey` and point `baseUrl` at your own
  backend so the real key never reaches the browser.
- Re-exports all types and error classes from `@americanbible/api-bible-sdk`.
