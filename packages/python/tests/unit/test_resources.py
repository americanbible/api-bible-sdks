from __future__ import annotations

import httpx

from api_bible import Bible, Chapter


def test_bibles_list_maps_aliases(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["language"] == "eng"
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "bba9f40183526463-01",
                        "name": "Berean Standard Bible",
                        "abbreviationLocal": "BSB",
                        "language": {"id": "eng", "name": "English", "nameLocal": "English"},
                    }
                ]
            },
        )

    with make_client(handler) as client:
        bibles = client.bibles.list(language="eng")

    assert len(bibles) == 1
    bible = bibles[0]
    assert isinstance(bible, Bible)
    assert bible.abbreviation_local == "BSB"  # camelCase alias -> snake_case attr
    assert bible.language is not None
    assert bible.language.name_local == "English"


def test_bibles_get_builds_path(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/bibles/abc"
        return httpx.Response(200, json={"data": {"id": "abc", "name": "Test"}})

    with make_client(handler) as client:
        bible = client.bibles.get("abc")

    assert bible.id == "abc"


def test_chapter_get_sends_content_params_and_parses_string_content(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["content-type"] == "text"
        assert request.url.params["include-notes"] == "false"
        return httpx.Response(
            200,
            json={
                "data": {
                    "id": "GEN.1",
                    "bibleId": "b1",
                    "bookId": "GEN",
                    "number": "1",
                    "content": "In the beginning...",
                }
            },
        )

    with make_client(handler) as client:
        chapter = client.chapters.get("b1", "GEN.1", content_type="text", include_notes=False)

    assert isinstance(chapter, Chapter)
    assert chapter.book_id == "GEN"
    assert chapter.content == "In the beginning..."


def test_chapter_get_with_meta_returns_data_and_meta(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["content-type"] == "text"
        return httpx.Response(
            200,
            json={
                "data": {
                    "id": "GEN.1",
                    "bibleId": "b1",
                    "bookId": "GEN",
                    "number": "1",
                    "content": "In the beginning...",
                },
                "meta": {"fumsId": "fums-1"},
            },
        )

    with make_client(handler) as client:
        result = client.chapters.get_with_meta("b1", "GEN.1", content_type="text")

    assert isinstance(result.data, Chapter)
    assert result.data.content == "In the beginning..."
    assert result.meta is not None
    assert result.meta.fums_id == "fums-1"


def test_get_with_meta_meta_is_none_when_response_omits_it(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"data": {"id": "GEN.1", "bibleId": "b1", "bookId": "GEN", "number": "1"}}
        )

    with make_client(handler) as client:
        result = client.chapters.get_with_meta("b1", "GEN.1")

    assert isinstance(result.data, Chapter)
    assert result.meta is None


def test_search_sends_query_and_parses_results(make_client) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/bibles/b1/search"
        assert request.url.params["query"] == "love"
        assert request.url.params["limit"] == "5"
        return httpx.Response(
            200,
            json={
                "data": {
                    "query": "love",
                    "total": 1,
                    "verseCount": 1,
                    "verses": [{"id": "JHN.3.16", "reference": "John 3:16", "text": "For God..."}],
                }
            },
        )

    with make_client(handler) as client:
        result = client.search.search("b1", "love", limit=5)

    assert result.total == 1
    assert result.verses[0].reference == "John 3:16"
