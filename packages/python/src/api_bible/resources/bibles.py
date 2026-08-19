from __future__ import annotations

from collections.abc import Mapping

from .._serialize import encode_path, to_query
from ..models import ApiResponse, Bible
from ._base import BaseResource


class BiblesResource(BaseResource):
    """Endpoints under ``/bibles``."""

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
    ) -> list[Bible]:
        """Return the bibles matching the given filters."""
        params = to_query(
            language=language,
            abbreviation=abbreviation,
            name=name,
            ids=ids,
            include_full_details=include_full_details,
        )
        resp = self._transport.request(
            "GET",
            "/bibles",
            model=ApiResponse[list[Bible]],
            params=params or None,
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data

    def get(
        self,
        bible_id: str,
        *,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Bible:
        """Return a single bible by id."""
        resp = self._transport.request(
            "GET",
            encode_path("bibles", bible_id),
            model=ApiResponse[Bible],
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data
