"""The async API mirrors the sync API exactly.

The async resources are written by hand next to the sync ones, so this guards
against drift: every public method on every sync resource and on BibleClient
has an async counterpart with the same name, parameters, defaults and type
hints, and returns (once awaited) the same type.
"""

from __future__ import annotations

import collections.abc
import functools
import inspect
import operator
import types
import typing
from collections.abc import Callable
from typing import Any

import httpx
import pytest

import api_bible._http
from api_bible import AsyncBibleClient, BibleClient
from api_bible import resources as r
from api_bible.resources._base import BaseResource, _AsyncBaseResource

RESOURCES: list[tuple[type, type]] = [
    (r.AudioBiblesResource, r.AsyncAudioBiblesResource),
    (r.BiblesResource, r.AsyncBiblesResource),
    (r.BooksResource, r.AsyncBooksResource),
    (r.ChaptersResource, r.AsyncChaptersResource),
    (r.PassagesResource, r.AsyncPassagesResource),
    (r.SearchResource, r.AsyncSearchResource),
    (r.SectionsResource, r.AsyncSectionsResource),
    (r.VersesResource, r.AsyncVersesResource),
]

# The only differences allowed between the clients. Everything else must match.
CLIENT_RENAMES = {"close": "aclose", "__enter__": "__aenter__", "__exit__": "__aexit__"}
TYPE_SWAPS: dict[Any, Any] = {httpx.Client: httpx.AsyncClient, BibleClient: AsyncBibleClient}


def _public_methods(cls: type, *, dunders: tuple[str, ...] = ()) -> dict[str, Callable[..., Any]]:
    """Public functions defined on ``cls`` (not inherited from ``object``)."""
    methods = {}
    for name in dir(cls):
        if name.startswith("_") and name not in dunders:
            continue
        attr = inspect.getattr_static(cls, name)
        if isinstance(attr, classmethod | staticmethod):
            attr = attr.__func__
        if inspect.isfunction(attr):
            methods[name] = attr
    return methods


def _swap(hint: Any) -> Any:
    """Map a sync type hint to the async client's equivalent."""
    if hint in TYPE_SWAPS:
        return TYPE_SWAPS[hint]
    if typing.get_origin(hint) in (typing.Union, types.UnionType):
        return functools.reduce(operator.or_, (_swap(arg) for arg in typing.get_args(hint)))
    return hint


def _awaited(hint: Any) -> Any:
    """The result type of an ``Awaitable[T]`` / ``Coroutine[..., T]`` hint, else the hint."""
    origin = typing.get_origin(hint)
    if origin in (collections.abc.Awaitable, collections.abc.Coroutine):
        return typing.get_args(hint)[-1]
    return hint


def _assert_counterpart(sync_fn: Callable[..., Any], async_fn: Callable[..., Any]) -> None:
    sync_sig, async_sig = inspect.signature(sync_fn), inspect.signature(async_fn)
    assert [(p.name, p.kind, p.default) for p in sync_sig.parameters.values()] == [
        (p.name, p.kind, p.default) for p in async_sig.parameters.values()
    ]
    # The observer aliases forward-reference RequestEvent/RetryEvent by name.
    localns = vars(api_bible._http)
    sync_hints = typing.get_type_hints(sync_fn, localns=localns)
    async_hints = typing.get_type_hints(async_fn, localns=localns)
    assert sync_hints.keys() == async_hints.keys()
    for name, hint in sync_hints.items():
        expected = _swap(hint)
        actual = async_hints[name]
        if name == "return" and inspect.iscoroutinefunction(async_fn):
            actual = _awaited(actual)
        assert actual == expected, f"{async_fn.__qualname__}: {name} is {actual}, not {expected}"


@pytest.mark.parametrize(
    ("sync_cls", "async_cls"), RESOURCES, ids=[s.__name__ for s, _ in RESOURCES]
)
def test_async_resource_mirrors_sync_resource(sync_cls: type, async_cls: type) -> None:
    sync_methods = _public_methods(sync_cls)
    async_methods = _public_methods(async_cls)
    assert sync_methods  # sanity: the introspection found something
    assert sync_methods.keys() == async_methods.keys()
    for name, sync_fn in sync_methods.items():
        async_fn = async_methods[name]
        assert inspect.iscoroutinefunction(async_fn), f"{async_cls.__name__}.{name} is not async"
        _assert_counterpart(sync_fn, async_fn)
    # The shared helper too, since every content endpoint goes through it.
    _assert_counterpart(BaseResource._content_get, _AsyncBaseResource._content_get)


def test_async_client_mirrors_sync_client() -> None:
    sync_methods = _public_methods(BibleClient, dunders=("__enter__", "__exit__"))
    async_methods = _public_methods(AsyncBibleClient, dunders=("__aenter__", "__aexit__"))
    assert {CLIENT_RENAMES.get(name, name) for name in sync_methods} == async_methods.keys()
    for name, sync_fn in sync_methods.items():
        async_name = CLIENT_RENAMES.get(name, name)
        async_fn = async_methods[async_name]
        if name != "from_env":  # a classmethod that just builds the client
            assert inspect.iscoroutinefunction(async_fn), f"AsyncBibleClient.{async_name}"
        _assert_counterpart(sync_fn, async_fn)
    _assert_counterpart(BibleClient.__init__, AsyncBibleClient.__init__)
    _assert_counterpart(BibleClient.last_meta.fget, AsyncBibleClient.last_meta.fget)


def test_async_client_exposes_the_async_resources() -> None:
    sync_client = BibleClient("k")
    async_client = AsyncBibleClient("k")
    try:
        mapping = dict(RESOURCES)
        sync_resources = {
            name: type(value)
            for name, value in vars(sync_client).items()
            if isinstance(value, BaseResource)
        }
        assert len(sync_resources) == len(RESOURCES)
        for name, sync_cls in sync_resources.items():
            assert type(getattr(async_client, name)) is mapping[sync_cls]
    finally:
        sync_client.close()
