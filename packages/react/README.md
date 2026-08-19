# @americanbible/api-bible-sdk-react

React hooks and a context provider for [api.bible](https://api.bible/),
built on top of [`@americanbible/api-bible-sdk`](../typescript).

> Status: **Preview (v0.2).** A self-contained slice — a provider, a
> client accessor hook, and resource hooks (`useBibles`, `useBible`, `useBooks`,
> `useChapters`, `useChapter`, `usePassages`, `useSearch`, `useSectionsForBook`,
> `useSectionsForChapter`, `useSection`, `useVerses`, `useVerse`,
> `useAudioBibles`, `useAudioBible`, `useAudioBooks`, `useAudioBook`,
> `useAudioChapters`, `useAudioChapter`). No caching layer and no external
> data-fetching dependency yet; see the roadmap below.

## Install

```bash
npm install @americanbible/api-bible-sdk-react @americanbible/api-bible-sdk react
```

`react` (18 or 19) and `@americanbible/api-bible-sdk` are peer dependencies.

## Quick start

api.bible keys must not ship in browser bundles. The provider is designed for a
**server-side proxy**: point `baseUrl` at your own backend (which injects the
real key) and omit `apiKey` in the browser.

```tsx
import { ApiBibleProvider, useBooks } from '@americanbible/api-bible-sdk-react';

function App() {
  return (
    <ApiBibleProvider config={{ baseUrl: 'https://your-app.example/api/bible' }}>
      <BookList bibleId="bba9f40183526463-01" />
    </ApiBibleProvider>
  );
}

function BookList({ bibleId }: { bibleId: string }) {
  const { data, error, isLoading } = useBooks(bibleId);

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Failed to load books: {error.message}</p>;
  return (
    <ul>
      {data?.map((book) => (
        <li key={book.id}>{book.name}</li>
      ))}
    </ul>
  );
}
```

For a trusted server environment (SSR, scripts) you may pass an `apiKey`
directly, or hand the provider a pre-built client:

```tsx
import { createBibleClient } from '@americanbible/api-bible-sdk';

const client = createBibleClient({ apiKey: process.env.BIBLE_API_KEY! });

<ApiBibleProvider client={client}>{children}</ApiBibleProvider>;
```

> **The client is built once, when the provider mounts.** Changing the `config` or
> `client` prop afterward is ignored — to switch the api-key, `baseUrl`, or client,
> remount the provider (e.g. give it a `key` that changes). Building once keeps the
> client identity stable, so context consumers don't re-render and in-flight
> requests aren't dropped. In development, changing the prop logs a warning.

## API

- **`<ApiBibleProvider config | client>`** — builds and shares one client.
- **`useApiBible(): BibleClient`** — the shared client; use it to call any
  endpoint that does not yet have a dedicated hook.
- **`useBibles(params?)`** — lists available Bibles, optionally filtered by
  `language` / `abbreviation` / `name` / `ids` (`Bible[]`).
- **`useBible(bibleId)`** — a single Bible by id, with language, countries, and
  embedded audio-Bible references (`Bible`).
- **`useBooks(bibleId, params?)`** — the books of a Bible (`Book[]`).
- **`useChapters(bibleId, bookId)`** — lists a book's chapters (`ChapterSummary[]`).
- **`useChapter(bibleId, chapterId, params?)`** — a single chapter, optionally
  with rendered content (`params.contentType` = `'html' | 'text' | 'json'`).
- **`usePassages(bibleId, passageId, params?)`** — a single passage (an arbitrary
  verse range, e.g. `'JHN.3.16-JHN.3.17'`), optionally with rendered content
  (`params.contentType` = `'html' | 'text' | 'json'`).
- **`useSearch(bibleId, params, options?)`** — full-text search over a Bible
  (`params.query` is required; optional `limit`, `offset`, `sort`, `range`,
  `fuzziness`). Returns a paginated `SearchResult` (`total`, plus `verses` /
  `passages`); the hook stays idle until `query` is non-empty. Pass
  `options.debounceMs` to debounce search-as-you-type — a burst of keystrokes
  collapses to a single request once typing settles.
- **`useSectionsForBook(bibleId, bookId)`** — lists a book's section headings
  (`SectionSummary[]`).
- **`useSectionsForChapter(bibleId, chapterId)`** — lists a chapter's section
  headings (`SectionSummary[]`).
- **`useSection(bibleId, sectionId, params?)`** — a single section, optionally
  with rendered content (`params.contentType` = `'html' | 'text' | 'json'`).
- **`useVerses(bibleId, chapterId)`** — lists a chapter's verse summaries
  (`VerseSummary[]`).
- **`useVerse(bibleId, verseId, params?)`** — a single verse, optionally with
  rendered content (`params.contentType` = `'html' | 'text' | 'json'`).
- **`useAudioBibles(params?)`** — lists available audio Bibles, optionally
  filtered by `language` / `abbreviation` / `name` / `ids` (`AudioBibleSummary[]`).
- **`useAudioBible(audioBibleId)`** — a single audio Bible with copyright and
  info text (`AudioBible`).
- **`useAudioBooks(audioBibleId, params?)`** — lists an audio Bible's books
  (`AudioBookSummary[]`).
- **`useAudioBook(audioBibleId, bookId, params?)`** — a single audio book
  (`AudioBookSummary`).
- **`useAudioChapters(audioBibleId, bookId)`** — lists a book's audio chapter
  summaries (`AudioChapterSummary[]`).
- **`useAudioChapter(audioBibleId, chapterId)`** — a single audio chapter with a
  presigned, expiring `resourceUrl` (`AudioChapter`); call `refetch()` for a
  fresh URL.

### Hook result

Every resource hook returns the same `AsyncResource<T>`:

- **`data`** — the payload (`T`), or `undefined` until the first success.
- **`error`** — a typed SDK error (a `BibleError` subclass such as `NotFoundError`
  or `RateLimitError`; narrow with `instanceof`), or `undefined`. Cancellations are
  never surfaced here.
- **`status`** — `'idle' | 'loading' | 'success' | 'error'`.
- **`isLoading`** — `true` only on the first load, while there is no `data` yet. A
  background `refetch` keeps the previous `data` and leaves this `false`, so an
  `if (isLoading)` spinner never flashes over content already on screen.
- **`isFetching`** — `true` whenever a request is in flight, including a background
  `refetch`. Pair with `data` for stale-while-revalidate UIs (e.g. dim the current
  content while refetching).
- **`refetch()`** — imperatively re-run; always issues a fresh network call.

All types and error classes from the core SDK are re-exported, so
`import { NotFoundError, type Book } from '@americanbible/api-bible-sdk-react'`
works from a single package.

## Caching

These hooks **de-duplicate in-flight requests** — N components asking for the same
thing at the same moment share one network call — and **cancel** a request when
its inputs change or the component unmounts. What they do **not** do is cache
across time: there is no `staleTime`, no cache hit on remount, no background
revalidation. Every fresh mount issues a request.

That is fine for a lot of apps (the core SDK retries and backs off on rate
limits), but if the same data is re-rendered often — navigating back and forth,
tab switching, virtualized lists — put a caching layer in front. The hooks and a
query library compose cleanly because `useApiBible()` hands you the raw, typed
client: call it inside [TanStack Query](https://tanstack.com/query) (or
[SWR](https://swr.vercel.app/)) and keep the SDK's types, validation, retries,
and cancellation while the library adds the cache.

```tsx
import { useQuery } from '@tanstack/react-query';
import { useApiBible } from '@americanbible/api-bible-sdk-react';

// Cached, deduped, and revalidated by TanStack Query; api.bible types intact.
function useCachedBooks(bibleId: string) {
  const client = useApiBible();
  return useQuery({
    queryKey: ['books', bibleId],
    // TanStack passes an AbortSignal — forward it so cancellation still works.
    queryFn: ({ signal }) => client.books.list(bibleId, undefined, signal).then((r) => r.data),
    staleTime: 60 * 60 * 1000, // books rarely change — serve from cache for an hour
    enabled: Boolean(bibleId),
  });
}
```

Mount your query library's provider alongside `ApiBibleProvider` (order doesn't
matter). Reach for the built-in hooks when you want zero extra dependencies;
reach for this pattern when you need persistence, revalidation, or offline.

## Observability

Every hook runs on the core client's request pipeline, which exposes two optional
lifecycle callbacks. Pass them through the provider `config` to record latency,
count errors, or forward request metadata to your telemetry backend:

- **`onResponse(meta)`** — fires once per HTTP response, including every retried
  attempt and error responses. `meta` is `{ status, headers, attempt, url,
  durationMs }`.
- **`onRetry(meta)`** — fires on each retryable failure (`429` / `5xx` / network),
  including the final give-up (`willRetry: false`). `meta` is `{ attempt, delayMs,
  error, willRetry, durationMs }`.

Both receive only response metadata — **never your api-key or request headers** —
so they are safe to log, and any error they throw is swallowed by the core so
telemetry can't break a request. The `ResponseMeta` / `RetryMeta` types are
re-exported from this package.

```tsx
import { ApiBibleProvider } from '@americanbible/api-bible-sdk-react';

// `metrics` is your telemetry client (StatsD / OpenTelemetry / Prometheus / …).
<ApiBibleProvider
  config={{
    baseUrl: 'https://your-app.example/api/bible',
    onResponse: (meta) => {
      // durationMs is a monotonic per-attempt latency — record it and let your
      // backend compute percentiles (P50/P95/P99) rather than buffering samples.
      metrics.histogram('api_bible.request_ms', meta.durationMs, { status: meta.status });
      if (meta.status >= 500) metrics.increment('api_bible.server_error');
    },
    onRetry: (meta) => {
      // willRetry:false is the final give-up after retries are exhausted.
      if (!meta.willRetry) metrics.increment('api_bible.retries_exhausted');
    },
  }}
>
  {children}
</ApiBibleProvider>;
```

The callbacks are set once, when the provider builds its client (like all other
config).

## Rate limits

api.bible enforces per-key rate limits. Three layers keep you under them:

- **Reactive (automatic).** On a `429` the core SDK retries with full-jitter
  backoff and honors the server's `Retry-After`; a `RateLimitError` reaches
  `error` only after retries are exhausted. Nothing to configure.
- **Volume reduction (automatic).** In-flight de-duplication collapses concurrent
  identical requests into one call, and `useSearch`'s `debounceMs` coalesces
  search-as-you-type — both lower your request rate for free.
- **Proactive (opt-in).** The SDK does not throttle _before_ you hit the limit.
  For a batch or background workload, read the rate-limit headers off `onResponse`
  and pace yourself. api.bible returns `x-ratelimit-remaining`; treat it as
  advisory and confirm the exact semantics against a live response.

  ```tsx
  <ApiBibleProvider
    config={{
      baseUrl: 'https://your-app.example/api/bible',
      onResponse: (meta) => {
        const remaining = Number(meta.headers.get('x-ratelimit-remaining'));
        if (Number.isFinite(remaining) && remaining < 10) {
          // e.g. pause background refetches or surface a "slow down" banner
        }
      },
    }}
  >
    {children}
  </ApiBibleProvider>;
  ```

## Roadmap

In-flight request de-duplication and search debouncing ship today. Still to come:
a built-in cross-request cache (you can [add one yourself](#caching) now), more
resource hooks, and (optionally) a TanStack Query-backed engine. The internal
fetch primitive is the single seam those slot into — without changing any hook's
signature.

## Releasing

Maintainers: see [RELEASING.md](RELEASING.md) for the release flow (tag
`react-v<x.y.z>` → the [`react-release.yml`](../../.github/workflows/react-release.yml)
workflow publishes via OIDC with provenance) and the incident/rollback runbook.

---

## License and terms

MIT © American Bible Society — see [LICENSE](LICENSE). That covers this SDK's
source code, and nothing else.

Your use of the API is governed by api.bible's
[Terms & Conditions](https://api.bible/terms-and-conditions), and the scripture
text and audio it returns are licensed by their publishers and rights holders —
not by this package. Most translations carry attribution, usage, and reporting
obligations of their own. Read the terms before you ship.
