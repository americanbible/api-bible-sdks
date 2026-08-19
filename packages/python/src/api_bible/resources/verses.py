from __future__ import annotations

import builtins  # `list` method below shadows the builtin in later annotations
from collections.abc import Mapping

from .._serialize import encode_path
from ..models import ApiResponse, Result, Verse, VerseSummary
from ._base import BaseResource


class VersesResource(BaseResource):
    """Endpoints under ``/bibles/{bibleId}/.../verses``."""

    def list(
        self,
        bible_id: str,
        chapter_id: str,
        *,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> builtins.list[VerseSummary]:
        """Return the verses of a chapter."""
        resp = self._transport.request(
            "GET",
            encode_path("bibles", bible_id, "chapters", chapter_id, "verses"),
            model=ApiResponse[builtins.list[VerseSummary]],
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def get(
        self,
        bible_id: str,
        verse_id: str,
        *,
        content_type: str | None = None,
        include_notes: bool | None = None,
        include_titles: bool | None = None,
        include_chapter_numbers: bool | None = None,
        include_verse_numbers: bool | None = None,
        include_verse_spans: bool | None = None,
        parallels: builtins.list[str] | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Verse:
        """Return a single verse, including rendered content."""
        return self.get_with_meta(
            bible_id,
            verse_id,
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
        verse_id: str,
        *,
        content_type: str | None = None,
        include_notes: bool | None = None,
        include_titles: bool | None = None,
        include_chapter_numbers: bool | None = None,
        include_verse_numbers: bool | None = None,
        include_verse_spans: bool | None = None,
        parallels: builtins.list[str] | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Result[Verse]:
        """Like :meth:`get`, but also returns the response's FUMS ``meta``.

        Use this when you need the analytics metadata tied reliably to this
        response rather than via the thread-local ``last_meta``.
        """
        resp = self._content_get(
            encode_path("bibles", bible_id, "verses", verse_id),
            ApiResponse[Verse],
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
