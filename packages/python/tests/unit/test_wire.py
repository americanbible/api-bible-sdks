"""Tests over a real loopback socket.

Everything else in the unit suite uses ``httpx.MockTransport``, which skips the
HTTP/1.1 layer (h11) that serializes and validates headers. These tests cover
what only shows up on the wire.
"""

from __future__ import annotations

import http.server
import threading
from collections.abc import Iterator

import pytest

from api_bible import BibleClient, NetworkError, RequestEvent, RetryConfig


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        body = b'{"data": []}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # silence stderr
        pass


@pytest.fixture
def base_url() -> Iterator[str]:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


def _client(api_key: str, base_url: str, events: list[RequestEvent]) -> BibleClient:
    return BibleClient(
        api_key,
        base_url=base_url,
        allow_insecure_http=True,
        retry=RetryConfig(base_delay=0.0, jitter=lambda: 0.0),
        on_request=events.append,
    )


def test_api_key_with_trailing_newline_is_sent_stripped(base_url: str) -> None:
    events: list[RequestEvent] = []
    with _client("SECRETKEY123\n", base_url, events) as client:
        assert client.bibles.list() == []

    assert [event.status_code for event in events] == [200]


def test_illegal_header_value_fails_once_without_echoing_it(base_url: str) -> None:
    events: list[RequestEvent] = []
    with (
        _client("test-key", base_url, events) as client,
        pytest.raises(NetworkError, match="illegal value") as exc_info,
    ):
        client.bibles.list(headers={"x-trace": "SECRETVALUE\n"})

    assert "SECRETVALUE" not in str(exc_info.value)
    assert [event.error for event in events] == ["invalid header"]
