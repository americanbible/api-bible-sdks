"""Tests over a real loopback socket.

Everything else in the unit suite uses ``httpx.MockTransport``, which skips the
HTTP/1.1 layer (h11) that serializes and validates headers. These tests cover
what only shows up on the wire, on both clients.
"""

from __future__ import annotations

import http.server
import threading
from collections.abc import Iterator
from typing import Any

import pytest
from harness import Api, backend_for

from api_bible import NetworkError, RequestEvent, RetryConfig


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


@pytest.fixture
def anyio_backend(kind: str) -> str:
    return backend_for(kind)


def _client(api: Api, api_key: str, base_url: str, events: list[RequestEvent]) -> Any:
    return api.open(
        api_key,
        base_url=base_url,
        allow_insecure_http=True,
        retry=RetryConfig(base_delay=0.0, jitter=lambda: 0.0),
        on_request=events.append,
    )


@pytest.mark.anyio
async def test_api_key_with_trailing_newline_is_sent_stripped(api: Api, base_url: str) -> None:
    events: list[RequestEvent] = []
    async with _client(api, "SECRETKEY123\n", base_url, events) as client:
        assert await client.bibles.list() == []

    assert [event.status_code for event in events] == [200]


@pytest.mark.anyio
async def test_illegal_header_value_fails_once_without_echoing_it(api: Api, base_url: str) -> None:
    events: list[RequestEvent] = []
    async with _client(api, "test-key", base_url, events) as client:
        with pytest.raises(NetworkError, match="illegal value") as exc_info:
            await client.bibles.list(headers={"x-trace": "SECRETVALUE\n"})

    assert "SECRETVALUE" not in str(exc_info.value)
    assert [event.error for event in events] == ["invalid header"]
