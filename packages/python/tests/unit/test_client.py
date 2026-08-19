from __future__ import annotations

import threading

import httpx
import pytest

from api_bible import BibleClient, InvalidInputError, NotFoundError, RetryConfig, __version__

BASE_URL = "https://rest.api.bible/v1"


def _empty(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"data": []})


@pytest.mark.parametrize("key", ["", "   "])
def test_blank_api_key_rejected(key: str) -> None:
    with pytest.raises(InvalidInputError, match="api_key"):
        BibleClient(key)


def test_default_base_url_is_https() -> None:
    # The default base URL is HTTPS, so construction succeeds without opting in.
    with BibleClient("k") as client:
        assert client is not None


@pytest.mark.parametrize("scheme", ["http", "ftp", ""])
def test_insecure_base_url_rejected(scheme: str) -> None:
    base_url = f"{scheme}://rest.api.bible/v1" if scheme else "rest.api.bible/v1"
    with pytest.raises(InvalidInputError, match="https"):
        BibleClient("k", base_url=base_url)


def test_insecure_base_url_allowed_with_opt_in() -> None:
    with BibleClient("k", base_url="http://localhost:8080", allow_insecure_http=True) as client:
        assert client is not None


def test_custom_http_client_skips_base_url_check() -> None:
    # A caller-supplied client owns its base URL, so the guard does not apply.
    http_client = httpx.Client(base_url="http://localhost", transport=httpx.MockTransport(_empty))
    with BibleClient("k", base_url="http://localhost", http_client=http_client) as client:
        assert client is not None


def test_from_env_rejects_insecure_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_BIBLE_KEY", "env-key")
    with pytest.raises(InvalidInputError, match="https"):
        BibleClient.from_env(base_url="http://rest.api.bible/v1")


def test_from_env_missing_var_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    monkeypatch.delenv("BIBLE_API_KEY", raising=False)
    with pytest.raises(InvalidInputError, match="API_BIBLE_KEY"):
        BibleClient.from_env()


def test_from_env_falls_back_to_bible_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    monkeypatch.setenv("BIBLE_API_KEY", "fallback-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["api-key"] == "fallback-key"
        return _empty(request)

    http_client = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(handler))
    with BibleClient.from_env(http_client=http_client) as client:
        assert client.bibles.list() == []


def test_from_env_prefers_api_bible_key_over_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_BIBLE_KEY", "primary-key")
    monkeypatch.setenv("BIBLE_API_KEY", "fallback-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["api-key"] == "primary-key"
        return _empty(request)

    http_client = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(handler))
    with BibleClient.from_env(http_client=http_client) as client:
        client.bibles.list()


def test_from_env_explicit_var_does_not_fall_back(monkeypatch: pytest.MonkeyPatch) -> None:
    # Even when the explicit var equals the default name, passing it disables the
    # fallback: BIBLE_API_KEY is set but must not be consulted.
    monkeypatch.delenv("API_BIBLE_KEY", raising=False)
    monkeypatch.setenv("BIBLE_API_KEY", "fallback-key")
    with pytest.raises(InvalidInputError, match="API_BIBLE_KEY"):
        BibleClient.from_env(var="API_BIBLE_KEY")


def test_from_env_forwards_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_BIBLE_KEY", "env-key")
    retry = RetryConfig(max_attempts=7)
    http_client = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(_empty))
    with BibleClient.from_env(
        timeout=2.5, retry=retry, headers={"X-Test": "1"}, http_client=http_client
    ) as client:
        assert client._transport._retry is retry
        assert client._transport._extra_headers["X-Test"] == "1"


def test_from_env_reads_key_and_authenticates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_BIBLE_KEY", "env-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["api-key"] == "env-key"
        return _empty(request)

    http_client = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(handler))
    with BibleClient.from_env(http_client=http_client) as client:
        assert client.bibles.list() == []


def test_forwards_timeout_and_limits_to_httpx_client(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}
    backing = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(_empty))

    def fake_client(**kwargs: object) -> httpx.Client:
        captured.update(kwargs)
        return backing

    monkeypatch.setattr("api_bible._http.httpx.Client", fake_client)

    timeout = httpx.Timeout(5.0, connect=2.0)
    limits = httpx.Limits(max_connections=7)
    with BibleClient("k", timeout=timeout, limits=limits):
        pass

    assert captured["timeout"] is timeout
    assert captured["limits"] is limits


def test_limits_omitted_when_not_supplied(monkeypatch: pytest.MonkeyPatch) -> None:
    # Without an explicit limits, the SDK lets httpx apply its own default.
    captured: dict[str, object] = {}
    backing = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(_empty))

    def fake_client(**kwargs: object) -> httpx.Client:
        captured.update(kwargs)
        return backing

    monkeypatch.setattr("api_bible._http.httpx.Client", fake_client)

    with BibleClient("k"):
        pass

    assert "limits" not in captured


def test_context_manager_closes_pool() -> None:
    http_client = httpx.Client(base_url=BASE_URL, transport=httpx.MockTransport(_empty))
    with BibleClient("k", http_client=http_client):
        pass
    assert http_client.is_closed


def test_last_meta_exposes_fums(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"data": [], "meta": {"fumsToken": "tok-1", "fumsId": "abc123"}}
        )

    with make_client(handler) as client:
        assert client.last_meta is None
        client.bibles.list()
        assert client.last_meta is not None
        assert client.last_meta.fums_token == "tok-1"
        assert client.last_meta.fums_id == "abc123"


def test_last_meta_cleared_after_failed_call(make_client) -> None:
    """A failed call must not leave a previous call's FUMS metadata visible."""
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json={"data": [], "meta": {"fumsId": "abc123"}})
        return httpx.Response(404, json={"message": "nope"})

    with make_client(handler) as client:
        client.bibles.list()
        assert client.last_meta is not None
        with pytest.raises(NotFoundError):
            client.bibles.get("missing")
        assert client.last_meta is None


def test_sets_user_agent_identifying_the_sdk(make_client) -> None:
    seen: dict[str, str | None] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["ua"] = request.headers.get("user-agent")
        return _empty(request)

    with make_client(handler) as client:
        client.bibles.list()

    assert seen["ua"] is not None
    assert seen["ua"].startswith("api-bible-sdk-python/")
    assert __version__ in seen["ua"]


def test_user_agent_can_be_overridden(make_client) -> None:
    seen: dict[str, str | None] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["ua"] = request.headers.get("user-agent")
        return _empty(request)

    # A single, caller-supplied UA — no duplicate header from the default.
    with make_client(handler, headers={"User-Agent": "custom/1.0"}) as client:
        client.bibles.list()

    assert seen["ua"] == "custom/1.0"


def test_last_meta_is_isolated_across_threads(make_client) -> None:
    """A shared client must not let one thread's FUMS metadata leak into another."""

    def handler(request: httpx.Request) -> httpx.Response:
        # Echo the requested bible id back as the FUMS id so each thread can
        # recognize its own response.
        bible_id = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(
            200, json={"data": {"id": bible_id, "name": bible_id}, "meta": {"fumsId": bible_id}}
        )

    thread_count = 8
    barrier = threading.Barrier(thread_count)
    errors: list[str] = []

    with make_client(handler) as client:

        def worker(n: int) -> None:
            bible_id = f"bible-{n}"
            barrier.wait()  # release every thread at once to maximize contention
            for _ in range(50):
                client.bibles.get(bible_id)
                meta = client.last_meta
                if meta is None or meta.fums_id != bible_id:
                    errors.append(f"thread {n} saw {meta and meta.fums_id}")
                    return

        threads = [threading.Thread(target=worker, args=(n,)) for n in range(thread_count)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

    assert not errors, errors
