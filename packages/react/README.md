# @americanbible/api-bible-sdk-react

React hooks and a context provider for [api.bible](https://api.bible/),
built on top of [`@americanbible/api-bible-sdk`](../typescript).

> Status: **Pre-release — not yet published to npm.** A self-contained slice — a provider, a
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
real key) and omit `apiKey` in the browser. A path such as `'/api/bible'` is
resolved against the page's origin; an absolute `https://` URL works too.

```tsx
import { ApiBibleProvider, useBooks } from '@americanbible/api-bible-sdk-react';

function App() {
  return (
    <ApiBibleProvider config={{ baseUrl: '/api/bible' }}>
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

> **Configuration errors throw during render.** An invalid `config` — a plaintext
> `http://` `baseUrl` on a non-loopback host, out-of-range retry settings, or
> neither `config` nor `client` — throws an `InvalidInputError` (or `Error`)
> from the provider, as does calling a hook outside a provider. Those are
> programming errors, so they fail fast rather than surfacing in a hook's `error`.
> Put the provider under an [error boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
> so a bad deploy shows your fallback UI instead of a blank page. Request
> failures never throw; they arrive in each hook's `error`.

## Server-side proxy

The proxy holds the real api-key and forwards the SDK's requests to api.bible. A
careless proxy becomes an open relay for your key, so this reference version
(a Next.js route handler — the same shape works in any server using the Fetch
API):

- **injects the key server-side** and forwards none of the browser's headers
  (cookies, the SDK's placeholder `api-key`);
- **allowlists** `GET` requests under `/bibles` and `/audio-bibles` — every
  endpoint the SDK calls — and rejects encoded `/` or `\` in the path, so no
  request can reach another route with your key;
- **refuses redirects**, so the key is never replayed to another host;
- **passes back** `Retry-After` and `X-RateLimit-Remaining`, which the SDK's
  backoff and your `onResponse` hook read;
- **rate-limits per client IP**, so one visitor can't spend your whole quota.

```ts
// app/api/bible/[...path]/route.ts — runs on your server only.
const UPSTREAM = 'https://rest.api.bible/v1';
const PREFIX = '/api/bible'; // where this route is mounted
const ALLOWED = /^\/(bibles|audio-bibles)(\/|$)/;
const PASS_HEADERS = ['content-type', 'retry-after', 'x-ratelimit-remaining'];

// Fixed window per IP. In memory, so it counts per server instance — on
// serverless or multi-instance hosting, use your platform's rate limiting.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) for (const [key, w] of hits) if (w.resetAt <= now) hits.delete(key);
  const w = hits.get(ip);
  if (!w || w.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  return ++w.count > MAX_PER_WINDOW;
}

// Only GET is exported, so Next.js answers every other method with 405.
export async function GET(req: Request): Promise<Response> {
  // `URL` resolves `.` / `..` segments; encoded slashes survive it, so reject them.
  const { pathname, search } = new URL(req.url);
  const path = pathname.slice(PREFIX.length);
  if (!ALLOWED.test(path) || /%2f|%5c/i.test(path)) return new Response('Not found', { status: 404 });

  // Trust X-Forwarded-For only if your host sets it (Vercel, most load balancers do).
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } });
  }

  const upstream = await fetch(UPSTREAM + path + search, {
    headers: { 'api-key': process.env.BIBLE_API_KEY!, accept: 'application/json' },
    redirect: 'error',
  });
  const headers = new Headers();
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
```

Point the provider at it with `config={{ baseUrl: '/api/bible' }}`. If your app
sets a Next.js `basePath`, include it in both `PREFIX` and `baseUrl`.

## Next.js (App Router)

The hooks and provider are Client Component APIs (the package entry is marked
`'use client'`). Two rules follow:

**Mount the provider from your own Client Component.** A Server Component can
only pass serializable props to a Client Component, so `onSettled`,
`onResponse`, `onRetry`, or a pre-built `client` cannot be passed from
`app/layout.tsx` directly. Wrap the provider instead:

```tsx
// app/providers.tsx
'use client';

import type { ReactNode } from 'react';
import { ApiBibleProvider } from '@americanbible/api-bible-sdk-react';

export function Providers({ children }: { children: ReactNode }) {
  return <ApiBibleProvider config={{ baseUrl: '/api/bible' }}>{children}</ApiBibleProvider>;
}
```

```tsx
// app/layout.tsx (a Server Component)
import type { ReactNode } from 'react';
import { Providers } from './providers';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**In Server Components, use the core SDK directly.** Everything this package
re-exports becomes a client reference inside a Server Component, so
`createBibleClient` can't be called there and `instanceof NotFoundError` won't
match. Import from `@americanbible/api-bible-sdk` instead — on the server you can
use the key directly:

```tsx
// app/books/page.tsx (a Server Component)
import { createBibleClient, NotFoundError } from '@americanbible/api-bible-sdk';

const client = createBibleClient({ apiKey: process.env.BIBLE_API_KEY! });

export default async function BooksPage() {
  try {
    const { data: books } = await client.books.list('bba9f40183526463-01');
    return <ul>{books.map((book) => <li key={book.id}>{book.name}</li>)}</ul>;
  } catch (err) {
    if (err instanceof NotFoundError) return <p>Bible not found.</p>;
    throw err;
  }
}
```

During server rendering the hooks render their initial `loading` state and issue
no request; they fetch after hydration. Fetch in a Server Component (as above)
when the data should be in the initial HTML.

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

- **`data`** — the payload (`T`) for the current inputs, or `undefined` until it
  loads. Changing an input (an id, `params`) resets it to `undefined`, so one
  input's result is never shown for another; only `refetch()` keeps it.
- **`error`** — a typed SDK error (a `BibleError` subclass such as `NotFoundError`
  or `RateLimitError`; narrow with `instanceof`), or `undefined`. Cancellations are
  never surfaced here.
- **`status`** — `'idle' | 'loading' | 'success' | 'error'`.
- **`isLoading`** — `true` only on the first load for the current inputs (including
  after an input change), while there is no `data` yet. A
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
and any error they throw is swallowed by the core so telemetry can't break a
request. They can still carry user data, so don't log them wholesale:
`meta.url` includes the query string (a `useSearch` query is whatever the user
typed), and `RetryMeta.error` may hold up to 4 KB of the response body. Log
`new URL(meta.url).pathname` rather than the full URL, or use
[`onSettled`](#per-request-events-onsettled), whose events carry no user input.
The `ResponseMeta` / `RetryMeta` types are re-exported from this package.

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

### Per-request events: `onSettled`

`onResponse` / `onRetry` see individual HTTP attempts. To measure what your users
actually wait for — and to catch failures that never produce an HTTP response,
such as a `ValidationError` when the API's response shape drifts — pass
`onSettled` to the provider. It fires **once per network request a hook issued**:
components sharing a de-duplicated request produce one event, retries are folded
into it, and cancelled requests are not reported.

The event is `{ resourceKey, outcome, durationMs, error? }`. `resourceKey` is the
SDK operation (e.g. `'books.list'`), never ids, params, or URLs, so events carry
no user input (such as a search query). `durationMs` covers the whole request,
including the core's retries and backoff. Unlike `config`, `onSettled` may change
after mount; the latest one is used. Anything it throws is swallowed.

```tsx
import { ApiBibleProvider, ValidationError } from '@americanbible/api-bible-sdk-react';

<ApiBibleProvider
  config={{ baseUrl: '/api/bible' }}
  onSettled={(e) => {
    metrics.histogram('api_bible.hook_request_ms', e.durationMs, {
      op: e.resourceKey,
      outcome: e.outcome,
    });
    // Schema drift: the SDK and the live API disagree — worth an alert.
    if (e.error instanceof ValidationError) metrics.increment('api_bible.schema_drift', { op: e.resourceKey });
  }}
>
  {children}
</ApiBibleProvider>;
```

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

Licensed under the Apache License 2.0 — Copyright 2026 American Bible Society.
See [LICENSE](LICENSE). That covers this SDK's source code, and nothing else.

Your use of the API is governed by api.bible's
[Terms & Conditions](https://api.bible/terms-and-conditions), and the scripture
text and audio it returns are licensed by their publishers and rights holders —
not by this package. Most translations carry attribution, usage, and reporting
obligations of their own. Read the terms before you ship.
