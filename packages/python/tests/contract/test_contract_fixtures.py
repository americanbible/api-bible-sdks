"""Deterministic, offline contract tier.

Each recorded api.bible response is replayed through the real client, so the
SDK's own Pydantic models validate it exactly as they would in production. This
guards against schema edits that no longer accept a real-shaped response. (Drift
in the other direction is caught by the key-gated live tier.)
"""

from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import pytest
from cases import _ASYNC_TWINS, ASYNC_CASES, CASES
from replay import load_recordings, make_replay_transport

from api_bible import AsyncBibleClient, BibleClient, RetryConfig

RECORDINGS = load_recordings()


@pytest.mark.skipif(not RECORDINGS, reason="no recorded fixtures")
@pytest.mark.parametrize(("name", "run"), CASES, ids=[case[0] for case in CASES])
def test_recorded_response_satisfies_schema(name: str, run: Callable[[BibleClient], None]) -> None:
    transport = make_replay_transport(RECORDINGS)
    http_client = httpx.Client(base_url="https://rest.api.bible/v1", transport=transport)
    client = BibleClient("fixture-key", http_client=http_client, retry=RetryConfig(max_attempts=1))
    # Raises ValidationError if any response in the case fails its schema.
    with client:
        run(client)


@pytest.mark.skipif(not RECORDINGS, reason="no recorded fixtures")
@pytest.mark.anyio
@pytest.mark.parametrize(("name", "run"), ASYNC_CASES, ids=[case[0] for case in ASYNC_CASES])
async def test_recorded_response_satisfies_schema_async(
    name: str, run: Callable[[AsyncBibleClient], Awaitable[Any]]
) -> None:
    transport = make_replay_transport(RECORDINGS)
    http_client = httpx.AsyncClient(base_url="https://rest.api.bible/v1", transport=transport)
    client = AsyncBibleClient(
        "fixture-key", http_client=http_client, retry=RetryConfig(max_attempts=1)
    )
    async with client:
        await run(client)


def test_async_cases_mirror_sync_cases() -> None:
    assert [name for name, _ in ASYNC_CASES] == [name for name, _ in CASES]
    # Every multi-step case has an async twin; the rest are reused one-call lambdas.
    sync_runs = dict(CASES)
    for name, run in ASYNC_CASES:
        if name in _ASYNC_TWINS:
            assert inspect.iscoroutinefunction(run)
        else:
            assert run is sync_runs[name] and run.__name__ == "<lambda>"
