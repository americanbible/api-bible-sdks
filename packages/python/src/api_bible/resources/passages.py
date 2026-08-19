from __future__ import annotations

from collections.abc import Mapping

from .._serialize import encode_path
from ..models import ApiResponse, Passage, Result
from ._base import BaseResource


class PassagesResource(BaseResource):
    """Endpoints under ``/bibles/{bibleId}/passages``."""

    def get(
        self,
        bible_id: str,
        passage_id: str,
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
    ) -> Passage:
        """Return a passage (a verse range), including rendered content."""
        return self.get_with_meta(
            bible_id,
            passage_id,
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
        passage_id: str,
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
    ) -> Result[Passage]:
        """Like :meth:`get`, but also returns the response's FUMS ``meta``.

        Use this when you need the analytics metadata tied reliably to this
        response rather than via the thread-local ``last_meta``.
        """
        resp = self._content_get(
            encode_path("bibles", bible_id, "passages", passage_id),
            ApiResponse[Passage],
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
