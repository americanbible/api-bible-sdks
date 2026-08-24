# api-bible-sdk (Python)

A production-quality Python SDK for [api.bible](https://api.bible/).

- Synchronous client with attribute-style resources (`client.bibles.list(...)`)
- API-key authentication
- Automatic retries with full-jitter exponential backoff (honors `Retry-After`), bounded by a total-time budget
- Typed [Pydantic v2](https://docs.pydantic.dev/) models — full type hints, validated responses
- A granular exception hierarchy
- Requires **Python 3.10+**

> Runtime dependencies: `httpx` and `pydantic>=2`. Installing this SDK pins your
> environment to Pydantic v2.

## Install

```bash
pip install americanbible-api-bible-sdk
```

## Quickstart

```python
from api_bible import BibleClient

with BibleClient.from_env() as client:  # reads API_BIBLE_KEY (or BIBLE_API_KEY)
    bibles = client.bibles.list(language="eng")
    for bible in bibles:
        print(bible.id, bible.name)

    bible = client.bibles.get(bibles[0].id)
    print(bible.abbreviation)
```

Or pass the key explicitly:

```python
client = BibleClient(api_key="your-key-here")
```

## Error handling

```python
from api_bible import ApiError, BibleClient, NotFoundError

with BibleClient.from_env() as client:
    try:
        client.bibles.get("does-not-exist")
    except NotFoundError:
        print("no such bible")
    except ApiError as exc:           # catches every HTTP failure
        print(exc.status_code, exc)
```

Hierarchy: `BibleError` → `ApiError` → {`AuthError`, `BadRequestError`,
`NotFoundError`, `ConflictError`, `UnprocessableEntityError`, `RateLimitError`,
`ServerError`, `NetworkError`}, plus `InvalidInputError` (bad caller input) and
`ValidationError` (response did not match the schema). `RateLimitError` (429) and `ServerError` (5xx) are retried
automatically. A `2xx` response that is empty or carries a non-JSON
`Content-Type` (e.g. a proxy's HTML error page) is treated as a failure and
raised as `ApiError` — it is not retried.

> **Note:** the `sections` endpoints (`sections.list_for_book` /
> `sections.list_for_chapter`) return `404` — surfaced as `NotFoundError` — for a
> book or chapter that has no section data, rather than an empty list. Wrap them in
> `try/except NotFoundError` when a book may lack sections.

**Redirects are not followed.** Every request is sent with
`follow_redirects=False`, including when you supply your own `httpx.Client`, and a
3xx response raises `ApiError` naming the redirect target's origin rather than
being followed. The `api-key` header would travel with a redirect, handing your
key to whatever host the `Location` names, and api.bible does not redirect in
normal operation — so a 3xx is worth looking at before the key goes out again.

When a `RateLimitError` propagates, the server's requested wait (if it sent one)
is available on the error so you can back off out-of-process:

```python
from api_bible import RateLimitError

try:
    client.bibles.list()
except RateLimitError as exc:
    print(exc.retry_after)  # seconds the server asked us to wait, or None
```

## Configuration

```python
from api_bible import BibleClient, RetryConfig

client = BibleClient(
    api_key="...",
    timeout=10.0,                       # per-attempt seconds
    retry=RetryConfig(
        max_attempts=5,
        base_delay=0.5,
        max_delay=30.0,                 # ceiling on client-computed backoff
        max_retry_after=60.0,           # longest server Retry-After we'll honor
        max_elapsed=60.0,               # total-time budget across retries (None disables)
    ),
)
```

## Response metadata (FUMS)

Every response carries optional FUMS analytics metadata (api.bible's usage
tracking). On current responses the populated field is `meta.fums_token` (the
token you submit to report fair use); the older JS-embed fields (`fums`,
`fums_js`, `fums_js_include`) are often absent. There are two ways to read it:

- `client.last_meta` — the `Meta` from the calling thread's most recent call (or
  `None` if it failed or carried none). Convenient for the single-call case, but
  it's overwritten by the next call on the thread.
- The `*_with_meta` methods on the content endpoints (`chapters`, `verses`,
  `passages`, `sections`) return a `Result[T]` pairing `data` with the `meta` from
  *that* response. Prefer these when correlation matters or across threads.

```python
with BibleClient.from_env() as client:
    # Convenience: metadata from the most recent call on this thread.
    chapter = client.chapters.get(bible_id, chapter_id)
    print(client.last_meta)

    # Reliable: metadata tied to this exact response.
    result = client.chapters.get_with_meta(bible_id, chapter_id)
    print(result.data.reference, result.meta)
```

## Using this SDK under load

The client is synchronous, and retries sleep on the calling thread
(`time.sleep`). A few things to know when running it under concurrency or inside
a request handler:

- **Total retry time is bounded.** `RetryConfig.max_elapsed` defaults to 60s, so a
  single call won't park a worker for minutes during a rate-limit storm. If a
  server `Retry-After` exceeds the budget, the call gives up and the wait is left
  on `RateLimitError.retry_after` so you can back off out-of-process (e.g. requeue)
  instead of blocking the thread.
- **Pool timeouts fail fast.** A connection-pool timeout is *not* retried (that
  would only deepen the starvation). For high concurrency, size the pool with
  `limits`, and use an `httpx.Timeout` for per-phase (connect/read/write/pool)
  control:

  ```python
  import httpx
  from api_bible import BibleClient

  client = BibleClient(
      api_key="...",
      timeout=httpx.Timeout(10.0, connect=5.0),
      limits=httpx.Limits(max_connections=200, max_keepalive_connections=50),
  )
  ```

  Passing your own `http_client=httpx.Client(...)` still works and takes full
  control of the pool; in that case the client owns `timeout`/`limits` and the
  ones above are ignored.

- **Share one client.** `BibleClient` and its underlying `httpx.Client` are safe to
  share across threads — reuse a single instance so connection pooling kicks in.
- **Response bodies are size-capped.** Each response is streamed and read under a
  limit (`max_response_bytes`, default 10 MiB); a body that exceeds it is aborted
  mid-stream with an `ApiError` rather than being buffered into memory. Raise the
  limit for unusually large payloads, or pass `max_response_bytes=None` to disable
  the cap entirely:

  ```python
  client = BibleClient(api_key="...", max_response_bytes=50 * 1024 * 1024)
  ```

- An async client is planned for a future release.

## Observability

The SDK logs to the `api_bible` logger (silent by default via a `NullHandler` —
configure a handler to see retry/give-up warnings and per-attempt debug lines).
It never logs the api-key or response bodies.

For metrics, pass an `on_request` observer. It's called once per HTTP attempt
(so a retried call fires several times) with a `RequestEvent` you can feed into
Prometheus/OpenTelemetry/StatsD — derive P99 from `elapsed_ms`, count outcomes
by `status_code`, track retries via `attempt`, and read the response `headers`
(e.g. rate-limit headers) to throttle proactively:

```python
from api_bible import BibleClient, RequestEvent

def on_request(event: RequestEvent) -> None:
    # status_code is None when the attempt never got a response (timeout/transport);
    # event.error then holds a short reason ("timeout", "network error", "pool timeout").
    metrics.histogram("api_bible.latency_ms", event.elapsed_ms, tags={"path": event.path})
    metrics.increment("api_bible.requests", tags={"status": event.status_code})
    # headers is None when no response arrived; keys are lower-cased.
    if event.headers and (remaining := event.headers.get("x-ratelimit-remaining")):
        metrics.gauge("api_bible.rate_limit_remaining", int(remaining))

client = BibleClient.from_env(on_request=on_request)
```

`on_request` fires per *attempt* but doesn't tell you when the SDK decides to
wait and retry. For that, pass an `on_retry` observer: it's called once per retry,
just before the backoff sleep, with a `RetryEvent` carrying the scheduled
`delay_ms`, the `reason` (`"HTTP 503"`, `"request timed out"`, `"network error"`),
and the server's `retry_after_ms` hint when present. Use it to count retries and
build a backoff histogram:

```python
from api_bible import BibleClient, RetryEvent

def on_retry(event: RetryEvent) -> None:
    metrics.increment("api_bible.retries", tags={"path": event.path, "reason": event.reason})
    metrics.histogram("api_bible.retry_delay_ms", event.delay_ms)

client = BibleClient.from_env(on_retry=on_retry)
```

A give-up (attempts exhausted, `max_elapsed` spent, or `Retry-After` past the
ceiling) emits no retry event — it surfaces as the raised exception and the final
`RequestEvent`.

Both observers must be thread-safe if you share the client across threads. Any
exception either raises is caught and logged — it can never break a request.

## Per-request headers

Every resource method accepts an optional `headers` mapping, applied to that one
request. Use it to propagate a distributed-tracing context or a correlation id
without building a separate client:

```python
client.chapters.get(
    "bba9f40183526463-01",
    "GEN.1",
    headers={"traceparent": ctx.traceparent},
)
```

Per-request headers override client-level `headers` of the same name, but can
never override the `api-key` — it is always applied last.

## Development

```bash
# Install against the pinned lockfile for a reproducible toolchain (what CI uses).
pip install -e ".[dev]" -c requirements-dev.txt
ruff check . && mypy && pytest --cov=api_bible
```

Runtime dependency ranges live in `pyproject.toml`; `requirements-dev.txt` is a
fully-pinned lockfile of the dev/CI environment. Regenerate it after changing
dependencies with [uv](https://docs.astral.sh/uv/):

```bash
uv pip compile pyproject.toml --extra dev --universal --python-version 3.10 \
  -o requirements-dev.txt
```

Dependencies are scanned weekly by Dependabot, and CI fails the build on any
known vulnerability via `pip-audit`.

### Contract tests

Two tiers share one case table ([tests/contract/cases.py](tests/contract/cases.py)):

- **Offline** ([test_contract_fixtures.py](tests/contract/test_contract_fixtures.py)) replays
  recorded responses through the real client so the Pydantic models validate them exactly as in
  production. Runs in PR CI as part of `pytest`.
- **Live** ([test_contract_live.py](tests/contract/test_contract_live.py)) hits api.bible to catch
  schema drift. Self-skips without a key; runs nightly. Run it with
  `API_BIBLE_KEY=... pytest -m live tests/contract/test_contract_live.py`.

Regenerate the fixtures from the live API with
`API_BIBLE_KEY=... python tests/contract/record_fixtures.py`.

## Releasing

This package is published to PyPI independently of the JavaScript packages in
this monorepo, via [PyPI Trusted Publishing](https://docs.pypi.org/trusted-publishers/)
(OIDC — no stored token). See [CHANGELOG.md](CHANGELOG.md) for release history.

To cut a release:

1. Bump `__version__` in [src/api_bible/\_version.py](src/api_bible/_version.py)
   (SemVer) and move the `[Unreleased]` notes in `CHANGELOG.md` under the new
   version.
2. Merge to `main`, then push a matching tag: `git tag py-v1.2.3 && git push
   origin py-v1.2.3`.
3. The `Python Release` workflow verifies the tag matches `__version__`, runs the
   full lint/type/test gate, builds, and publishes to PyPI. The tag will fail the
   build if it does not match the package version.

**Rollback.** PyPI releases are immutable and cannot be deleted or overwritten.
To roll back a bad release: **yank** it on PyPI (existing pins keep working, but
new installs skip it), then fix forward by publishing a patched `X.Y.Z+1`. Never
attempt to re-publish the same version.

---

## License and terms

Licensed under the Apache License 2.0 — Copyright 2026 American Bible Society.
See [LICENSE](LICENSE). That covers this SDK's source code, and nothing else.

Your use of the API is governed by api.bible's
[Terms & Conditions](https://api.bible/terms-and-conditions), and the scripture
text and audio it returns are licensed by their publishers and rights holders —
not by this package. Most translations carry attribution, usage, and reporting
obligations of their own. Read the terms before you ship.
