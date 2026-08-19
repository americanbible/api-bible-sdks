from __future__ import annotations

import pytest

from api_bible import InvalidInputError
from api_bible._serialize import encode_path, to_query


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


def test_encode_path_joins_with_leading_slash() -> None:
    assert encode_path("bibles", "b1", "books") == "/bibles/b1/books"


def test_encode_path_leaves_normal_ids_intact() -> None:
    # Real ids use only unreserved chars, so encoding is a no-op for them.
    assert encode_path("bibles", "GEN.1.1-GEN.1.3") == "/bibles/GEN.1.1-GEN.1.3"


def test_encode_path_escapes_unsafe_characters() -> None:
    # A stray /, ?, # or space stays confined to its own segment.
    assert encode_path("bibles", "a/b?c#d e") == "/bibles/a%2Fb%3Fc%23d%20e"
