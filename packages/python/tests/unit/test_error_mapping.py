from __future__ import annotations

import httpx
import pytest
from harness import Api, backend_for

from api_bible import (
    ApiError,
    AuthError,
    BadRequestError,
    ConflictError,
    NetworkError,
    NotFoundError,
    RateLimitError,
    RetryConfig,
    ServerError,
    UnprocessableEntityError,
)


@pytest.fixture
def anyio_backend(kind: str) -> str:
    return backend_for(kind)


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (400, BadRequestError),
        (401, AuthError),
        (403, AuthError),
        (404, NotFoundError),
        (409, ConflictError),
        (422, UnprocessableEntityError),
        (429, RateLimitError),
        (418, ApiError),  # unmapped 4xx falls back to ApiError
        (500, ServerError),
        (503, ServerError),
    ],
)
@pytest.mark.anyio
async def test_status_maps_to_error_class(api: Api, status: int, expected: type[ApiError]) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"message": "nope"})

    async with api.client(handler) as client:
        with pytest.raises(expected) as exc_info:
            await client.bibles.list()

    assert exc_info.value.status_code == status
    assert type(exc_info.value) is expected


@pytest.mark.parametrize("status", [409, 422])
@pytest.mark.anyio
async def test_semantic_4xx_not_retried(api: Api, status: int) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(status, json={"message": "nope"})

    async with api.client(handler) as client:
        with pytest.raises(ApiError):
            await client.bibles.list()

    assert calls["n"] == 1  # 409/422 are client errors, so not retried


@pytest.mark.anyio
async def test_message_extracted_from_nested_error(api: Api) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "bad id"}})

    async with api.client(handler) as client:
        with pytest.raises(BadRequestError, match="bad id"):
            await client.bibles.list()


@pytest.mark.anyio
async def test_message_falls_back_to_status_when_absent(api: Api) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json=["not", "a", "dict"])

    async with api.client(handler) as client:
        with pytest.raises(NotFoundError, match="HTTP 404"):
            await client.bibles.list()


@pytest.mark.anyio
async def test_timeout_becomes_network_error(api: Api) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out")

    async with api.client(handler) as client:
        with pytest.raises(NetworkError, match="timed out"):
            await client.bibles.list()


@pytest.mark.anyio
async def test_rate_limit_error_exposes_retry_after(api: Api) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        # 9999 > max_retry_after so we give up immediately, surfacing the error.
        return httpx.Response(429, headers={"retry-after": "30"}, json={"message": "slow down"})

    retry = RetryConfig(max_attempts=3, max_retry_after=10.0, jitter=lambda: 0.0)
    async with api.client(handler, retry=retry) as client:
        with pytest.raises(RateLimitError) as exc_info:
            await client.bibles.list()

    assert exc_info.value.retry_after == 30.0


@pytest.mark.anyio
async def test_retry_after_is_none_when_header_absent(api: Api) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "nope"})

    async with api.client(handler) as client:
        with pytest.raises(NotFoundError) as exc_info:
            await client.bibles.get("missing")

    assert exc_info.value.retry_after is None


# httpx already defaults follow_redirects=False, so the api-key is never resent
# to a redirect target. These cover the reporting side: a 3xx must surface as a
# self-explanatory error rather than falling through to the JSON parser.


@pytest.mark.parametrize("status", [301, 302, 307, 308])
@pytest.mark.anyio
async def test_redirect_raises_instead_of_being_parsed(api: Api, status: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, headers={"location": "https://evil.example.com/v1/bibles"})

    async with api.client(handler) as client:
        with pytest.raises(ApiError) as exc_info:
            await client.bibles.list()

    error = exc_info.value
    assert error.status_code == status
    assert "https://evil.example.com" in str(error)
    assert "api-key" in str(error)


@pytest.mark.anyio
async def test_redirect_reports_origin_only(api: Api) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            302, headers={"location": "https://evil.example.com/steal?api-key=leaked"}
        )

    async with api.client(handler) as client:
        with pytest.raises(ApiError) as exc_info:
            await client.bibles.list()

    message = str(exc_info.value)
    assert "https://evil.example.com" in message
    assert "leaked" not in message
    assert "/steal" not in message


@pytest.mark.anyio
async def test_redirect_without_location_still_explains_itself(api: Api) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302)

    async with api.client(handler) as client:
        with pytest.raises(ApiError, match="undisclosed host"):
            await client.bibles.list()


@pytest.mark.anyio
async def test_redirect_is_not_retried(api: Api) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(302, headers={"location": "https://elsewhere.example.com/"})

    async with api.client(handler) as client:
        with pytest.raises(ApiError):
            await client.bibles.list()

    # max_attempts is 3 — a redirect is terminal, so only one request goes out.
    assert calls == 1
