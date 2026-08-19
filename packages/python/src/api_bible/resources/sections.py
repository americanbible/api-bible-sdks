from __future__ import annotations

from collections.abc import Mapping

from .._serialize import encode_path
from ..models import ApiResponse, Result, Section, SectionSummary
from ._base import BaseResource


class SectionsResource(BaseResource):
    """Endpoints under ``/bibles/{bibleId}/.../sections``."""

    def list_for_book(
        self,
        bible_id: str,
        book_id: str,
        *,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> list[SectionSummary]:
        """Return the sections of a book.

        api.bible responds 404 (raised as :class:`~api_bible.NotFoundError`) for a
        book that carries no section data, rather than returning an empty list.
        Wrap the call in ``try/except NotFoundError`` if a book may lack sections.
        """
        resp = self._transport.request(
            "GET",
            encode_path("bibles", bible_id, "books", book_id, "sections"),
            model=ApiResponse[list[SectionSummary]],
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def list_for_chapter(
        self,
        bible_id: str,
        chapter_id: str,
        *,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> list[SectionSummary]:
        """Return the sections of a chapter.

        As with :meth:`list_for_book`, a chapter with no section data yields a 404
        (:class:`~api_bible.NotFoundError`), not an empty list.
        """
        resp = self._transport.request(
            "GET",
            encode_path("bibles", bible_id, "chapters", chapter_id, "sections"),
            model=ApiResponse[list[SectionSummary]],
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def get(
        self,
        bible_id: str,
        section_id: str,
        *,
        content_type: str | None = None,
        include_notes: bool | None = None,
        include_titles: bool | None = None,
        include_chapter_numbers: bool | None = None,
        include_verse_numbers: bool | None = None,
        include_verse_spans: bool | None = None,
        parallels: list[str] | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Section:
        """Return a single section, including rendered content."""
        return self.get_with_meta(
            bible_id,
            section_id,
            content_type=content_type,
            include_notes=include_notes,
            include_titles=include_titles,
            include_chapter_numbers=include_chapter_numbers,
            include_verse_numbers=include_verse_numbers,
            include_verse_spans=include_verse_spans,
            parallels=parallels,
            timeout=timeout,
            headers=headers,
        ).data

    def get_with_meta(
        self,
        bible_id: str,
        section_id: str,
        *,
        content_type: str | None = None,
        include_notes: bool | None = None,
        include_titles: bool | None = None,
        include_chapter_numbers: bool | None = None,
        include_verse_numbers: bool | None = None,
        include_verse_spans: bool | None = None,
        parallels: list[str] | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Result[Section]:
        """Like :meth:`get`, but also returns the response's FUMS ``meta``.

        Use this when you need the analytics metadata tied reliably to this
        response rather than via the thread-local ``last_meta``.
        """
        resp = self._content_get(
            encode_path("bibles", bible_id, "sections", section_id),
            ApiResponse[Section],
            content_type=content_type,
            include_notes=include_notes,
            include_titles=include_titles,
            include_chapter_numbers=include_chapter_numbers,
            include_verse_numbers=include_verse_numbers,
            include_verse_spans=include_verse_spans,
            parallels=parallels,
            timeout=timeout,
            headers=headers,
        )
        return Result(data=resp.data, meta=resp.meta)
