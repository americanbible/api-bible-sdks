from __future__ import annotations

import logging
import subprocess
import sys

import httpx
import pytest

from api_bible import (
    ApiError,
    InvalidInputError,
    NetworkError,
    NotFoundError,
    RateLimitError,
    ServerError,
    ValidationError,
)
from api_bible._http import RetryConfig, backoff_delay, next_retry_delay, parse_retry_after

# --- pure retry math -------------------------------------------------------


def test_backoff_grows_exponentially_with_full_jitter() -> None:
    cfg = RetryConfig(base_delay=1.0, max_delay=100.0, jitter=lambda: 1.0)
    assert backoff_delay(0, cfg) == 1.0
    assert backoff_delay(1, cfg) == 2.0
    assert backoff_delay(2, cfg) == 4.0


def test_backoff_capped_at_max_delay() -> None:
    cfg = RetryConfig(base_delay=1.0, max_delay=3.0, jitter=lambda: 1.0)
    assert backoff_delay(10, cfg) == 3.0


def test_jitter_scales_the_ceiling() -> None:
    cfg = RetryConfig(base_delay=8.0, max_delay=100.0, jitter=lambda: 0.5)
    assert backoff_delay(0, cfg) == 4.0


@pytest.mark.parametrize(
    ("header", "expected"),
    [("120", 120.0), ("0", 0.0), (None, None), ("", None), ("garbage", None)],
)
def test_parse_retry_after(header: str | None, expected: float | None) -> None:
    assert parse_retry_after(header) == expected


def test_parse_retry_after_http_date_in_past_is_zero() -> None:
    assert parse_retry_after("Wed, 21 Oct 2015 07:28:00 GMT") == 0.0


def test_next_retry_delay_uses_retry_after_as_floor() -> None:
    cfg = RetryConfig(base_delay=1.0, max_delay=100.0, jitter=lambda: 1.0)
    # retry_after (5) + jittered backoff (1) = 6
    assert next_retry_delay(0, 5.0, cfg) == 6.0


def test_next_retry_delay_without_retry_after() -> None:
    cfg = RetryConfig(base_delay=2.0, max_delay=100.0, jitter=lambda: 1.0)
    assert next_retry_delay(0, None, cfg) == 2.0


def test_next_retry_delay_honors_retry_after_beyond_max_delay() -> None:
    # Retry-After (50) exceeds max_delay (5) but is honored up to max_retry_after.
    cfg = RetryConfig(base_delay=5.0, max_delay=5.0, max_retry_after=100.0, jitter=lambda: 0.0)
    assert next_retry_delay(0, 50.0, cfg) == 50.0


def test_next_retry_delay_capped_at_max_retry_after() -> None:
    # retry_after (8) + jittered backoff (min(5, 5) * 1 = 5) = 13, capped at 10.
    cfg = RetryConfig(base_delay=5.0, max_delay=5.0, max_retry_after=10.0, jitter=lambda: 1.0)
    assert next_retry_delay(0, 8.0, cfg) == 10.0


# --- RetryConfig validation ------------------------------------------------


@pytest.mark.parametrize(
    ("kwargs", "match"),
    [
        ({"max_attempts": 0}, "max_attempts"),
        ({"max_attempts": -1}, "max_attempts"),
        ({"base_delay": -0.1}, "base_delay"),
        ({"max_delay": -1.0}, "max_delay"),
        ({"max_retry_after": -1.0}, "max_retry_after"),
        ({"max_elapsed": -1.0}, "max_elapsed"),
        ({"max_elapsed": 0.0}, "max_elapsed"),
    ],
)
def test_retry_config_rejects_invalid_values(kwargs: dict[str, float], match: str) -> None:
    with pytest.raises(InvalidInputError, match=match):
        RetryConfig(**kwargs)


def test_retry_config_allows_zero_delays() -> None:
    cfg = RetryConfig(max_attempts=1, base_delay=0.0, max_delay=0.0)
    assert cfg.max_attempts == 1


def test_default_max_elapsed_is_bounded() -> None:
    # A naive caller must not be able to park a worker for minutes by default.
    assert RetryConfig().max_elapsed == 60.0


# --- retry loop behaviour --------------------------------------------------


def _ok(data: object) -> httpx.Response:
    return httpx.Response(200, json={"data": data})


def test_retries_5xx_then_succeeds(make_client) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503, json={"message": "unavailable"})
        return _ok([{"id": "b1", "name": "Bible One"}])

    with make_client(handler) as client:
        bibles = client.bibles.list()

    assert calls["n"] == 3
    assert bibles[0].id == "b1"


def test_exhausts_attempts_then_raises_server_error(make_client) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(500, json={"message": "boom"})

    with make_client(handler) as client, pytest.raises(ServerError) as exc_info:
        client.bibles.list()

    assert calls["n"] == 3  # max_attempts
    assert exc_info.value.status_code == 500


def test_4xx_is_not_retried(make_client) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(404, json={"message": "nope"})

    with make_client(handler) as client, pytest.raises(NotFoundError):
        client.bibles.get("missing")

    assert calls["n"] == 1


def test_gives_up_when_retry_after_exceeds_ceiling(make_client) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(429, headers={"retry-after": "9999"}, json={"message": "slow down"})

    with make_client(handler) as client, pytest.raises(RateLimitError):
        client.bibles.list()

    assert calls["n"] == 1  # 9999 > max_retry_after (60), gave up immediately


def test_honors_retry_after_beyond_max_delay(make_client) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            # 45s exceeds max_delay (30) but is within max_retry_after (60), so
            # we wait and retry instead of giving up.
            return httpx.Response(429, headers={"retry-after": "45"}, json={"message": "slow"})
        return _ok([{"id": "b1", "name": "Bible One"}])

    with make_client(handler) as client:
        bibles = client.bibles.list()

    assert calls["n"] == 2
    assert bibles[0].id == "b1"


def test_gives_up_when_retry_after_exceeds_custom_max_retry_after(make_client) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(429, headers={"retry-after": "20"}, json={"message": "slow"})

    retry = RetryConfig(max_attempts=3, base_delay=0.0, max_retry_after=10.0, jitter=lambda: 0.0)
    with make_client(handler, retry=retry) as client, pytest.raises(RateLimitError):
        client.bibles.list()

    assert calls["n"] == 1  # 20 > max_retry_after (10), gave up immediately


def test_total_deadline_stops_retrying(make_client, monkeypatch: pytest.MonkeyPatch) -> None:
    # Fake monotonic clock that only advances when we (mock-)sleep, so elapsed
    # time across attempts is deterministic.
    clock = {"t": 0.0}

    def advance(seconds: float) -> None:
        clock["t"] += seconds

    monkeypatch.setattr("api_bible._http.time.monotonic", lambda: clock["t"])
    monkeypatch.setattr("api_bible._http.time.sleep", advance)

    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, headers={"retry-after": "10"}, json={"message": "boom"})

    # Each retry sleeps ~10s. A 15s budget allows the first retry's sleep
    # (elapsed -> 10s) but not a second (would reach 20s > 15), so we stop early
    # instead of using all 5 attempts.
    retry = RetryConfig(max_attempts=5, base_delay=0.0, max_elapsed=15.0, jitter=lambda: 0.0)
    with make_client(handler, retry=retry) as client, pytest.raises(ServerError):
        client.bibles.list()

    assert calls["n"] == 2


def test_default_max_elapsed_bounds_sustained_rate_limit(
    make_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Fake clock that advances only when we (mock-)sleep, so elapsed time is
    # deterministic and we exercise the *default* 60s budget, not an override.
    clock = {"t": 0.0}

    def advance(seconds: float) -> None:
        clock["t"] += seconds

    monkeypatch.setattr("api_bible._http.time.monotonic", lambda: clock["t"])
    monkeypatch.setattr("api_bible._http.time.sleep", advance)

    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(429, headers={"retry-after": "60"}, json={"message": "slow"})

    # Default config (max_attempts=3, max_retry_after=60, max_elapsed=60). The
    # first honored 60s wait exhausts the budget, so we give up after 2 attempts
    # instead of sleeping a second time toward the ~120s unbounded worst case.
    retry = RetryConfig(jitter=lambda: 0.0)
    with make_client(handler, retry=retry) as client, pytest.raises(RateLimitError) as exc_info:
        client.bibles.list()

    assert calls["n"] == 2
    assert exc_info.value.retry_after == 60.0


def test_network_errors_are_retried_and_wrapped(make_client) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        raise httpx.ConnectError("connection refused")

    with make_client(handler) as client, pytest.raises(NetworkError) as exc_info:
        client.bibles.list()

    assert calls["n"] == 3
    assert exc_info.value.status_code == 0


def test_pool_timeout_is_not_retried(make_client) -> None:
    # Pool exhaustion must fail fast: retrying would add load and worsen it.
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        raise httpx.PoolTimeout("pool exhausted")

    with make_client(handler) as client, pytest.raises(NetworkError, match="connection pool"):
        client.bibles.list()

    assert calls["n"] == 1


def test_non_json_content_type_raises_api_error(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        # httpx sets Content-Type to text/plain for a `text=` body.
        return httpx.Response(200, text="<html>not json</html>")

    with make_client(handler) as client, pytest.raises(ApiError, match="Content-Type"):
        client.bibles.list()


def test_empty_2xx_body_raises_api_error(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"")

    with make_client(handler) as client, pytest.raises(ApiError, match="empty response body"):
        client.bibles.list()


def test_malformed_json_body_raises_api_error(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        # Correct content type, but the body is not valid JSON.
        return httpx.Response(
            200, headers={"content-type": "application/json"}, content=b"{not valid json"
        )

    with (
        make_client(handler) as client,
        pytest.raises(ApiError, match="expected a JSON response body"),
    ):
        client.bibles.list()


def test_schema_mismatch_raises_validation_error(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": "shape"})  # missing `data`

    with make_client(handler) as client, pytest.raises(ValidationError) as exc_info:
        client.bibles.list()

    assert exc_info.value.errors
    assert "schema" in exc_info.value.format()


def test_retry_logs_warning_and_giveup(make_client, caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"message": "down"})

    with (
        caplog.at_level(logging.WARNING, logger="api_bible"),
        make_client(handler) as client,
        pytest.raises(ServerError),
    ):
        client.bibles.list()

    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "retrying in" in messages  # warned before each backoff
    assert "giving up after" in messages  # warned once attempts were exhausted
    assert "HTTP 503" in messages  # the failure reason is included


def test_logs_never_include_the_api_key(make_client, caplog) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"message": "down"})

    with (
        caplog.at_level(logging.DEBUG, logger="api_bible"),
        make_client(handler) as client,
        pytest.raises(ServerError),
    ):
        client.bibles.list()

    assert caplog.records  # sanity: we did log something
    assert all("test-key" not in record.getMessage() for record in caplog.records)


# --- observability hook ----------------------------------------------------


def test_on_request_observer_receives_event_on_success(make_client) -> None:
    events = []

    def handler(request: httpx.Request) -> httpx.Response:
        return _ok([])

    with make_client(handler, on_request=events.append) as client:
        client.bibles.list()

    assert len(events) == 1
    event = events[0]
    assert event.method == "GET"
    assert "bibles" in event.path
    assert event.status_code == 200
    assert event.attempt == 1
    assert event.error is None
    assert event.elapsed_ms >= 0.0


def test_on_request_observer_receives_response_headers(make_client) -> None:
    events = []

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"X-RateLimit-Remaining": "42"}, json={"data": []})

    with make_client(handler, on_request=events.append) as client:
        client.bibles.list()

    assert len(events) == 1
    assert events[0].headers is not None
    # A caller can read rate-limit headers off the event to throttle proactively.
    assert events[0].headers["x-ratelimit-remaining"] == "42"


def test_on_request_observer_fires_once_per_attempt(make_client) -> None:
    events = []
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, json={"message": "down"})
        return _ok([])

    with make_client(handler, on_request=events.append) as client:
        client.bibles.list()

    assert [(e.status_code, e.attempt) for e in events] == [(503, 1), (200, 2)]


def test_on_request_observer_records_transport_failures(make_client) -> None:
    events = []

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    with make_client(handler, on_request=events.append) as client, pytest.raises(NetworkError):
        client.bibles.list()

    assert len(events) == 3  # one per attempt
    assert all(e.status_code is None for e in events)
    assert all(e.error == "network error" for e in events)
    assert all(e.headers is None for e in events)  # no response, so no headers


def test_on_request_observer_records_pool_timeout(make_client) -> None:
    events = []

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.PoolTimeout("pool exhausted")

    with make_client(handler, on_request=events.append) as client, pytest.raises(NetworkError):
        client.bibles.list()

    assert len(events) == 1  # pool timeout is not retried
    assert events[0].status_code is None
    assert events[0].error == "pool timeout"


def test_on_request_observer_exception_never_breaks_the_call(make_client, caplog) -> None:
    calls = {"n": 0}

    def observer(event: object) -> None:
        calls["n"] += 1
        raise ValueError("boom")

    def handler(request: httpx.Request) -> httpx.Response:
        return _ok([{"id": "b1", "name": "Bible One"}])

    with (
        caplog.at_level(logging.ERROR, logger="api_bible"),
        make_client(handler, on_request=observer) as client,
    ):
        bibles = client.bibles.list()

    assert bibles[0].id == "b1"  # the request still succeeded
    assert calls["n"] == 1  # the observer was invoked
    assert any("on_request observer raised" in r.getMessage() for r in caplog.records)


# --- retry observability hook ----------------------------------------------


def test_on_retry_observer_fires_once_per_retry(make_client) -> None:
    events = []
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503, json={"message": "down"})
        return _ok([])

    with make_client(handler, on_retry=events.append) as client:
        client.bibles.list()

    # Three attempts -> two retries, each labelled with the failing attempt.
    assert [(e.attempt, e.reason) for e in events] == [(1, "HTTP 503"), (2, "HTTP 503")]
    assert all(e.method == "GET" and "bibles" in e.path for e in events)
    assert all(e.delay_ms == 0.0 for e in events)  # base_delay=0, jitter=0 in tests
    assert all(e.retry_after_ms is None for e in events)


def test_on_retry_observer_reports_retry_after(make_client) -> None:
    events = []
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, headers={"retry-after": "5"}, json={"message": "slow"})
        return _ok([])

    with make_client(handler, on_retry=events.append) as client:
        client.bibles.list()

    assert len(events) == 1
    assert events[0].reason == "HTTP 429"
    assert events[0].retry_after_ms == 5000.0
    assert events[0].delay_ms == 5000.0  # honored as the floor (base_delay/jitter are 0)


def test_on_retry_observer_reports_transport_failures(make_client) -> None:
    events = []

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    with make_client(handler, on_retry=events.append) as client, pytest.raises(NetworkError):
        client.bibles.list()

    # Three attempts all fail -> two retries before the final give-up.
    assert [(e.attempt, e.reason) for e in events] == [(1, "network error"), (2, "network error")]


def test_on_retry_observer_silent_on_success_and_non_retryable(make_client) -> None:
    events = []

    def ok_handler(request: httpx.Request) -> httpx.Response:
        return _ok([])

    with make_client(ok_handler, on_retry=events.append) as client:
        client.bibles.list()
    assert events == []  # nothing retried on first-try success

    def not_found_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "nope"})

    with (
        make_client(not_found_handler, on_retry=events.append) as client,
        pytest.raises(NotFoundError),
    ):
        client.bibles.get("missing")
    assert events == []  # 4xx is not retried, so no retry event


def test_on_retry_observer_exception_never_breaks_the_call(make_client, caplog) -> None:
    calls = {"n": 0}

    def observer(event: object) -> None:
        raise ValueError("boom")

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, json={"message": "down"})
        return _ok([{"id": "b1", "name": "Bible One"}])

    with (
        caplog.at_level(logging.ERROR, logger="api_bible"),
        make_client(handler, on_retry=observer) as client,
    ):
        bibles = client.bibles.list()

    assert bibles[0].id == "b1"  # the retry still happened and the call succeeded
    assert any("on_retry observer raised" in r.getMessage() for r in caplog.records)


# --- response size cap -----------------------------------------------------


def test_oversized_response_is_rejected_and_not_retried(make_client) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={"data": [{"id": "b1", "name": "x" * 1000}]})

    with (
        make_client(handler, max_response_bytes=64) as client,
        pytest.raises(ApiError, match="max_response_bytes"),
    ):
        client.bibles.list()

    assert calls["n"] == 1  # deterministic failure -> not retried


def test_max_response_bytes_none_disables_the_cap(make_client) -> None:
    big = "x" * 100_000

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"id": "b1", "name": big}]})

    with make_client(handler, max_response_bytes=None) as client:
        bibles = client.bibles.list()

    assert bibles[0].name == big


def test_response_under_cap_is_parsed(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _ok([{"id": "b1", "name": "Bible One"}])

    with make_client(handler, max_response_bytes=10_000) as client:
        bibles = client.bibles.list()

    assert bibles[0].id == "b1"


@pytest.mark.parametrize("value", [0, -1])
def test_invalid_max_response_bytes_rejected(make_client, value: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _ok([])

    with pytest.raises(InvalidInputError, match="max_response_bytes"):
        make_client(handler, max_response_bytes=value)


# --- per-request headers ---------------------------------------------------


def test_per_request_headers_are_sent_alongside_client_headers(make_client) -> None:
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["traceparent"] = request.headers.get("traceparent")
        seen["user-agent"] = request.headers.get("user-agent")
        return _ok([])

    with make_client(handler) as client:
        client.bibles.list(headers={"traceparent": "00-trace-span-01"})

    assert seen["traceparent"] == "00-trace-span-01"
    # The per-request header merges in without clobbering client-level headers.
    assert seen["user-agent"].startswith("api-bible-sdk-python/")


def test_per_request_headers_cannot_override_the_api_key(make_client) -> None:
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["api-key"] = request.headers.get("api-key")
        return _ok([])

    with make_client(handler) as client:
        client.bibles.list(headers={"api-key": "evil"})

    assert seen["api-key"] == "test-key"  # the configured key always wins


def test_per_request_headers_thread_through_content_endpoints(make_client) -> None:
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["traceparent"] = request.headers.get("traceparent")
        return httpx.Response(
            200,
            json={"data": {"id": "GEN.1", "bibleId": "b1", "bookId": "GEN", "number": "1"}},
        )

    # chapters.get -> get_with_meta -> _content_get, so this covers the shared
    # content-endpoint path, not just the direct transport call.
    with make_client(handler) as client:
        client.chapters.get("b1", "GEN.1", headers={"traceparent": "trace-1"})

    assert seen["traceparent"] == "trace-1"


def test_retry_exhaustion_raises_real_error_under_optimized_mode() -> None:
    """Under `python -O` asserts are stripped; exhausting retries must still
    raise the real ServerError, not a stripped-assert artifact (TypeError)."""
    script = (
        "import httpx\n"
        "from api_bible import BibleClient, RetryConfig, ServerError\n"
        "def handler(request):\n"
        "    return httpx.Response(500, json={'message': 'boom'})\n"
        "http = httpx.Client(base_url='https://rest.api.bible/v1',"
        " transport=httpx.MockTransport(handler))\n"
        "client = BibleClient('k', http_client=http,"
        " retry=RetryConfig(max_attempts=2, base_delay=0.0, jitter=lambda: 0.0))\n"
        "try:\n"
        "    client.bibles.list()\n"
        "except ServerError as exc:\n"
        "    raise SystemExit(0 if exc.status_code == 500 else 'wrong status')\n"
        "raise SystemExit('expected ServerError')\n"
    )
    result = subprocess.run([sys.executable, "-O", "-c", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
