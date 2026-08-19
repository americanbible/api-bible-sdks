"""Deterministic, offline contract tier.

Each recorded api.bible response is replayed through the real client, so the
SDK's own Pydantic models validate it exactly as they would in production. This
guards against schema edits that no longer accept a real-shaped response. (Drift
in the other direction is caught by the key-gated live tier.)
"""

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest
from cases import CASES
from replay import load_recordings, make_replay_transport

from api_bible import BibleClient, RetryConfig

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
