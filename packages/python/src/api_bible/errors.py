"""Exception hierarchy for the api.bible SDK.

These exceptions are part of the public contract: callers import and ``except``
them. The hierarchy mirrors the TypeScript SDK so behaviour is consistent across
languages::

    BibleError
      ├─ ApiError              (an HTTP request was made; server returned >= 400)
      │    ├─ AuthError        (401 / 403)
      │    ├─ BadRequestError  (400)
      │    ├─ NotFoundError    (404)
      │    ├─ ConflictError    (409)
      │    ├─ UnprocessableEntityError (422)
      │    ├─ RateLimitError   (429, retried)
      │    ├─ ServerError      (5xx, retried)
      │    └─ NetworkError     (transport failure, status_code=0, retried)
      ├─ InvalidInputError     (caller/config mistake; no request made)
      └─ ValidationError       (response did not match the expected schema)
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "BibleError",
    "ApiError",
    "AuthError",
    "BadRequestError",
    "NotFoundError",
    "ConflictError",
    "UnprocessableEntityError",
    "RateLimitError",
    "ServerError",
    "NetworkError",
    "InvalidInputError",
    "ValidationError",
]


class BibleError(Exception):
    """Base class for every error raised by this SDK."""


class InvalidInputError(BibleError):
    """Caller-supplied input was invalid; no HTTP request was made."""


class ValidationError(BibleError):
    """The API response did not match the expected schema.

    Wraps the underlying ``pydantic.ValidationError`` so callers never need to
    depend on pydantic directly. The per-field issues are available on
    :attr:`errors`.
    """

    def __init__(self, message: str, *, errors: list[dict[str, Any]]) -> None:
        super().__init__(message)
        self.errors = errors

    def format(self) -> str:
        """Return a human-readable, multi-line summary of every issue."""
        lines = [str(self)]
        for issue in self.errors:
            location = ".".join(str(part) for part in issue.get("loc", ()))
            lines.append(f"  - {location or '<root>'}: {issue.get('msg', '')}")
        return "\n".join(lines)


class ApiError(BibleError):
    """An HTTP request was made and the server returned an error status."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        body: str = "",
        body_truncated: bool = False,
        retry_after: float | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body
        self.body_truncated = body_truncated
        # Seconds the server asked us to wait, parsed from the ``Retry-After``
        # header (``None`` if absent/unparseable). Carried so callers building
        # their own backoff after a give-up — most usefully on ``RateLimitError``
        # — can honor the server's hint instead of guessing.
        self.retry_after = retry_after


class AuthError(ApiError):
    """401 / 403 — missing, invalid, or unauthorized API key."""


class BadRequestError(ApiError):
    """400 — malformed request parameters."""


class NotFoundError(ApiError):
    """404 — the requested resource does not exist."""


class ConflictError(ApiError):
    """409 — the request conflicts with the current state of the resource."""


class UnprocessableEntityError(ApiError):
    """422 — the request was well-formed but semantically invalid."""


class RateLimitError(ApiError):
    """429 — rate limit exceeded. Retried automatically by the transport."""


class ServerError(ApiError):
    """5xx — upstream server error. Retried automatically by the transport."""


class NetworkError(ApiError):
    """Transport failure: no HTTP response was received.

    Connection/read timeouts and other transport errors are retried
    automatically. The exception is a connection-pool timeout (the local pool
    was exhausted), which is *not* retried — retrying would only add load and
    deepen the starvation.

    Modeled as an :class:`ApiError` with ``status_code == 0`` so callers can
    catch all request failures with a single ``except ApiError``.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=0)
