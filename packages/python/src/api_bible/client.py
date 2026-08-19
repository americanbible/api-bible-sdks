"""The user-facing entry point."""

from __future__ import annotations

import os
from types import TracebackType
from urllib.parse import urlsplit

import httpx

from ._http import (
    DEFAULT_BASE_URL,
    DEFAULT_MAX_RESPONSE_BYTES,
    DEFAULT_TIMEOUT,
    RequestObserver,
    RetryConfig,
    RetryObserver,
    Transport,
)
from .errors import InvalidInputError
from .models import Meta
from .resources import (
    AudioBiblesResource,
    BiblesResource,
    BooksResource,
    ChaptersResource,
    PassagesResource,
    SearchResource,
    SectionsResource,
    VersesResource,
)

__all__ = ["BibleClient"]

_DEFAULT_ENV_VAR = "API_BIBLE_KEY"
_FALLBACK_ENV_VAR = "BIBLE_API_KEY"


def _require_secure_base_url(base_url: str, *, allow_insecure_http: bool) -> None:
    """Reject a non-HTTPS ``base_url`` so the api-key is never sent in cleartext.

    ``http://`` is allowed only when the caller explicitly opts in with
    ``allow_insecure_http`` (e.g. a local mock server during testing).
    """
    scheme = urlsplit(base_url).scheme.lower()
    if scheme == "https":
        return
    if scheme == "http" and allow_insecure_http:
        return
    raise InvalidInputError(
        f"base_url must use https (got {scheme or 'no scheme'!r}); the api-key "
        "would be sent in cleartext otherwise. Pass allow_insecure_http=True "
        "only for local testing against a mock server."
    )


class BibleClient:
    """Synchronous client for the api.bible REST API.

    Example::

        with BibleClient.from_env() as client:
            bibles = client.bibles.list(language="eng")
            print(bibles[0].name)

    The client owns an :class:`httpx.Client` connection pool. Use it as a context
    manager (shown above) or call :meth:`close` when finished.
    """

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float | httpx.Timeout = DEFAULT_TIMEOUT,
        retry: RetryConfig | None = None,
        headers: dict[str, str] | None = None,
        http_client: httpx.Client | None = None,
        limits: httpx.Limits | None = None,
        allow_insecure_http: bool = False,
        on_request: RequestObserver | None = None,
        on_retry: RetryObserver | None = None,
        max_response_bytes: int | None = DEFAULT_MAX_RESPONSE_BYTES,
    ) -> None:
        if not api_key or not api_key.strip():
            raise InvalidInputError("api_key is required")
        # When the caller supplies their own client, it owns the base URL; we
        # only police the URL we would otherwise build the pool with.
        if http_client is None:
            _require_secure_base_url(base_url, allow_insecure_http=allow_insecure_http)

        self._transport = Transport(
            api_key,
            base_url=base_url,
            timeout=timeout,
            retry=retry,
            headers=headers,
            client=http_client,
            limits=limits,
            on_request=on_request,
            on_retry=on_retry,
            max_response_bytes=max_response_bytes,
        )

        self.bibles = BiblesResource(self._transport)
        self.books = BooksResource(self._transport)
        self.chapters = ChaptersResource(self._transport)
        self.verses = VersesResource(self._transport)
        self.passages = PassagesResource(self._transport)
        self.sections = SectionsResource(self._transport)
        self.audio_bibles = AudioBiblesResource(self._transport)
        self.search = SearchResource(self._transport)

    @classmethod
    def from_env(
        cls,
        *,
        var: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float | httpx.Timeout = DEFAULT_TIMEOUT,
        retry: RetryConfig | None = None,
        headers: dict[str, str] | None = None,
        http_client: httpx.Client | None = None,
        limits: httpx.Limits | None = None,
        allow_insecure_http: bool = False,
        on_request: RequestObserver | None = None,
        on_retry: RetryObserver | None = None,
        max_response_bytes: int | None = DEFAULT_MAX_RESPONSE_BYTES,
    ) -> BibleClient:
        """Build a client using the API key from an environment variable.

        With no ``var``, reads ``API_BIBLE_KEY`` and falls back to
        ``BIBLE_API_KEY`` (the name shared with the TypeScript SDK). Pass ``var``
        to read a specific variable instead, in which case no fallback is
        applied. The remaining keyword arguments mirror :class:`BibleClient` and
        are forwarded to it.
        """
        names = [_DEFAULT_ENV_VAR, _FALLBACK_ENV_VAR] if var is None else [var]
        for name in names:
            api_key = os.environ.get(name)
            if api_key:
                return cls(
                    api_key,
                    base_url=base_url,
                    timeout=timeout,
                    retry=retry,
                    headers=headers,
                    http_client=http_client,
                    limits=limits,
                    allow_insecure_http=allow_insecure_http,
                    on_request=on_request,
                    on_retry=on_retry,
                    max_response_bytes=max_response_bytes,
                )
        raise InvalidInputError(f"environment variable {' or '.join(names)} is not set")

    @property
    def last_meta(self) -> Meta | None:
        """FUMS analytics metadata for the calling thread's most recent call.

        ``None`` if that call failed or its response carried no metadata. This is
        a convenience for the common single-call pattern; it is overwritten by the
        next call on the thread. When you need metadata tied reliably to a specific
        response, use a ``*_with_meta`` method (e.g. :meth:`chapters.get_with_meta`),
        which returns a :class:`~api_bible.Result` carrying both ``data`` and ``meta``.
        """
        return self._transport.last_meta

    def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        self._transport.close()

    def __enter__(self) -> BibleClient:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()
