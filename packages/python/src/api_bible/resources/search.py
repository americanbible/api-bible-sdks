from __future__ import annotations

from collections.abc import Mapping

from .._serialize import encode_path, to_query
from ..models import ApiResponse, SearchResult
from ._base import BaseResource


class SearchResource(BaseResource):
    """The ``/bibles/{bibleId}/search`` endpoint."""

    def search(
        self,
        bible_id: str,
        query: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
        sort: str | None = None,
        range: str | None = None,
        fuzziness: str | None = None,
        timeout: float | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> SearchResult:
        """Full-text search within a bible.

        ``limit`` / ``offset`` page the results; this is the only paginated
        endpoint in the API.
        """
        params = to_query(
            query=query,
            limit=limit,
            offset=offset,
            sort=sort,
            range=range,
            fuzziness=fuzziness,
        )
        resp = self._transport.request(
            "GET",
            encode_path("bibles", bible_id, "search"),
            model=ApiResponse[SearchResult],
            params=params or None,
            timeout=timeout,
            extra_headers=headers,
        )
        return resp.data
