"""Shared pytest fixtures.

Tests never touch the network: an :class:`httpx.MockTransport` plays a handler
function in place of real HTTP, and ``time.sleep`` / ``anyio.sleep`` are
neutralized so retry backoff is instant.
"""

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest
from harness import BASE_URL, TEST_RETRY, Api, Handler

from api_bible import BibleClient


async def _instant_async_sleep(_seconds: float) -> None:
    pass


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("api_bible._http.time.sleep", lambda _seconds: None)
    monkeypatch.setattr("api_bible._http.anyio.sleep", _instant_async_sleep)


def build_client(handler: Handler, **kwargs: object) -> BibleClient:
    http_client = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(handler))
    kwargs.setdefault("retry", TEST_RETRY)
    return BibleClient("test-key", http_client=http_client, **kwargs)  # type: ignore[arg-type]


@pytest.fixture
def make_client() -> Callable[..., BibleClient]:
    return build_client


@pytest.fixture(params=["sync", "asyncio", "trio"])
def kind(request: pytest.FixtureRequest) -> str:
    """Which client a shared test runs on (see ``harness.Api``)."""
    return str(request.param)


@pytest.fixture
def api(kind: str) -> Api:
    return Api(kind)
