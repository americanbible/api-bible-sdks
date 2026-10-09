# Design note: async client

Status: **proposed, not implemented.** The README says an async client is
planned. This note records the intended approach so the work can be picked up
without re-deriving it.

## Goal

`AsyncBibleClient` has the same constructor arguments, resources, method
signatures, errors, models and observers as `BibleClient`. Methods are
awaited, and the client is closed with `async with` / `aclose()`:

```python
async with AsyncBibleClient.from_env() as client:
    bibles = await client.bibles.list(language="eng")
```

Retry, timeout, redirect, size-cap and api-key behaviour must be **identical**
between the two clients, so the SDK can't ever behave one way sync and another
way async.

## Approach

### 1. Pull a pure retry core out of `Transport.request`

Today `Transport.request` (in `_http.py`) interleaves I/O with every policy
decision. Split it so that all decisions live in pure functions or a small state
object that both transports call:

- **Already pure, reused as-is:** `backoff_delay`, `parse_retry_after`,
  `next_retry_delay`, `_error_for_status`, `_extract_message`,
  `_redirect_error`, `expand_route`, `to_query`.
- **New:** a function like `_decide(attempt, outcome, retry_after, deadline,
  now, config)`. It returns *return the body*, *raise this error*, or *retry
  after N seconds with this reason*. It owns:
  - the retryable-status rule,
  - the `Retry-After` ceiling,
  - the `max_elapsed` budget,
  - the last-attempt give-up,
  - the oversize and redirect cases.
- **Shared helpers:** `_Call`, event emission (`_emit`/`_emit_retry`), log
  `extra` fields and `_error_headers` move to a small base or mixin, so the
  events and log records are the same for both clients.

Each transport then only implements three I/O steps: send the request and read
the body under the size cap, sleep, and close.

| Step | `Transport` (sync) | `AsyncTransport` |
| --- | --- | --- |
| client | `httpx.Client` | `httpx.AsyncClient` |
| send | `client.send(..., stream=True)` | `await client.send(..., stream=True)` |
| read body | `iter_bytes()` | `aiter_bytes()` |
| sleep | `time.sleep` | `asyncio.sleep` (via `anyio.sleep`, so trio works too) |
| auth | `_ApiKeyAuth.sync_auth_flow` | `_ApiKeyAuth.async_auth_flow`, which must wrap the inner auth the same way |

Do the extraction as its own PR **first**, with the sync tests unchanged. A
behaviour-preserving refactor is much easier to review without new features in
the same diff.

### 2. `AsyncTransport` and `last_meta`

`AsyncTransport` lives next to `Transport` in `_http.py`. `last_meta` can't use
`threading.local` in async code, because many tasks share one thread. It moves
to a `contextvars.ContextVar`, which is correct per task and also works for the
sync client. The `*_with_meta` methods remain the recommended way to get FUMS
metadata.

### 3. Resources

The eight resource classes are thin: build a route and params, call the
transport, unwrap `.data`. Write the async versions by hand
(`AsyncBiblesResource`, …) next to the sync ones, with `_AsyncBaseResource`
providing `_content_get`.

To stop them drifting apart, add a **parity test**: for every public method on
every sync resource, assert that the async class has the same name, parameters,
defaults and return annotation (with `Awaitable` unwrapped).

If the duplication becomes painful, switch to `unasync`-style generation (write
async, generate sync, and fail CI if the generated files are stale), which is
what httpcore does. Not needed at the current size.

### 4. Observers

`on_request` and `on_retry` stay plain callables, called inline from the event
loop, so they must not block. Accepting `async def` observers can come later if
asked for. That change would be additive.

## Testing

- `httpx.MockTransport` accepts async handlers, and the `anyio` pytest plugin
  ships with `anyio`, which is already a dependency through httpx. So no new
  test dependency is needed. Run the async tests on both asyncio and trio.
- Parametrize the existing transport tests over both clients where the
  behaviour is shared (retries, Retry-After, budget, redirects, size cap, header
  precedence, logging fields).
- Replay the offline contract fixtures through both clients.
- The coverage ratchet (100%) applies to the new code.

## Release

Additive, so it's a **minor** release. Document `AsyncBibleClient` in the
README next to `BibleClient`, and add a CHANGELOG `Added` entry.

## Out of scope

Sync-over-async wrappers, and running sync observers in a thread pool.
