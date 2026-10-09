"""URL serialization helpers. Private, pure, and heavily unit-tested.

``to_query`` maps Python keyword arguments to the query-string format api.bible
expects (replacing the TypeScript SDK's per-method query builders). ``expand_route``
fills a route template with percent-encoded ids to build the request path.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from urllib.parse import quote

from .errors import InvalidInputError

__all__ = ["expand_route", "to_query"]


def expand_route(route: str, **ids: str) -> str:
    """Fill a route template's ``{placeholders}`` with percent-encoded ids.

    ``expand_route("/bibles/{bible_id}", bible_id="a/b")`` returns
    ``"/bibles/a%2Fb"``. The template doubles as the low-cardinality ``route``
    reported to observers. Encoding each id stops a stray ``/``, ``?``, ``#`` or
    space from corrupting the URL or injecting a query string.

    Empty, whitespace-only, ``.`` and ``..`` ids are rejected with
    :class:`InvalidInputError`: percent-encoding leaves them intact, so they
    would collapse into a different endpoint (``/bibles/`` is the list route)
    or be normalized away by the HTTP client.
    """
    encoded: dict[str, str] = {}
    for name, value in ids.items():
        if not value.strip() or value in (".", ".."):
            raise InvalidInputError(
                f"invalid {name} {value!r}: ids must be non-empty and must not be '.' or '..'"
            )
        encoded[name] = quote(value, safe="")
    return route.format(**encoded)


def to_query(**kwargs: Any) -> dict[str, str]:
    """Serialize snake_case keyword arguments into api.bible query params.

    - drops ``None`` values
    - converts ``snake_case`` keys to ``kebab-case``
    - renders ``bool`` as ``"true"`` / ``"false"`` (not Python's ``"True"``)
    - joins sequences with commas, rejecting commas inside elements so a single
      element can never silently split into two parameters
    """
    params: dict[str, str] = {}
    for name, value in kwargs.items():
        if value is None:
            continue
        key = name.replace("_", "-")
        # `bool` is a subclass of `int` and `str` is a `Sequence`, so the order
        # of these checks matters: handle both before the generic branches.
        if isinstance(value, bool):
            params[key] = "true" if value else "false"
        elif isinstance(value, str):
            params[key] = value
        elif isinstance(value, Sequence):
            params[key] = _join_csv(value, name)
        else:
            params[key] = str(value)
    return params


def _join_csv(values: Sequence[Any], name: str) -> str:
    parts: list[str] = []
    for value in values:
        text = str(value)
        if "," in text:
            raise InvalidInputError(
                f"{name}: list element {text!r} contains a comma, which would "
                "corrupt the comma-separated query parameter"
            )
        parts.append(text)
    return ",".join(parts)
