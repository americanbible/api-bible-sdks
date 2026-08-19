from __future__ import annotations

from collections.abc import Mapping
from typing import TypeVar

from pydantic import BaseModel

from .._http import Transport
from .._serialize import to_query

EnvelopeT = TypeVar("EnvelopeT", bound=BaseModel)


class BaseResource:
    """Thin shared parent for every resource: holds the transport handle."""

    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def _content_get(
        self,
        path: str,
        model: type[EnvelopeT],
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
    ) -> EnvelopeT:
        """GET a single content item, returning the full ``{data, meta}`` envelope.

        Shared by the content-bearing endpoints (chapter/verse/passage/section
        ``get``), which all accept the same content-rendering query parameters.
        Callers unwrap ``.data`` (and optionally ``.meta``) themselves.
        """
        params = to_query(
            content_type=content_type,
            include_notes=include_notes,
            include_titles=include_titles,
            include_chapter_numbers=include_chapter_numbers,
            include_verse_numbers=include_verse_numbers,
            include_verse_spans=include_verse_spans,
            parallels=parallels,
        )
        return self._transport.request(
            "GET", path, model=model, params=params or None, timeout=timeout, extra_headers=headers
        )
