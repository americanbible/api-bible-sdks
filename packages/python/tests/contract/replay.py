"""Replay recorded api.bible responses through an httpx transport.

Recordings are keyed by ``pathname + search`` of the request URL (origin and the
api-key header don't affect response shape, so they aren't part of the key).
Keys are normalized with sorted query params so lookups are insensitive to
parameter ordering. Shared by the recorder (writes) and the fixtures test
(reads).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlsplit

import httpx

FIXTURES_PATH = Path(__file__).parent / "fixtures" / "recordings.json"


def request_key(url: httpx.URL | str) -> str:
    """Normalize a URL into the recordings key: path + sorted query string."""
    parts = urlsplit(str(url))
    if not parts.query:
        return parts.path
    pairs = sorted(parse_qsl(parts.query, keep_blank_values=True))
    return parts.path + "?" + "&".join(f"{k}={v}" for k, v in pairs)


# Recorded bodies are not automatically safe to publish. The audio-bible
# ``resourceUrl`` is a presigned S3 URL whose query string carries an STS access
# key id, signature, and session token — committing it grants real access to the
# audio for the signature's lifetime — and ``meta.fumsToken`` is a live api.bible
# analytics token. Both are stripped at record time so the monthly
# refresh-fixtures workflow cannot re-publish them.

PLACEHOLDER_ORIGIN = "https://invalid.example.com"

#: Substrings that mark a string value as credential-bearing, whatever its key.
CREDENTIAL_MARKERS = ("AWSAccessKeyId", "X-Amz-Signature", "x-amz-security-token", "Signature=")

#: Everything the committed fixtures must never contain. Asserted by test_fixtures_clean.py.
FIXTURE_LEAK_MARKERS = (*CREDENTIAL_MARKERS, "fumsToken", "amazonaws.com")

#: Keys dropped outright — the field is optional in the model, so replay is unaffected.
DROPPED_KEYS = frozenset({"fumsToken"})

#: Keys always rewritten, marker or not, because the API may re-sign them at any time.
URL_KEYS = frozenset({"resourceUrl"})


def _redact_url(value: str) -> str:
    """Rewrite a URL to a non-resolvable placeholder, keeping the path (and extension).

    Anything that is not a parseable absolute URL is dropped wholesale rather
    than partially rewritten — a bare credential string has no path worth
    keeping, and echoing part of it back would defeat the point.
    """
    parts = urlsplit(value)
    if not parts.scheme or not parts.netloc or not parts.path:
        return "[redacted]"
    return PLACEHOLDER_ORIGIN + parts.path


def sanitize_body(body: Any) -> Any:
    """Strip credentials from a recorded response body.

    Applied at capture time by ``record_fixtures.py``, so both the committed
    fixtures and every future re-recording are clean. ``resourceUrl`` is
    rewritten rather than deleted to keep parity with the TypeScript fixtures,
    whose Zod schema requires the field.
    """
    if isinstance(body, list):
        return [sanitize_body(item) for item in body]
    if isinstance(body, dict):
        return {
            key: _redact_url(value)
            if key in URL_KEYS and isinstance(value, str)
            else sanitize_body(value)
            for key, value in body.items()
            if key not in DROPPED_KEYS
        }
    if isinstance(body, str) and any(marker in body for marker in CREDENTIAL_MARKERS):
        return _redact_url(body)
    return body


def load_recordings() -> dict[str, dict[str, Any]]:
    """Load recordings, re-keyed so lookups ignore query-param ordering."""
    if not FIXTURES_PATH.exists():
        return {}
    requests = json.loads(FIXTURES_PATH.read_text()).get("requests", {})
    return {request_key(key): rec for key, rec in requests.items()}


def make_replay_transport(recordings: dict[str, dict[str, Any]]) -> httpx.MockTransport:
    """Build a transport that serves recorded bodies by request key.

    An unrecorded request fails loudly rather than silently 404-ing, so a case
    that grows a new call breaks until its fixture is recorded.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        key = request_key(request.url)
        rec = recordings.get(key)
        if rec is None:
            raise AssertionError(
                f'No recorded fixture for "{key}". '
                "Run `python tests/contract/record_fixtures.py` to capture it."
            )
        return httpx.Response(rec["status"], json=rec["body"])

    return httpx.MockTransport(handler)
