"""Runs one test body over ``BibleClient`` or ``AsyncBibleClient``.

Shared tests take the ``api`` fixture (see ``conftest.py``) and write
``async with api.client(handler) as client: await client.bibles.list()``; on the
sync client the calls run inline, so the same body checks both clients.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import httpx
import pytest

from api_bible import AsyncBibleClient, BibleClient, RetryConfig
from api_bible._http import AsyncTransport, Transport
from api_bible.resources._base import BaseResource

Handler = Callable[[httpx.Request], httpx.Response]

BASE_URL = "https://rest.api.bible/v1"

# Deterministic, instant retries for tests: zero jitter, generous ceiling so the
# "Retry-After exceeds ceiling" give-up rule only fires when a test asks for it.
TEST_RETRY = RetryConfig(max_attempts=3, base_delay=0.0, max_delay=30.0, jitter=lambda: 0.0)


def patch_sleep(monkeypatch: pytest.MonkeyPatch, sleep: Callable[[float], None]) -> None:
    """Route both clients' backoff sleeps through ``sleep`` (e.g. a fake clock)."""

    async def async_sleep(seconds: float) -> None:
        sleep(seconds)

    monkeypatch.setattr("api_bible._http.time.sleep", sleep)
    monkeypatch.setattr("api_bible._http.anyio.sleep", async_sleep)


def backend_for(kind: str) -> str:
    """The anyio backend for a client ``kind``: the sync client runs once, on asyncio.

    A module using the ``api`` fixture overrides ``anyio_backend`` with this.
    """
    return "asyncio" if kind == "sync" else kind


class _Awaitable:
    """Wraps the sync client so its calls are awaited like the async client's.

    Resources are wrapped in turn; any other callable becomes a coroutine that
    runs the sync call inline. Plain attributes (``last_meta``) pass through.
    """

    def __init__(self, target: object) -> None:
        self._target = target

    def __getattr__(self, name: str) -> Any:
        value = getattr(self._target, name)
        if isinstance(value, BaseResource):
            return _Awaitable(value)
        if callable(value):

            async def call(*args: Any, **kwargs: Any) -> Any:
                return value(*args, **kwargs)

            return call
        return value


class Api:
    """Drives one test body over the sync client or the async client."""

    def __init__(self, kind: str) -> None:
        self.kind = kind
        self.is_async = kind != "sync"
        self.transport_cls: type[Transport] | type[AsyncTransport] = (
            AsyncTransport if self.is_async else Transport
        )
        self.client_cls: type[BibleClient] | type[AsyncBibleClient] = (
            AsyncBibleClient if self.is_async else BibleClient
        )

    @asynccontextmanager
    async def open(self, api_key: str, **kwargs: Any) -> AsyncIterator[Any]:
        """Construct the client from ``kwargs`` and enter it; closed on exit."""
        if self.is_async:
            async with AsyncBibleClient(api_key, **kwargs) as client:
                yield client
        else:
            with BibleClient(api_key, **kwargs) as sync:
                yield _Awaitable(sync)

    @asynccontextmanager
    async def client(
        self,
        handler: Handler,
        *,
        http_client_kwargs: dict[str, Any] | None = None,
        api_key: str = "test-key",
        **kwargs: Any,
    ) -> AsyncIterator[Any]:
        """A client on ``MockTransport(handler)``, entered and closed for you.

        ``kwargs`` go to the SDK client (``retry`` defaults to ``TEST_RETRY``);
        ``http_client_kwargs`` go to the underlying httpx client.
        """
        kwargs.setdefault("retry", TEST_RETRY)
        http_cls = httpx.AsyncClient if self.is_async else httpx.Client
        http_client = http_cls(
            base_url=BASE_URL,
            transport=httpx.MockTransport(handler),
            **(http_client_kwargs or {}),
        )
        async with self.open(api_key, http_client=http_client, **kwargs) as client:
            yield client
