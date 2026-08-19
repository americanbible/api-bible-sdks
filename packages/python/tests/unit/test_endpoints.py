"""Exercises every resource method: correct path + a parseable response."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx
import pytest

from api_bible import BibleClient

# (id, call, expected path, response `data` payload)
CASES: list[tuple[str, Callable[[BibleClient], Any], str, Any]] = [
    (
        "books.list",
        lambda c: c.books.list("b1"),
        "/v1/bibles/b1/books",
        [{"id": "GEN", "bibleId": "b1"}],
    ),
    (
        "books.get",
        lambda c: c.books.get("b1", "GEN"),
        "/v1/bibles/b1/books/GEN",
        {"id": "GEN", "bibleId": "b1"},
    ),
    (
        "chapters.list",
        lambda c: c.chapters.list("b1", "GEN"),
        "/v1/bibles/b1/books/GEN/chapters",
        [{"id": "GEN.1", "bibleId": "b1", "bookId": "GEN", "number": "1"}],
    ),
    (
        "verses.list",
        lambda c: c.verses.list("b1", "GEN.1"),
        "/v1/bibles/b1/chapters/GEN.1/verses",
        [{"id": "GEN.1.1", "bibleId": "b1", "bookId": "GEN", "chapterId": "GEN.1"}],
    ),
    (
        "verses.get",
        lambda c: c.verses.get("b1", "GEN.1.1"),
        "/v1/bibles/b1/verses/GEN.1.1",
        {"id": "GEN.1.1", "bibleId": "b1", "bookId": "GEN", "chapterId": "GEN.1"},
    ),
    (
        "passages.get",
        lambda c: c.passages.get("b1", "GEN.1.1-GEN.1.3"),
        "/v1/bibles/b1/passages/GEN.1.1-GEN.1.3",
        {"id": "GEN.1.1-GEN.1.3", "bibleId": "b1"},
    ),
    (
        "sections.list_for_book",
        lambda c: c.sections.list_for_book("b1", "GEN"),
        "/v1/bibles/b1/books/GEN/sections",
        [{"id": "s1", "bibleId": "b1", "bookId": "GEN"}],
    ),
    (
        "sections.list_for_chapter",
        lambda c: c.sections.list_for_chapter("b1", "GEN.1"),
        "/v1/bibles/b1/chapters/GEN.1/sections",
        [{"id": "s1", "bibleId": "b1", "bookId": "GEN"}],
    ),
    (
        "sections.get",
        lambda c: c.sections.get("b1", "s1"),
        "/v1/bibles/b1/sections/s1",
        {"id": "s1", "bibleId": "b1", "bookId": "GEN"},
    ),
    (
        "audio_bibles.list",
        lambda c: c.audio_bibles.list(),
        "/v1/audio-bibles",
        [{"id": "a1", "name": "Audio"}],
    ),
    (
        "audio_bibles.get",
        lambda c: c.audio_bibles.get("a1"),
        "/v1/audio-bibles/a1",
        {"id": "a1", "name": "Audio"},
    ),
    (
        "audio_bibles.list_books",
        lambda c: c.audio_bibles.list_books("a1"),
        "/v1/audio-bibles/a1/books",
        [{"id": "GEN", "bibleId": "a1"}],
    ),
    (
        "audio_bibles.get_book",
        lambda c: c.audio_bibles.get_book("a1", "GEN"),
        "/v1/audio-bibles/a1/books/GEN",
        {"id": "GEN", "bibleId": "a1"},
    ),
    (
        "audio_bibles.list_chapters",
        lambda c: c.audio_bibles.list_chapters("a1", "GEN"),
        "/v1/audio-bibles/a1/books/GEN/chapters",
        [{"id": "GEN.1", "bibleId": "a1", "bookId": "GEN"}],
    ),
    (
        "audio_bibles.get_chapter",
        lambda c: c.audio_bibles.get_chapter("a1", "GEN.1"),
        "/v1/audio-bibles/a1/chapters/GEN.1",
        {"id": "GEN.1", "bibleId": "a1", "bookId": "GEN"},
    ),
]


@pytest.mark.parametrize(
    ("call", "path", "data"),
    [(c[1], c[2], c[3]) for c in CASES],
    ids=[c[0] for c in CASES],
)
def test_endpoint(make_client, call: Callable[[BibleClient], Any], path: str, data: Any) -> None:
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        return httpx.Response(200, json={"data": data})

    with make_client(handler) as client:
        result = call(client)

    assert seen["path"] == path
    if isinstance(data, list):
        assert isinstance(result, list)
        assert len(result) == len(data)
    else:
        assert result.id == data["id"]


def test_path_ids_are_percent_encoded(make_client) -> None:
    """An id containing /, ?, # or a space must stay inside its own segment
    instead of corrupting the URL or injecting a query string."""
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["raw_path"] = request.url.raw_path.decode()
        return httpx.Response(200, json={"data": {"id": "x", "bibleId": "b"}})

    with make_client(handler) as client:
        client.books.get("a/b?c d", "GEN")

    assert seen["raw_path"] == "/v1/bibles/a%2Fb%3Fc%20d/books/GEN"
