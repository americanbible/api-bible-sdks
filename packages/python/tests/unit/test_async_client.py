"""AsyncBibleClient construction, lifecycle and task-local ``last_meta``.

Request behaviour shared with BibleClient (retries, errors, observers, ...) is
covered over both clients in ``test_http.py``, ``test_endpoints.py``,
``test_error_mapping.py`` and ``test_wire.py``.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import anyio
import anyio.lowlevel
import httpx
import pytest

from api_bible import (
    AsyncBibleClient,
    InvalidInputError,
    NotFoundError,
    RetryConfig,
    __version__,
)
from api_bible._http import _ASYNC_META

BASE_URL = "https://rest.api.bible/v1"


def _empty(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"data": []})


def _http(handler: Callable[[httpx.Request], Any]) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=BASE_URL, transport=httpx.MockTransport(handler))


def _echo_meta(request: httpx.Request) -> httpx.Response:
    """Answer /bibles/{id} with that id as the FUMS id, so a caller can tell
    which response a ``last_meta`` came from."""
    bible_id = request.url.path.rsplit("/", 1)[-1]
    return httpx.Response(
        200, json={"data": {"id": bible_id, "name": bible_id}, "meta": {"fumsId": bible_id}}
    )


# --- construction -------------------------------------------------------------


@pytest.mark.parametrize("key", ["", "   "])
def test_blank_api_key_rejected(key: str) -> None:
    with pytest.raises(InvalidInputError, match="api_key"):
        AsyncBibleClient(key)


@pytest.mark.parametrize("raw", ["SECRET KEY", "SECRET\x00KEY", "SECRÉTKEY"])
def test_api_key_with_illegal_characters_rejected_without_echoing_it(raw: str) -> None:
    with pytest.raises(InvalidInputError, match="api_key contains") as exc_info:
        AsyncBibleClient(raw)

    assert "SECRET" not in str(exc_info.value)


@pytest.mark.anyio
@pytest.mark.parametrize("raw", ["key\n", "  key  ", "\tkey\r\n"])
async def test_api_key_surrounding_whitespace_is_stripped(raw: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["api-key"] == "key"
        return _empty(request)

    async with AsyncBibleClient(raw, http_client=_http(handler)) as client:
        assert await client.bibles.list() == []


@pytest.mark.parametrize("scheme", ["http", "ftp", ""])
def test_insecure_base_url_rejected(scheme: str) -> None:
    base_url = f"{scheme}://rest.api.bible/v1" if scheme else "rest.api.bible/v1"
    with pytest.raises(InvalidInputError, match="https"):
        AsyncBibleClient("k", base_url=base_url)


@pytest.mark.anyio
async def test_default_base_url_is_https_and_insecure_needs_opt_in() -> None:
    async with AsyncBibleClient("k") as client:
        assert client is not None
    async with AsyncBibleClient(
        "k", base_url="http://localhost:8080", allow_insecure_http=True
    ) as client:
        assert client is not None


@pytest.mark.anyio
async def test_custom_http_client_skips_base_url_check() -> None:
    async with AsyncBibleClient(
        "k", base_url="http://localhost", http_client=_http(_empty)
    ) as client:
        assert client is not None


@pytest.mark.anyio
async def test_forwards_timeout_and_limits_to_httpx_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    backing = _http(_empty)

    def fake_client(**kwargs: object) -> httpx.AsyncClient:
        captured.update(kwargs)
        return backing

    monkeypatch.setattr("api_bible._http.httpx.AsyncClient", fake_client)

    timeout = httpx.Timeout(5.0, connect=2.0)
    limits = httpx.Limits(max_connections=7)
    async with AsyncBibleClient("k", timeout=timeout, limits=limits):
        pass
    assert captured["timeout"] is timeout
    assert captured["limits"] is limits

    captured.clear()
    async with AsyncBibleClient("k"):
        pass
    assert "limits" not in captured  # httpx applies its own default


# --- from_env -----------------------------------------------------------------


def test_from_env_missing_var_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    monkeypatch.delenv("BIBLE_API_KEY", raising=False)
    with pytest.raises(InvalidInputError, match="API_BIBLE_KEY or BIBLE_API_KEY"):
        AsyncBibleClient.from_env()


def test_from_env_explicit_var_does_not_fall_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    monkeypatch.setenv("BIBLE_API_KEY", "fallback-key")
    with pytest.raises(InvalidInputError, match="API_BIBLE_KEY"):
        AsyncBibleClient.from_env(var="API_BIBLE_KEY")


def test_from_env_rejects_insecure_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_BIBLE_KEY", "env-key")
    with pytest.raises(InvalidInputError, match="https"):
        AsyncBibleClient.from_env(base_url="http://rest.api.bible/v1")


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("env", "expected"),
    [
        ({"API_BIBLE_KEY": "primary-key", "BIBLE_API_KEY": "fallback-key"}, "primary-key"),
        ({"BIBLE_API_KEY": "fallback-key"}, "fallback-key"),
    ],
    ids=["primary", "fallback"],
)
async def test_from_env_reads_key_and_authenticates(
    monkeypatch: pytest.MonkeyPatch, env: dict[str, str], expected: str
) -> None:
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["api-key"] == expected
        return _empty(request)

    async with AsyncBibleClient.from_env(http_client=_http(handler)) as client:
        assert await client.bibles.list() == []


@pytest.mark.anyio
async def test_from_env_forwards_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_BIBLE_KEY", "env-key")
    retry = RetryConfig(max_attempts=7)
    async with AsyncBibleClient.from_env(
        timeout=2.5, retry=retry, headers={"X-Test": "1"}, http_client=_http(_empty)
    ) as client:
        assert client._transport._retry is retry
        assert client._transport._extra_headers["X-Test"] == "1"


# --- lifecycle ----------------------------------------------------------------


@pytest.mark.anyio
async def test_async_with_and_aclose_close_the_pool() -> None:
    http_client = _http(_empty)
    async with AsyncBibleClient("k", http_client=http_client):
        pass
    assert http_client.is_closed

    http_client = _http(_empty)
    client = AsyncBibleClient("k", http_client=http_client)
    await client.aclose()
    assert http_client.is_closed


@pytest.mark.anyio
async def test_sets_user_agent_identifying_the_sdk() -> None:
    seen: dict[str, str | None] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["ua"] = request.headers.get("user-agent")
        return _empty(request)

    async with AsyncBibleClient("k", http_client=_http(handler)) as client:
        await client.bibles.list()

    assert seen["ua"] == f"api-bible-sdk-python/{__version__}"


# --- last_meta ----------------------------------------------------------------


@pytest.mark.anyio
async def test_last_meta_exposes_fums() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"data": [], "meta": {"fumsToken": "tok-1", "fumsId": "abc123"}}
        )

    async with AsyncBibleClient("k", http_client=_http(handler)) as client:
        assert client.last_meta is None
        await client.bibles.list()
        assert client.last_meta is not None
        assert client.last_meta.fums_token == "tok-1"
        assert client.last_meta.fums_id == "abc123"


@pytest.mark.anyio
async def test_last_meta_cleared_after_failed_call() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json={"data": [], "meta": {"fumsId": "abc123"}})
        return httpx.Response(404, json={"message": "nope"})

    async with AsyncBibleClient("k", http_client=_http(handler), retry=RetryConfig()) as client:
        await client.bibles.list()
        assert client.last_meta is not None
        with pytest.raises(NotFoundError):
            await client.bibles.get("missing")
        assert client.last_meta is None
        # The cleared entry is dropped, not stored as None, so the shared map
        # doesn't grow with every client a context has used.
        assert client._transport._meta_key not in _ASYNC_META.get()


@pytest.mark.anyio
async def test_last_meta_is_per_client() -> None:
    async with (
        AsyncBibleClient("k", http_client=_http(_echo_meta)) as first,
        AsyncBibleClient("k", http_client=_http(_echo_meta)) as second,
    ):
        await first.bibles.get("one")
        assert second.last_meta is None
        await second.bibles.get("two")
        assert first.last_meta is not None and first.last_meta.fums_id == "one"
        assert second.last_meta is not None and second.last_meta.fums_id == "two"


@pytest.mark.anyio
async def test_last_meta_is_isolated_across_concurrent_tasks() -> None:
    """Two tasks share a client; each finishes its call before reading
    ``last_meta``, after the other task's call has also completed, and must
    still see its own response's metadata."""
    results: dict[str, str | None] = {}

    async with AsyncBibleClient("k", http_client=_http(_echo_meta)) as client:

        async def worker(bible_id: str, done: anyio.Event, other_done: anyio.Event) -> None:
            await client.bibles.get(bible_id)
            done.set()
            await other_done.wait()  # the other task's call has completed too
            meta = client.last_meta
            results[bible_id] = meta.fums_id if meta else None

        a_done, b_done = anyio.Event(), anyio.Event()
        async with anyio.create_task_group() as tg:
            tg.start_soon(worker, "a", a_done, b_done)
            tg.start_soon(worker, "b", b_done, a_done)

        assert results == {"a": "a", "b": "b"}
        # Child tasks run in copies of the context, so nothing leaks to the parent.
        assert client.last_meta is None


@pytest.mark.anyio
async def test_last_meta_is_isolated_under_interleaving() -> None:
    """Many tasks, many calls, a checkpoint inside every request: no task ever
    sees another task's metadata."""

    async def handler(request: httpx.Request) -> httpx.Response:
        await anyio.lowlevel.checkpoint()  # let other tasks run mid-call
        return _echo_meta(request)

    errors: list[str] = []

    async with AsyncBibleClient("k", http_client=_http(handler)) as client:

        async def worker(n: int) -> None:
            bible_id = f"bible-{n}"
            for _ in range(20):
                await client.bibles.get(bible_id)
                await anyio.lowlevel.checkpoint()
                meta = client.last_meta
                if meta is None or meta.fums_id != bible_id:
                    errors.append(f"task {n} saw {meta and meta.fums_id}")
                    return

        async with anyio.create_task_group() as tg:
            for n in range(8):
                tg.start_soon(worker, n)

    assert not errors, errors
