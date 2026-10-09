from __future__ import annotations

import pytest

from api_bible import InvalidInputError
from api_bible._serialize import expand_route, to_query


def test_drops_none_values() -> None:
    assert to_query(language="eng", name=None) == {"language": "eng"}


def test_snake_case_becomes_kebab_case() -> None:
    assert to_query(include_full_details=True) == {"include-full-details": "true"}


def test_bool_renders_lowercase() -> None:
    assert to_query(include_notes=False) == {"include-notes": "false"}


def test_sequence_joined_with_commas() -> None:
    assert to_query(ids=["a", "b", "c"]) == {"ids": "a,b,c"}


def test_int_coerced_to_string() -> None:
    assert to_query(limit=10) == {"limit": "10"}


def test_empty_when_all_none() -> None:
    assert to_query(a=None, b=None) == {}


def test_comma_in_element_is_rejected() -> None:
    with pytest.raises(InvalidInputError, match="comma"):
        to_query(ids=["good", "ba,d"])


def test_expand_route_fills_placeholders() -> None:
    route = "/bibles/{bible_id}/books/{book_id}"
    assert expand_route(route, bible_id="b1", book_id="GEN") == "/bibles/b1/books/GEN"


def test_expand_route_without_ids_returns_route() -> None:
    assert expand_route("/bibles") == "/bibles"


def test_expand_route_leaves_normal_ids_intact() -> None:
    # Real ids use only unreserved chars, so encoding is a no-op for them.
    path = expand_route("/bibles/{bible_id}", bible_id="GEN.1.1-GEN.1.3")
    assert path == "/bibles/GEN.1.1-GEN.1.3"


def test_expand_route_escapes_unsafe_characters() -> None:
    # A stray /, ?, #, space or brace stays confined to its own segment.
    path = expand_route("/bibles/{bible_id}", bible_id="a/b?c#d e{x}")
    assert path == "/bibles/a%2Fb%3Fc%23d%20e%7Bx%7D"


@pytest.mark.parametrize("value", ["", " ", "\t", ".", ".."])
def test_expand_route_rejects_empty_and_dot_ids(value: str) -> None:
    # These survive percent-encoding and would hit a different endpoint.
    with pytest.raises(InvalidInputError, match="invalid bible_id"):
        expand_route("/bibles/{bible_id}", bible_id=value)


def test_expand_route_allows_dots_inside_ids() -> None:
    # Only exact "." / ".." are dot-segments; dotted ids are fine.
    path = expand_route("/x/{a}/{b}", a="GEN.1", b="...")
    assert path == "/x/GEN.1/..."
