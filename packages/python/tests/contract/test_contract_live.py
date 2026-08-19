"""Key-gated live contract tier.

The real schema-drift detector: hits api.bible directly and fails if any
response no longer matches the SDK's Pydantic models. It self-skips when no API
key is set, so it's inert in PR CI and in local runs without a key — it's wired
to run nightly (see .github/workflows/contract.yml).
"""

from __future__ import annotations

import os
from collections.abc import Callable

import pytest
from cases import CASES

from api_bible import BibleClient, RetryConfig

API_KEY = os.environ.get("API_BIBLE_KEY") or os.environ.get("BIBLE_API_KEY")


@pytest.mark.live
@pytest.mark.skipif(not API_KEY, reason="API_BIBLE_KEY (or BIBLE_API_KEY) not set")
@pytest.mark.parametrize(("name", "run"), CASES, ids=[case[0] for case in CASES])
def test_live_response_satisfies_schema(name: str, run: Callable[[BibleClient], None]) -> None:
    assert API_KEY is not None
    client = BibleClient(
        API_KEY,
        timeout=20.0,
        retry=RetryConfig(max_attempts=3, base_delay=0.5),
    )
    # Raises ValidationError on schema drift, or an ApiError on a real failure.
    with client:
        run(client)
