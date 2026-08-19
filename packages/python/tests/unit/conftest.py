"""Shared pytest fixtures.

Tests never touch the network: an :class:`httpx.MockTransport` plays a handler
function in place of real HTTP, and ``time.sleep`` is neutralized so retry
backoff is instant.
"""

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest

from api_bible import BibleClient, RetryConfig

Handler = Callable[[httpx.Request], httpx.Response]

BASE_URL = "https://rest.api.bible/v1"

# Deterministic, instant retries for tests: zero jitter, generous ceiling so the
# "Retry-After exceeds ceiling" give-up rule only fires when a test asks for it.
TEST_RETRY = RetryConfig(max_attempts=3, base_delay=0.0, max_delay=30.0, jitter=lambda: 0.0)


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("api_bible._http.time.sleep", lambda _seconds: None)


def build_client(handler: Handler, **kwargs: object) -> BibleClient:
    http_client = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(handler))
    kwargs.setdefault("retry", TEST_RETRY)
    return BibleClient("test-key", http_client=http_client, **kwargs)  # type: ignore[arg-type]


@pytest.fixture
def make_client() -> Callable[..., BibleClient]:
    return build_client
