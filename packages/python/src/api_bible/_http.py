"""Private HTTP transport: request execution, retry/backoff, error mapping.

The retry math (:func:`backoff_delay`, :func:`parse_retry_after`,
:func:`next_retry_delay`) is kept as pure, side-effect-free functions so it can
be unit-tested in isolation and reused unchanged by a future async transport.
Only :class:`Transport` touches the network.
"""

from __future__ import annotations

import json
import logging
import random
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

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
_USER_AGENT = f"api-bible-sdk-python/{__version__}"

# Library logger. The package installs a NullHandler so it stays silent unless
# the application opts in. It never logs the api-key or response bodies.
logger = logging.getLogger("api_bible")

ModelT = TypeVar("ModelT", bound=BaseModel)
Jitter = Callable[[], float]


@dataclass(frozen=True)
class RequestEvent:
    """A single HTTP attempt, handed to an ``on_request`` observer.

    Emitted once per attempt, so a call that retries emits several events. The
    consuming application turns these into telemetry: build a latency histogram
    (and read P99) from ``elapsed_ms``, count outcomes by ``status_code``, and
    track retries via ``attempt``. ``status_code`` is ``None`` when the attempt
    never received a response (timeout or transport failure); ``error`` then
    holds a short reason. ``headers`` carries the response headers when one
    arrived (``None`` otherwise), so an app can read rate-limit headers such as
    ``X-RateLimit-Remaining`` to throttle proactively. The SDK never measures
    latency itself — this is the seam through which an app instruments it.
    """

    method: str
    path: str
    status_code: int | None
    elapsed_ms: float
    attempt: int  # 1-based
    error: str | None = None
    headers: Mapping[str, str] | None = None


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
    in milliseconds when one was sent, else ``None``. A give-up (attempts
    exhausted, budget spent, or ``Retry-After`` past the ceiling) emits no event —
    it surfaces as the raised exception and the final :class:`RequestEvent`.
    """

    method: str
    path: str
    attempt: int  # 1-based attempt that just failed
    delay_ms: float  # wait scheduled before the next attempt
    reason: str
    retry_after_ms: float | None = None


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
    if when is None:
        return None
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


def _redirect_error(response: httpx.Response) -> ApiError:
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
    )


class Transport:
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
        if client is not None:
            # A caller-supplied client owns its own timeout and pool limits.
            self._client = client
        else:
            client_kwargs: dict[str, Any] = {"base_url": base_url, "timeout": timeout}
            if limits is not None:
                client_kwargs["limits"] = limits
            self._client = httpx.Client(**client_kwargs)
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
        path: str,
        *,
        model: type[ModelT],
        params: dict[str, str] | None = None,
        timeout: float | None = None,
        extra_headers: Mapping[str, str] | None = None,
    ) -> ModelT:
        # Clear any prior call's metadata up front so a failure (which never
        # reaches `_parse`) can't leave a stale `last_meta` from an earlier call.
        self._local.meta = None

        # Client headers first, then per-request headers, then `api-key` last so
        # the key can never be overridden by either layer.
        headers = {**self._extra_headers, **(extra_headers or {}), "api-key": self._api_key}
        extra: dict[str, Any] = {}
        if timeout is not None:
            extra["timeout"] = timeout

        deadline: float | None = None
        if self._retry.max_elapsed is not None:
            deadline = time.monotonic() + self._retry.max_elapsed

        attempts = self._retry.max_attempts
        last_error: ApiError | None = None
        for attempt in range(attempts):
            retry_after: float | None = None
            reason: str
            logger.debug("%s %s (attempt %d/%d)", method, path, attempt + 1, attempts)
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
                response = self._client.send(request, stream=True, follow_redirects=False)
                try:
                    body = self._read_body(response)
                finally:
                    response.close()
            except httpx.PoolTimeout as exc:
                # Pool exhaustion is a local capacity problem, not a transient
                # upstream blip: retrying just adds more pending requests and
                # deepens the starvation. Fail fast so load sheds instead.
                elapsed_ms = (time.monotonic() - start) * 1000.0
                self._emit(method, path, None, elapsed_ms, attempt, "pool timeout")
                raise NetworkError(
                    f"connection pool timed out waiting for a free connection: {exc}. "
                    "Too many concurrent requests for the pool; raise httpx.Limits "
                    "or reduce concurrency."
                ) from exc
            except httpx.TimeoutException as exc:
                elapsed_ms = (time.monotonic() - start) * 1000.0
                self._emit(method, path, None, elapsed_ms, attempt, "timeout")
                last_error = NetworkError(f"request timed out: {exc}")
                reason = "request timed out"
            except httpx.HTTPError as exc:
                elapsed_ms = (time.monotonic() - start) * 1000.0
                self._emit(method, path, None, elapsed_ms, attempt, "network error")
                last_error = NetworkError(f"network error: {exc}")
                reason = "network error"
            else:
                elapsed_ms = (time.monotonic() - start) * 1000.0
                logger.debug(
                    "%s %s -> %d in %.1fms (attempt %d/%d)",
                    method,
                    path,
                    response.status_code,
                    elapsed_ms,
                    attempt + 1,
                    attempts,
                )
                self._emit(
                    method,
                    path,
                    response.status_code,
                    elapsed_ms,
                    attempt,
                    None,
                    dict(response.headers),
                )
                # Terminal by design: a redirect is a configuration change, not a
                # transient fault, so retrying it would just resend the key.
                if _is_redirect(response.status_code):
                    raise _redirect_error(response)

                if response.status_code < 400:
                    return self._parse(response, body, model)

                error = _error_for_status(response, body)
                if not _is_retryable(response.status_code):
                    raise error
                retry_after = error.retry_after
                # If the server asks us to wait longer than we're willing to
                # honor, give up now rather than burn an attempt on a long sleep.
                if retry_after is not None and retry_after > self._retry.max_retry_after:
                    logger.warning(
                        "%s %s: server Retry-After %.0fs exceeds max_retry_after %.0fs; giving up",
                        method,
                        path,
                        retry_after,
                        self._retry.max_retry_after,
                    )
                    raise error
                last_error = error
                reason = f"HTTP {response.status_code}"

            if attempt == attempts - 1:
                logger.warning(
                    "%s %s failed (%s); giving up after %d attempt(s)",
                    method,
                    path,
                    reason,
                    attempts,
                )
                break
            delay = next_retry_delay(attempt, retry_after, self._retry)
            # Give up rather than sleep past the caller's total-time budget.
            if deadline is not None and time.monotonic() + delay > deadline:
                logger.warning(
                    "%s %s failed (%s); giving up to stay within the max_elapsed budget",
                    method,
                    path,
                    reason,
                )
                break
            self._emit_retry(
                method,
                path,
                attempt + 1,
                delay * 1000.0,
                reason,
                None if retry_after is None else retry_after * 1000.0,
            )
            logger.warning(
                "%s %s failed (%s); retrying in %.2fs (attempt %d/%d)",
                method,
                path,
                reason,
                delay,
                attempt + 2,
                attempts,
            )
            if delay > 0:
                time.sleep(delay)

        # RetryConfig enforces max_attempts >= 1, so the loop runs at least once
        # and always sets last_error before breaking. Guard explicitly rather
        # than `assert` so the invariant holds under `python -O`.
        if last_error is None:  # pragma: no cover - unreachable invariant
            raise RuntimeError("retry loop exited without recording an error")
        raise last_error

    def _emit(
        self,
        method: str,
        path: str,
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
            method=method,
            path=path,
            status_code=status_code,
            elapsed_ms=elapsed_ms,
            attempt=attempt + 1,
            error=error,
            headers=headers,
        )
        try:
            self._on_request(event)
        except Exception:
            logger.exception("on_request observer raised; ignoring")

    def _emit_retry(
        self,
        method: str,
        path: str,
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
            method=method,
            path=path,
            attempt=attempt,
            delay_ms=delay_ms,
            reason=reason,
            retry_after_ms=retry_after_ms,
        )
        try:
            self._on_retry(event)
        except Exception:
            logger.exception("on_retry observer raised; ignoring")

    def _read_body(self, response: httpx.Response) -> bytes:
        """Read the response body into memory, bounded by ``max_response_bytes``.

        Reads incrementally and aborts as soon as the cap is crossed, so an
        over-large (or hostile) body never gets fully buffered. The resulting
        :class:`ApiError` is deterministic, so it is *not* retried.
        """
        cap = self._max_response_bytes
        chunks: list[bytes] = []
        total = 0
        for chunk in response.iter_bytes():
            total += len(chunk)
            if cap is not None and total > cap:
                raise ApiError(
                    f"response exceeded max_response_bytes ({cap} bytes)",
                    status_code=response.status_code,
                )
            chunks.append(chunk)
        return b"".join(chunks)

    def _parse(self, response: httpx.Response, body: bytes, model: type[ModelT]) -> ModelT:
        # A 2xx with no body or a non-JSON content type is not a valid API
        # response (e.g. an intercepting proxy's empty 200 or HTML error page).
        # Fail with a precise, deterministic error rather than a generic JSON
        # decode failure; like a 4xx body mismatch, this is not retried.
        if not body.strip():
            raise ApiError(
                "server returned an empty response body",
                status_code=response.status_code,
            )
        content_type = response.headers.get("content-type", "")
        if content_type and "json" not in content_type.lower():
            text = body.decode("utf-8", errors="replace")
            raise ApiError(
                f"expected a JSON response but received Content-Type {content_type!r}",
                status_code=response.status_code,
                body=text[:_BODY_PREVIEW_LIMIT],
                body_truncated=len(text) > _BODY_PREVIEW_LIMIT,
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
            ) from exc

        try:
            result = model.model_validate(payload)
        except PydanticValidationError as exc:
            raise ValidationError(
                "API response did not match the expected schema",
                errors=[dict(issue) for issue in exc.errors()],
            ) from exc

        self._local.meta = getattr(result, "meta", None)
        return result

    def close(self) -> None:
        self._client.close()


def _error_for_status(response: httpx.Response, body: bytes) -> ApiError:
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
