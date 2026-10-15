"""Private HTTP transport: request execution, retry/backoff, error mapping.

The retry math (:func:`backoff_delay`, :func:`parse_retry_after`,
:func:`next_retry_delay`) and every retry decision (``_classify_error``,
``_classify_response``, ``_next_step``) are pure functions, so they can be
unit-tested in isolation and shared by every transport. Observer events and log
records come from ``_TransportBase``. Only :class:`Transport` touches the network.
"""

from __future__ import annotations

import json
import logging
import random
import threading
import time
import uuid
from collections.abc import Callable, Generator, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Literal, TypeVar, cast

import httpx
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from ._serialize import expand_route
from ._version import __version__
from .errors import (
    ApiError,
    AuthError,
    BadRequestError,
    ConflictError,
    InvalidInputError,
    NetworkError,
    NotFoundError,
    RateLimitError,
    ServerError,
    UnprocessableEntityError,
    ValidationError,
)
from .models import Meta

__all__ = [
    "Transport",
    "RetryConfig",
    "RequestEvent",
    "RequestObserver",
    "RetryEvent",
    "RetryObserver",
    "DEFAULT_BASE_URL",
    "DEFAULT_TIMEOUT",
    "DEFAULT_MAX_RESPONSE_BYTES",
]

DEFAULT_BASE_URL = "https://rest.api.bible/v1"
DEFAULT_TIMEOUT = 10.0
# Cap on a single response body. api.bible payloads are small (scripture text and
# metadata); a response far larger than this is a misconfiguration or a hostile
# endpoint, and buffering it would risk exhausting memory. 10 MiB leaves generous
# headroom for the largest legitimate response.
DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024
_BODY_PREVIEW_LIMIT = 4096
# Response headers kept off ApiError.headers. Errors travel further than observer
# events (logs, error trackers), so headers that can carry a session cookie or a
# URL with credentials in its query string are dropped.
_ERROR_HEADER_DENYLIST = frozenset({"set-cookie", "set-cookie2", "location", "content-location"})
_USER_AGENT = f"api-bible-sdk-python/{__version__}"

# Library logger. The package installs a NullHandler so it stays silent unless
# the application opts in. It never logs the api-key, the query string or
# response bodies. Records carry `api_bible_*` fields (see `Transport._log_extra`)
# for structured/JSON handlers; the prefix keeps them from clashing with fields
# an application's own log filters add (e.g. the inbound request's `path`).
logger = logging.getLogger("api_bible")

ModelT = TypeVar("ModelT", bound=BaseModel)
Jitter = Callable[[], float]


@dataclass(frozen=True)
class RequestEvent:
    """A single HTTP attempt, handed to an ``on_request`` observer.

    Emitted once per attempt, so a call that retries emits several events. The
    consuming application turns these into telemetry: build a latency histogram
    (and read P99) from ``elapsed_ms``, count outcomes by ``status_code``, and
    track retries via ``attempt``. Tag metrics by ``route``, the path template
    (``"/bibles/{bible_id}/verses/{verse_id}"``), not by ``path``: ``path`` holds
    the concrete ids, so as a metric label it creates one series per id.
    ``status_code`` is ``None`` when the attempt never received a response
    (timeout or transport failure); ``error`` then holds a short reason.
    ``headers`` carries the response headers when one arrived (``None``
    otherwise), so an app can read rate-limit headers such as
    ``X-RateLimit-Remaining`` to throttle proactively. ``call_id`` is shared by
    every event (request and retry) of one logical call, so grouping by it
    yields end-to-end latency including retries and backoff. The SDK never
    measures latency itself — this is the seam through which an app
    instruments it.
    """

    method: str
    path: str
    status_code: int | None
    elapsed_ms: float
    attempt: int  # 1-based
    error: str | None = None
    headers: Mapping[str, str] | None = None
    route: str = ""  # path template; always set by the SDK
    call_id: str = ""  # same for every event of one call; always set by the SDK


# Observer invoked once per HTTP attempt. May be called concurrently when a
# single client is shared across threads, so an implementation must be
# thread-safe. Exceptions it raises are caught and logged, never propagated.
RequestObserver = Callable[["RequestEvent"], None]


@dataclass(frozen=True)
class RetryEvent:
    """A decision to retry a failed attempt, handed to an ``on_retry`` observer.

    Fired once per *retry* (not per attempt), immediately before the backoff
    sleep — so a call that ends up making N attempts emits N-1 retry events. The
    consuming application turns these into telemetry the per-attempt
    :class:`RequestEvent` can't express: count retries, and build a backoff
    histogram from ``delay_ms``. ``reason`` is a short label for the failure that
    triggered the retry (``"HTTP 503"``, ``"request timed out"``,
    ``"network error"``); ``retry_after_ms`` is the server's ``Retry-After`` hint
    in milliseconds when one was sent, else ``None``. As with
    :class:`RequestEvent`, tag metrics by ``route`` rather than ``path``;
    ``call_id`` equals that of the same call's request events. A give-up
    (attempts exhausted, budget spent, or ``Retry-After`` past the ceiling) emits
    no event — it surfaces as the raised exception and the final
    :class:`RequestEvent`.
    """

    method: str
    path: str
    attempt: int  # 1-based attempt that just failed
    delay_ms: float  # wait scheduled before the next attempt
    reason: str
    retry_after_ms: float | None = None
    route: str = ""  # path template; always set by the SDK
    call_id: str = ""  # same for every event of one call; always set by the SDK


# Observer invoked once per retry, just before the backoff sleep. Same threading
# and exception-safety contract as :data:`RequestObserver`.
RetryObserver = Callable[["RetryEvent"], None]


@dataclass(frozen=True)
class RetryConfig:
    """Retry policy for transient failures (429, 5xx, network, timeout).

    Uses full-jitter exponential backoff. ``jitter`` returns a value in ``[0, 1)``
    and can be overridden (e.g. ``lambda: 0``) to make tests deterministic.

    ``max_delay`` caps the client-computed backoff. ``max_retry_after`` separately
    caps how long a server ``Retry-After`` is honored: a longer one is obeyed up to
    this bound, and a ``Retry-After`` beyond it makes the request give up rather
    than burn an attempt on a multi-minute sleep.

    ``max_elapsed`` bounds the total wall-clock a single call spends across
    attempts: before each backoff sleep, if waiting would exceed the budget the
    call gives up instead. It bounds retry *scheduling*, not an in-flight request —
    a single attempt is still bounded by the client ``timeout``. It defaults to
    60s so a naive caller can't have a worker thread parked for minutes during a
    rate-limit storm; pass ``None`` to disable the budget entirely. Because it is
    a hard ceiling, a single ``Retry-After`` at/above the budget is *not* slept
    through — the call gives up and the wait is surfaced on
    :attr:`~api_bible.RateLimitError.retry_after` for the caller to honor
    out-of-process (e.g. requeue) rather than blocking the thread.
    """

    max_attempts: int = 3
    base_delay: float = 0.5
    max_delay: float = 30.0
    max_retry_after: float = 60.0
    max_elapsed: float | None = 60.0
    jitter: Jitter = random.random

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise InvalidInputError("max_attempts must be >= 1")
        if self.base_delay < 0:
            raise InvalidInputError("base_delay must be >= 0")
        if self.max_delay < 0:
            raise InvalidInputError("max_delay must be >= 0")
        if self.max_retry_after < 0:
            raise InvalidInputError("max_retry_after must be >= 0")
        if self.max_elapsed is not None and self.max_elapsed <= 0:
            raise InvalidInputError("max_elapsed must be > 0")


def backoff_delay(attempt: int, config: RetryConfig) -> float:
    """Full-jitter exponential backoff, in seconds, for a 0-based retry index."""
    ceiling = min(config.base_delay * (2.0**attempt), config.max_delay)
    return config.jitter() * ceiling


def parse_retry_after(value: str | None) -> float | None:
    """Parse a ``Retry-After`` header into seconds.

    Supports both forms in the spec: delta-seconds (``"120"``) and an HTTP-date
    (``"Wed, 21 Oct 2015 07:28:00 GMT"``). Returns ``None`` if absent/unparseable.
    """
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None

    try:
        seconds = float(value)
    except ValueError:
        pass
    else:
        return max(0.0, seconds)

    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    # A `-0000` zone ("UTC, source unknown") parses to a naive datetime.
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return max(0.0, (when - datetime.now(timezone.utc)).total_seconds())


def next_retry_delay(attempt: int, retry_after: float | None, config: RetryConfig) -> float:
    """Seconds to wait before the next attempt.

    Without a server ``Retry-After`` this is jittered backoff (capped at
    ``max_delay``). With one, the server value is honored as a floor — plus a
    little jitter for spread — bounded by ``max_retry_after``.
    """
    jittered = backoff_delay(attempt, config)
    if retry_after is None:
        return jittered
    return min(retry_after + jittered, config.max_retry_after)


def _is_retryable(status_code: int) -> bool:
    return status_code == 429 or status_code >= 500


def _is_redirect(status_code: int) -> bool:
    return 300 <= status_code < 400


def _redirect_error(response: httpx.Response, headers: Mapping[str, str]) -> ApiError:
    """Turn a suppressed redirect into a self-explanatory error.

    httpx already defaults ``follow_redirects=False``, and we keep it that way:
    the ``api-key`` header would travel with a redirect, handing the caller's key
    to whatever host the ``Location`` names. Without this branch a 3xx falls
    through to ``_parse`` and surfaces as a misleading "empty response body".
    """
    target = "an undisclosed host"
    location = response.headers.get("location")
    if location:
        # Origin only. A Location URL can carry credentials in its query string,
        # and this message may well end up in someone's logs.
        url = httpx.URL(location)
        if url.host:
            target = f"{url.scheme}://{url.host}" if url.scheme else url.host
    return ApiError(
        f"api.bible responded with a redirect (HTTP {response.status_code}) to {target}. "
        "The SDK does not follow redirects: the api-key header would be resent to the "
        "redirect target, disclosing your key.",
        status_code=response.status_code,
        headers=headers,
    )


class _ApiKeyAuth(httpx.Auth):
    """Sets the ``api-key`` header at send time, after every other header layer.

    Holding the key here instead of in a headers dict keeps it out of
    ``Transport.request``'s frame locals, which error trackers such as Sentry
    capture and may not scrub under a hyphenated name. ``inner`` is the auth of
    a caller-supplied ``http_client`` (if any); it still runs, and the key is
    re-applied to every request it yields so the key always wins.
    """

    def __init__(self, api_key: str, inner: httpx.Auth | None = None) -> None:
        self._api_key = api_key
        self._inner = inner

    def __repr__(self) -> str:
        return "_ApiKeyAuth(api_key='[redacted]')"

    def auth_flow(self, request: httpx.Request) -> Generator[httpx.Request, httpx.Response, None]:
        request.headers["api-key"] = self._api_key
        yield request

    def sync_auth_flow(
        self, request: httpx.Request
    ) -> Generator[httpx.Request, httpx.Response, None]:
        if self._inner is None:
            yield from self.auth_flow(request)
            return
        flow = self._inner.sync_auth_flow(request)
        try:
            outgoing = next(flow)
            while True:
                outgoing.headers["api-key"] = self._api_key
                response = yield outgoing
                outgoing = flow.send(response)
        except StopIteration:
            return


@dataclass(frozen=True)
class _Call:
    """Identity of one logical call, shared by every event it emits."""

    method: str
    path: str
    route: str
    call_id: str


# --- retry core ---------------------------------------------------------------
#
# Every policy decision a call makes lives here, free of I/O, so a transport's
# request loop only sends, reads, sleeps and closes. An attempt is first
# classified (`_classify_error` / `_classify_response`) as a terminal `_Return` or
# `_Raise`, or as a `_Failure` that may be retried; `_next_step` then decides
# between giving up and retrying after a delay.


@dataclass(frozen=True)
class _Return:
    """The attempt succeeded: hand ``body`` to ``_parse``."""

    body: bytes


@dataclass(frozen=True)
class _Raise:
    """The attempt failed terminally: raise ``error``, never retried.

    ``cause`` is the ``raise ... from`` target for a transport exception
    (``None`` suppresses the original, e.g. one that quotes a header value).
    """

    error: ApiError
    cause: BaseException | None = None


@dataclass(frozen=True)
class _Failure:
    """A failed attempt that may be retried.

    ``reason`` labels it in log records and :attr:`RetryEvent.reason`.
    ``status_code`` is ``None`` when no response arrived.
    """

    error: ApiError
    reason: str
    status_code: int | None = None
    retry_after: float | None = None


_GiveUpReason = Literal["retry_after", "attempts", "budget"]


@dataclass(frozen=True)
class _GiveUp:
    """Stop retrying and raise ``failure.error``; ``why`` selects the log record."""

    failure: _Failure
    why: _GiveUpReason


@dataclass(frozen=True)
class _Retry:
    """Retry ``failure`` after sleeping ``delay`` seconds."""

    failure: _Failure
    delay: float


def _classify_error(
    exc: httpx.HTTPError, redact: Callable[[BaseException], str]
) -> tuple[str, _Raise | _Failure]:
    """Classify a transport exception. Returns the observer's ``error`` label too."""
    if isinstance(exc, httpx.PoolTimeout):
        # Pool exhaustion is a local capacity problem, not a transient upstream
        # blip: retrying just adds more pending requests and deepens the
        # starvation. Fail fast so load sheds instead.
        return "pool timeout", _Raise(
            NetworkError(
                f"connection pool timed out waiting for a free connection: {exc}. "
                "Too many concurrent requests for the pool; raise httpx.Limits "
                "or reduce concurrency."
            ),
            cause=exc,
        )
    if isinstance(exc, httpx.TimeoutException):
        return "timeout", _Failure(
            NetworkError(f"request timed out: {redact(exc)}"), "request timed out"
        )
    if isinstance(exc, httpx.LocalProtocolError):
        # Raised before any byte is sent, when a request header is not a legal
        # HTTP value. Deterministic, so not retried. h11's message quotes the
        # offending value (possibly the api-key), so neither the message nor the
        # cause is propagated.
        return "invalid header", _Raise(
            NetworkError(
                "request could not be sent: a request header has an illegal value "
                "(value not shown to avoid disclosing credentials)"
            ),
            cause=None,
        )
    return "network error", _Failure(NetworkError(f"network error: {redact(exc)}"), "network error")


def _classify_response(
    response: httpx.Response,
    body: bytes | None,
    *,
    max_response_bytes: int | None,
    error_headers: Callable[[httpx.Response], dict[str, str]],
) -> _Return | _Raise | _Failure:
    """Classify a response. ``body`` is ``None`` when it crossed ``max_response_bytes``."""
    if body is None:
        # Deterministic, so not retried.
        return _Raise(
            ApiError(
                f"response exceeded max_response_bytes ({max_response_bytes} bytes)",
                status_code=response.status_code,
                headers=error_headers(response),
            )
        )
    # Terminal by design: a redirect is a configuration change, not a transient
    # fault, so retrying it would just resend the key.
    if _is_redirect(response.status_code):
        return _Raise(_redirect_error(response, error_headers(response)))
    if response.status_code < 400:
        return _Return(body)
    error = _error_for_status(response, body, error_headers(response))
    if not _is_retryable(response.status_code):
        return _Raise(error)
    return _Failure(error, f"HTTP {response.status_code}", response.status_code, error.retry_after)


def _next_step(
    attempt: int,
    failure: _Failure,
    *,
    config: RetryConfig,
    deadline: float | None,
    now: Callable[[], float],
) -> _GiveUp | _Retry:
    """Decide whether a failed attempt (0-based ``attempt``) is retried.

    ``now`` is the monotonic clock, read only for the ``max_elapsed`` check.
    """
    retry_after = failure.retry_after
    # If the server asks us to wait longer than we're willing to honor, give up
    # now rather than burn an attempt on a long sleep.
    if retry_after is not None and retry_after > config.max_retry_after:
        return _GiveUp(failure, "retry_after")
    if attempt == config.max_attempts - 1:
        return _GiveUp(failure, "attempts")
    delay = next_retry_delay(attempt, retry_after, config)
    # Give up rather than sleep past the caller's total-time budget.
    if deadline is not None and now() + delay > deadline:
        return _GiveUp(failure, "budget")
    return _Retry(failure, delay)


class _CappedBody:
    """Accumulates a streamed body, refusing to grow past ``cap`` bytes."""

    def __init__(self, cap: int | None) -> None:
        self._cap = cap
        self._chunks: list[bytes] = []
        self._total = 0

    def add(self, chunk: bytes) -> bool:
        """Append ``chunk``; ``False`` once the cap is crossed (stop reading)."""
        self._total += len(chunk)
        if self._cap is not None and self._total > self._cap:
            return False
        self._chunks.append(chunk)
        return True

    def getvalue(self) -> bytes:
        return b"".join(self._chunks)


class _TransportBase:
    """Configuration and side effects shared by every transport.

    Observer events, log records, error headers and response parsing live here,
    so each transport only implements send, read, sleep and close.
    """

    def __init__(
        self,
        api_key: str,
        *,
        retry: RetryConfig | None,
        headers: dict[str, str] | None,
        on_request: RequestObserver | None,
        on_retry: RetryObserver | None,
        max_response_bytes: int | None,
    ) -> None:
        if max_response_bytes is not None and max_response_bytes <= 0:
            raise InvalidInputError("max_response_bytes must be > 0 (or None to disable)")
        self._api_key = api_key
        self._retry = retry or RetryConfig()
        self._on_request = on_request
        self._on_retry = on_retry
        self._max_response_bytes = max_response_bytes
        extra = dict(headers or {})
        # Identify SDK traffic to api.bible, unless the caller set their own UA.
        if not any(name.lower() == "user-agent" for name in extra):
            extra["User-Agent"] = _USER_AGENT
        self._extra_headers = extra

    def _deadline(self) -> float | None:
        """Monotonic time by which a call must stop scheduling retries, if any."""
        if self._retry.max_elapsed is None:
            return None
        return time.monotonic() + self._retry.max_elapsed

    def _log_attempt(self, call: _Call, attempt: int) -> None:
        logger.debug(
            "%s %s (attempt %d/%d)",
            call.method,
            call.path,
            attempt + 1,
            self._retry.max_attempts,
            extra=self._log_extra(call, attempt + 1),
        )

    def _observe_response(
        self,
        call: _Call,
        attempt: int,
        response: httpx.Response,
        body: bytes | None,
        elapsed_ms: float,
    ) -> None:
        """Log and emit an attempt that received a response."""
        if body is None:
            # Over max_response_bytes: a response did arrive, so the attempt is
            # still observed before the error propagates.
            self._emit(
                call,
                response.status_code,
                elapsed_ms,
                attempt,
                "response too large",
                dict(response.headers),
            )
            return
        status_code = response.status_code
        logger.debug(
            "%s %s -> %d in %.1fms (attempt %d/%d)",
            call.method,
            call.path,
            status_code,
            elapsed_ms,
            attempt + 1,
            self._retry.max_attempts,
            extra=self._log_extra(
                call, attempt + 1, status_code=status_code, elapsed_ms=elapsed_ms
            ),
        )
        self._emit(
            call,
            response.status_code,
            elapsed_ms,
            attempt,
            None,
            dict(response.headers),
        )

    def _log_give_up(self, call: _Call, attempt: int, step: _GiveUp) -> None:
        failure = step.failure
        if step.why == "retry_after":
            retry_after = cast(float, failure.retry_after)
            logger.warning(
                "%s %s: server Retry-After %.0fs exceeds max_retry_after %.0fs; giving up",
                call.method,
                call.path,
                retry_after,
                self._retry.max_retry_after,
                extra=self._log_extra(
                    call,
                    attempt + 1,
                    status_code=failure.status_code,
                    retry_after_ms=retry_after * 1000.0,
                ),
            )
        elif step.why == "attempts":
            logger.warning(
                "%s %s failed (%s); giving up after %d attempt(s)",
                call.method,
                call.path,
                failure.reason,
                self._retry.max_attempts,
                extra=self._log_extra(
                    call, attempt + 1, status_code=failure.status_code, reason=failure.reason
                ),
            )
        else:
            logger.warning(
                "%s %s failed (%s); giving up to stay within the max_elapsed budget",
                call.method,
                call.path,
                failure.reason,
                extra=self._log_extra(
                    call, attempt + 1, status_code=failure.status_code, reason=failure.reason
                ),
            )

    def _announce_retry(self, call: _Call, attempt: int, step: _Retry) -> None:
        """Emit the retry event and log record that precede the backoff sleep."""
        failure = step.failure
        retry_after = failure.retry_after
        self._emit_retry(
            call,
            attempt + 1,
            step.delay * 1000.0,
            failure.reason,
            None if retry_after is None else retry_after * 1000.0,
        )
        logger.warning(
            "%s %s failed (%s); retrying in %.2fs (attempt %d/%d)",
            call.method,
            call.path,
            failure.reason,
            step.delay,
            attempt + 2,
            self._retry.max_attempts,
            extra=self._log_extra(
                call,
                attempt + 1,
                status_code=failure.status_code,
                reason=failure.reason,
                delay_ms=step.delay * 1000.0,
            ),
        )

    def _log_extra(self, call: _Call, attempt: int, **fields: Any) -> dict[str, Any]:
        """Structured fields for a log record's ``extra=``, all ``api_bible_``-prefixed.

        ``attempt`` is 1-based: the attempt the record is about (for a retry,
        the one that just failed, matching :class:`RetryEvent`). Only request
        metadata goes here — never the api-key, query string or a body.
        """
        base: dict[str, Any] = {
            "method": call.method,
            "path": call.path,
            "route": call.route,
            "call_id": call.call_id,
            "attempt": attempt,
            "max_attempts": self._retry.max_attempts,
            **fields,
        }
        return {f"api_bible_{name}": value for name, value in base.items()}

    def _error_headers(self, response: httpx.Response) -> dict[str, str]:
        """Response headers safe to keep on an :class:`ApiError`.

        Drops :data:`_ERROR_HEADER_DENYLIST` and, defensively, any header whose
        value contains the api-key (e.g. a proxy echoing request headers back).
        """
        return {
            name: value
            for name, value in response.headers.items()
            if name not in _ERROR_HEADER_DENYLIST and self._api_key not in value
        }

    def _redact(self, exc: BaseException) -> str:
        """Render a transport exception for an error message, minus the api-key."""
        return str(exc).replace(self._api_key, "[redacted]")

    def _emit(
        self,
        call: _Call,
        status_code: int | None,
        elapsed_ms: float,
        attempt: int,
        error: str | None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        """Hand a per-attempt event to the observer, never letting it break the call.

        ``attempt`` is the loop's 0-based index; the event exposes it 1-based.
        ``headers`` is the response headers, or ``None`` when no response arrived.
        """
        if self._on_request is None:
            return
        event = RequestEvent(
            method=call.method,
            path=call.path,
            status_code=status_code,
            elapsed_ms=elapsed_ms,
            attempt=attempt + 1,
            error=error,
            headers=headers,
            route=call.route,
            call_id=call.call_id,
        )
        try:
            self._on_request(event)
        except Exception:
            logger.exception(
                "on_request observer raised; ignoring", extra=self._log_extra(call, attempt + 1)
            )

    def _emit_retry(
        self,
        call: _Call,
        attempt: int,
        delay_ms: float,
        reason: str,
        retry_after_ms: float | None,
    ) -> None:
        """Hand a retry-decision event to the observer, never letting it break the call.

        ``attempt`` is the 1-based number of the attempt that just failed.
        """
        if self._on_retry is None:
            return
        event = RetryEvent(
            method=call.method,
            path=call.path,
            attempt=attempt,
            delay_ms=delay_ms,
            reason=reason,
            retry_after_ms=retry_after_ms,
            route=call.route,
            call_id=call.call_id,
        )
        try:
            self._on_retry(event)
        except Exception:
            logger.exception(
                "on_retry observer raised; ignoring", extra=self._log_extra(call, attempt)
            )

    def _parse(self, response: httpx.Response, body: bytes, model: type[ModelT]) -> ModelT:
        # A 2xx with no body or a non-JSON content type is not a valid API
        # response (e.g. an intercepting proxy's empty 200 or HTML error page).
        # Fail with a precise, deterministic error rather than a generic JSON
        # decode failure; like a 4xx body mismatch, this is not retried.
        if not body.strip():
            raise ApiError(
                "server returned an empty response body",
                status_code=response.status_code,
                headers=self._error_headers(response),
            )
        content_type = response.headers.get("content-type", "")
        if content_type and "json" not in content_type.lower():
            text = body.decode("utf-8", errors="replace")
            raise ApiError(
                f"expected a JSON response but received Content-Type {content_type!r}",
                status_code=response.status_code,
                body=text[:_BODY_PREVIEW_LIMIT],
                body_truncated=len(text) > _BODY_PREVIEW_LIMIT,
                headers=self._error_headers(response),
            )
        try:
            payload = json.loads(body)
        except ValueError as exc:
            text = body.decode("utf-8", errors="replace")
            raise ApiError(
                "expected a JSON response body",
                status_code=response.status_code,
                body=text[:_BODY_PREVIEW_LIMIT],
                body_truncated=len(text) > _BODY_PREVIEW_LIMIT,
                headers=self._error_headers(response),
            ) from exc

        try:
            return model.model_validate(payload)
        except PydanticValidationError as exc:
            raise ValidationError(
                "API response did not match the expected schema",
                errors=[dict(issue) for issue in exc.errors()],
            ) from exc


class Transport(_TransportBase):
    """Owns the httpx client and turns raw responses into validated models."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float | httpx.Timeout = DEFAULT_TIMEOUT,
        retry: RetryConfig | None = None,
        headers: dict[str, str] | None = None,
        client: httpx.Client | None = None,
        limits: httpx.Limits | None = None,
        on_request: RequestObserver | None = None,
        on_retry: RetryObserver | None = None,
        max_response_bytes: int | None = DEFAULT_MAX_RESPONSE_BYTES,
    ) -> None:
        super().__init__(
            api_key,
            retry=retry,
            headers=headers,
            on_request=on_request,
            on_retry=on_retry,
            max_response_bytes=max_response_bytes,
        )
        if client is not None:
            # A caller-supplied client owns its own timeout and pool limits.
            self._client = client
        else:
            client_kwargs: dict[str, Any] = {"base_url": base_url, "timeout": timeout}
            if limits is not None:
                client_kwargs["limits"] = limits
            self._client = httpx.Client(**client_kwargs)
        # Wraps any auth the caller's own client carries, so it keeps working.
        self._auth = _ApiKeyAuth(api_key, inner=self._client.auth)
        # Per-thread storage: httpx.Client is safe to share across threads, so a
        # shared BibleClient is the natural pattern. Keeping `meta` thread-local
        # stops one thread's response metadata from clobbering another's.
        self._local = threading.local()

    @property
    def last_meta(self) -> Meta | None:
        """FUMS metadata for the calling thread's most recent completed call.

        Reset to ``None`` at the start of every call, so a failed call never
        leaves a previous call's metadata visible. ``None`` if that call failed
        or its response carried no metadata.
        """
        return getattr(self._local, "meta", None)

    def request(
        self,
        method: str,
        route: str,
        *,
        model: type[ModelT],
        path_params: Mapping[str, str] | None = None,
        params: dict[str, str] | None = None,
        timeout: float | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ModelT:
        # Clear any prior call's metadata up front so a failure (which never
        # reaches `_parse`) can't leave a stale `last_meta` from an earlier call.
        self._local.meta = None
        # `route` is the template reported to observers; `path` is what's sent.
        # Expansion validates the ids, so a bad one fails before any I/O.
        path = expand_route(route, **(path_params or {}))
        call = _Call(method, path, route, uuid.uuid4().hex)

        # Client headers first, then per-request headers. The api-key is not in
        # here: `_ApiKeyAuth` sets it at send time, after both layers, so it can
        # never be overridden and never sits in a frame local.
        headers = {**self._extra_headers, **(extra_headers or {})}
        extra: dict[str, Any] = {}
        if timeout is not None:
            extra["timeout"] = timeout

        deadline = self._deadline()
        for attempt in range(self._retry.max_attempts):
            self._log_attempt(call, attempt)
            start = time.monotonic()
            try:
                # Stream the response so the body is read under our own size cap
                # (see `_read_body`) instead of being buffered whole by httpx. A
                # transport error mid-stream surfaces here and is handled below.
                request = self._client.build_request(
                    method, path, params=params, headers=headers, **extra
                )
                # follow_redirects=False per request, not just per client: a
                # caller-supplied http_client may have enabled it, and following
                # a redirect would resend the api-key to the target host.
                response = self._client.send(
                    request, auth=self._auth, stream=True, follow_redirects=False
                )
                try:
                    body = self._read_body(response)
                finally:
                    response.close()
            except httpx.HTTPError as exc:
                elapsed_ms = (time.monotonic() - start) * 1000.0
                label, failed = _classify_error(exc, self._redact)
                self._emit(call, None, elapsed_ms, attempt, label)
                if isinstance(failed, _Raise):
                    raise failed.error from failed.cause
                failure = failed
            else:
                elapsed_ms = (time.monotonic() - start) * 1000.0
                self._observe_response(call, attempt, response, body, elapsed_ms)
                verdict = _classify_response(
                    response,
                    body,
                    max_response_bytes=self._max_response_bytes,
                    error_headers=self._error_headers,
                )
                if isinstance(verdict, _Return):
                    result = self._parse(response, verdict.body, model)
                    self._local.meta = getattr(result, "meta", None)
                    return result
                if isinstance(verdict, _Raise):
                    raise verdict.error
                failure = verdict

            step = _next_step(
                attempt, failure, config=self._retry, deadline=deadline, now=time.monotonic
            )
            if isinstance(step, _GiveUp):
                self._log_give_up(call, attempt, step)
                raise step.failure.error
            self._announce_retry(call, attempt, step)
            if step.delay > 0:
                time.sleep(step.delay)

        # RetryConfig enforces max_attempts >= 1 and `_next_step` gives up on the
        # last attempt, so the loop always returns or raises. Guard explicitly
        # rather than `assert` so the invariant holds under `python -O`.
        raise RuntimeError("retry loop exited without a result")  # pragma: no cover

    def _read_body(self, response: httpx.Response) -> bytes | None:
        """Read the response body into memory, bounded by ``max_response_bytes``.

        Reads incrementally and stops as soon as the cap is crossed, so an
        over-large (or hostile) body never gets fully buffered. Returns ``None``
        in that case, which ``_classify_response`` turns into a non-retried
        :class:`ApiError`.
        """
        buffer = _CappedBody(self._max_response_bytes)
        for chunk in response.iter_bytes():
            if not buffer.add(chunk):
                return None
        return buffer.getvalue()

    def close(self) -> None:
        self._client.close()


def _error_for_status(
    response: httpx.Response, body: bytes, headers: Mapping[str, str]
) -> ApiError:
    status = response.status_code
    text = body.decode("utf-8", errors="replace")
    preview = text[:_BODY_PREVIEW_LIMIT]
    truncated = len(text) > _BODY_PREVIEW_LIMIT
    message = _extract_message(body) or f"HTTP {status}"
    retry_after = parse_retry_after(response.headers.get("retry-after"))

    cls: type[ApiError]
    if status in (401, 403):
        cls = AuthError
    elif status == 400:
        cls = BadRequestError
    elif status == 404:
        cls = NotFoundError
    elif status == 409:
        cls = ConflictError
    elif status == 422:
        cls = UnprocessableEntityError
    elif status == 429:
        cls = RateLimitError
    elif status >= 500:
        cls = ServerError
    else:
        cls = ApiError

    return cls(
        message,
        status_code=status,
        body=preview,
        body_truncated=truncated,
        retry_after=retry_after,
        headers=headers,
    )


def _extract_message(body: bytes) -> str | None:
    try:
        data: Any = json.loads(body)
    except ValueError:
        return None
    if isinstance(data, dict):
        message = data.get("message")
        if isinstance(message, str):
            return message
        error = data.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return str(error["message"])
    return None
