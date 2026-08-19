"""The committed fixtures must never carry credentials.

The fixtures ship in a public repo and are regenerated monthly by
.github/workflows/refresh-fixtures.yml, which opens a PR with whatever the live
API returned. ``sanitize_body`` strips credentials at record time; this test is
the backstop that makes that guarantee enforceable — if api.bible starts
returning a secret under a field the sanitizer does not know about, the refresh
PR fails here instead of publishing it.
"""

from __future__ import annotations

import re

from replay import CREDENTIAL_MARKERS, FIXTURE_LEAK_MARKERS, FIXTURES_PATH, sanitize_body

PLACEHOLDER_URL = re.compile(r"^https://invalid\.example\.com/\S+\.\w+$")


def test_fixtures_contain_no_leak_markers() -> None:
    assert FIXTURES_PATH.exists()
    raw = FIXTURES_PATH.read_text()
    found = [marker for marker in FIXTURE_LEAK_MARKERS if marker in raw]
    assert found == [], f"recordings.json contains credential markers: {', '.join(found)}"


def test_every_resource_url_is_a_placeholder() -> None:
    raw = FIXTURES_PATH.read_text()
    urls = re.findall(r'"resourceUrl": "([^"]*)"', raw)
    assert urls
    for url in urls:
        assert PLACEHOLDER_URL.match(url), url
        assert "?" not in url


def test_sanitize_drops_fums_token_and_keeps_the_rest_of_meta() -> None:
    body = {"data": {"id": "GEN.1"}, "meta": {"fumsToken": "secret", "fumsId": "keep"}}
    assert sanitize_body(body) == {"data": {"id": "GEN.1"}, "meta": {"fumsId": "keep"}}


def test_sanitize_rewrites_presigned_resource_url() -> None:
    body = {
        "data": {
            "resourceUrl": (
                "https://api-bible-audio-assets-prod.s3.amazonaws.com"
                "/abc-01/release/audio/1CO/1CO_001.mp3"
                "?AWSAccessKeyId=ASIA0&Expires=1&Signature=xyz%3D"
            )
        }
    }
    assert sanitize_body(body) == {
        "data": {"resourceUrl": "https://invalid.example.com/abc-01/release/audio/1CO/1CO_001.mp3"}
    }


def test_sanitize_redacts_credential_string_under_unknown_key() -> None:
    # The case the marker scan exists for: a future API field the key list misses.
    body = {"data": {"downloadUrl": "https://s3.example/a.mp3?AWSAccessKeyId=ASIA0&Signature=x"}}
    assert sanitize_body(body) == {"data": {"downloadUrl": "https://invalid.example.com/a.mp3"}}


def test_sanitize_drops_a_credential_string_that_is_not_a_url() -> None:
    # No path worth keeping — echoing part of it back would defeat the point.
    body = {"data": {"token": "AWSAccessKeyId=ASIA0"}}
    assert sanitize_body(body) == {"data": {"token": "[redacted]"}}


def test_sanitize_leaves_ordinary_content_untouched() -> None:
    body = {
        "data": {"id": "GEN.1", "content": "In the beginning", "verseCount": 31, "next": None},
        "meta": {},
    }
    assert sanitize_body(body) == body


def test_sanitize_recurses_into_lists() -> None:
    body = {"data": [{"meta": {"fumsToken": "a"}}, {"meta": {"fumsToken": "b"}}]}
    assert sanitize_body(body) == {"data": [{"meta": {}}, {"meta": {}}]}


def test_marker_list_is_intact() -> None:
    # Guards against a marker being dropped from the list by accident.
    assert "x-amz-security-token" in CREDENTIAL_MARKERS
    assert "fumsToken" in FIXTURE_LEAK_MARKERS
