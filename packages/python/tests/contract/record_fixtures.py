"""Regenerate tests/contract/fixtures/recordings.json from the live api.bible API.

Usage::

    API_BIBLE_KEY=... python tests/contract/record_fixtures.py

Drives every shared contract case against the real API, captures each JSON
response via an httpx event hook, and writes them keyed by ``pathname + search``.

Bodies are sanitized before they are written: the audio-bible ``resourceUrl`` is
a presigned S3 URL (STS key id + signature + session token) and
``meta.fumsToken`` is a live analytics token. See ``sanitize_body`` in
``replay.py`` — the fixtures are committed to a public repo and refreshed
monthly by CI, so this has to happen here, not by hand.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import httpx
from cases import CASES
from replay import FIXTURES_PATH, request_key, sanitize_body

from api_bible import BibleClient


def main() -> int:
    api_key = os.environ.get("API_BIBLE_KEY") or os.environ.get("BIBLE_API_KEY")
    if not api_key:
        print("set API_BIBLE_KEY (or BIBLE_API_KEY) to record fixtures", file=sys.stderr)
        return 1

    recorded: dict[str, dict[str, Any]] = {}

    def capture(response: httpx.Response) -> None:
        response.read()
        try:
            body = response.json()
        except ValueError:
            return
        recorded[request_key(response.request.url)] = {
            "status": response.status_code,
            "body": sanitize_body(body),
        }

    http_client = httpx.Client(
        base_url="https://rest.api.bible/v1",
        timeout=20.0,
        event_hooks={"response": [capture]},
    )
    with BibleClient(api_key, http_client=http_client) as client:
        for name, run in CASES:
            try:
                run(client)
            except Exception as exc:  # noqa: BLE001 - best-effort recording
                print(f"warning: case {name!r} failed: {exc}", file=sys.stderr)

    payload = {
        "_comment": (
            "Recorded api.bible responses, keyed by pathname+search, then sanitized "
            "(see sanitize_body in replay.py). Scripture text is the Berean Standard "
            "Bible (public domain, CC0). Audio-bible entries are third-party licensed "
            "metadata only - presigned URLs are rewritten to invalid.example.com and "
            "FUMS tokens are dropped. "
            "Regenerate with `python tests/contract/record_fixtures.py`."
        ),
        "requests": recorded,
    }
    FIXTURES_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(f"wrote {len(recorded)} recordings to {FIXTURES_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
