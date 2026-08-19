from __future__ import annotations

from collections.abc import Mapping

from .._serialize import encode_path, to_query
from ..models import ApiResponse, Book
from ._base import BaseResource


class BooksResource(BaseResource):
    """Endpoints under ``/bibles/{bibleId}/books``."""

    def list(
        self,
        bible_id: str,
        *,
        include_chapters: bool | None = None,
        include_chapters_and_sections: bool | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> list[Book]:
        """Return the books of a bible."""
        params = to_query(
            include_chapters=include_chapters,
            include_chapters_and_sections=include_chapters_and_sections,
        )
        resp = self._transport.request(
            "GET",
            encode_path("bibles", bible_id, "books"),
            model=ApiResponse[list[Book]],
            params=params or None,
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def get(
        self,
        bible_id: str,
        book_id: str,
        *,
        include_chapters: bool | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Book:
        """Return a single book of a bible."""
        params = to_query(include_chapters=include_chapters)
        resp = self._transport.request(
            "GET",
            encode_path("bibles", bible_id, "books", book_id),
            model=ApiResponse[Book],
            params=params or None,
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data
