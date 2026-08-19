from __future__ import annotations

import builtins  # `list` method below shadows the builtin in later annotations
from collections.abc import Mapping

from .._serialize import encode_path, to_query
from ..models import ApiResponse, AudioBible, AudioBibleSummary, AudioBook, AudioChapter
from ._base import BaseResource


class AudioBiblesResource(BaseResource):
    """Endpoints under ``/audio-bibles``."""

    def list(
        self,
        *,
        language: str | None = None,
        abbreviation: str | None = None,
        name: str | None = None,
        ids: list[str] | None = None,
        include_full_details: bool | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> list[AudioBibleSummary]:
        """Return the audio bibles matching the given filters."""
        params = to_query(
            language=language,
            abbreviation=abbreviation,
            name=name,
            ids=ids,
            include_full_details=include_full_details,
        )
        resp = self._transport.request(
            "GET",
            "/audio-bibles",
            model=ApiResponse[list[AudioBibleSummary]],
            params=params or None,
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def get(
        self,
        audio_bible_id: str,
        *,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> AudioBible:
        """Return a single audio bible by id."""
        resp = self._transport.request(
            "GET",
            encode_path("audio-bibles", audio_bible_id),
            model=ApiResponse[AudioBible],
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def list_books(
        self,
        audio_bible_id: str,
        *,
        include_chapters: bool | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> builtins.list[AudioBook]:
        """Return the books of an audio bible."""
        params = to_query(include_chapters=include_chapters)
        resp = self._transport.request(
            "GET",
            encode_path("audio-bibles", audio_bible_id, "books"),
            model=ApiResponse[list[AudioBook]],
            params=params or None,
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def get_book(
        self,
        audio_bible_id: str,
        book_id: str,
        *,
        include_chapters: bool | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> AudioBook:
        """Return a single book of an audio bible."""
        params = to_query(include_chapters=include_chapters)
        resp = self._transport.request(
            "GET",
            encode_path("audio-bibles", audio_bible_id, "books", book_id),
            model=ApiResponse[AudioBook],
            params=params or None,
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def list_chapters(
        self,
        audio_bible_id: str,
        book_id: str,
        *,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> builtins.list[AudioChapter]:
        """Return the chapters of a book in an audio bible."""
        resp = self._transport.request(
            "GET",
            encode_path("audio-bibles", audio_bible_id, "books", book_id, "chapters"),
            model=ApiResponse[list[AudioChapter]],
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def get_chapter(
        self,
        audio_bible_id: str,
        chapter_id: str,
        *,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> AudioChapter:
        """Return a single chapter of an audio bible."""
        resp = self._transport.request(
            "GET",
            encode_path("audio-bibles", audio_bible_id, "chapters", chapter_id),
            model=ApiResponse[AudioChapter],
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data
