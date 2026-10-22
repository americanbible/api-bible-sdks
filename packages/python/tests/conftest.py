"""Suite-wide fixtures."""

from __future__ import annotations

import pytest


@pytest.fixture(params=["asyncio", "trio"])
def anyio_backend(request: pytest.FixtureRequest) -> str:
    """Run every ``@pytest.mark.anyio`` test on both backends the SDK supports."""
    return str(request.param)
