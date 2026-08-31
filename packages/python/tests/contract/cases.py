"""Shared contract-case table, driven by both tiers.

One case = one logical exercise of a resource. ``run`` drives the real client;
every method it calls validates its response against the SDK's Pydantic models,
so a ``run`` that returns means every response it touched matched the schema.

- ``test_contract_fixtures.py`` replays recorded JSON through an injected
  transport (deterministic, offline, runs in PR CI).
- ``test_contract_live.py`` hits real api.bible (key-gated, nightly).

Cases that need an id the API doesn't guarantee (a section id, an audio bible
id) discover it from a list call and bail out quietly when there's nothing to
fetch, so the live tier never flakes on data availability.
"""

from __future__ import annotations

from collections.abc import Callable

from api_bible import BibleClient

# The Berean Standard Bible (BSB) — public domain (CC0), stable on api.bible,
# and the same id used across the README, examples, and both SDKs. Using it for
# every case keeps recorded fixtures free of copyrighted scripture.
BSB = "bba9f40183526463-01"

ContractCase = tuple[str, Callable[[BibleClient], None]]


def _sections(c: BibleClient) -> None:
    # If BSB exposes no /sections data on api.bible, list_for_book returns [] and
    # get() is skipped — the case still validates the (empty) list responses, so
    # the offline fixtures carry no section text.
    for_book = c.sections.list_for_book(BSB, "GEN")
    c.sections.list_for_chapter(BSB, "GEN.1")
    if for_book:
        c.sections.get(BSB, for_book[0].id)


def _verses_boundary(c: BibleClient) -> None:
    # The edges of the Bible, where the API sends `next: {}` / `previous: {}`
    # instead of omitting the key. GEN.1.1 above never reaches either edge, which
    # is why the required `id` on the nav pointer went unnoticed. Mirrors the
    # TypeScript `verses.get.boundary` case.
    c.verses.get(BSB, "REV.22.21", content_type="text")
    c.verses.get(BSB, "GEN.intro.0", content_type="text")


def _audio(c: BibleClient) -> None:
    # Unlike every other case, this one does not pin a Bible — it takes whichever
    # audio Bible api.bible lists first for "eng". That listing reorders, so the
    # Bible recorded here changes between refreshes, and whatever lands may be
    # third-party licensed rather than public domain. Check the recorded
    # copyright before assuming anything about the content.
    #
    # The recorded fixture is deliberately metadata-only. get_chapter returns a
    # presigned S3 resource_url that grants real access to the audio until its
    # signature expires, so the recorder rewrites it to invalid.example.com —
    # the metadata is fine to publish, the URL is not. See sanitize_body in
    # replay.py.
    audio = c.audio_bibles.list(language="eng")
    if not audio:
        return
    bible = audio[0]
    c.audio_bibles.get(bible.id)

    books = c.audio_bibles.list_books(bible.id)
    if not books:
        return

    chapters = c.audio_bibles.list_chapters(bible.id, books[0].id)
    if not chapters:
        return

    c.audio_bibles.get_chapter(bible.id, chapters[0].id)


CASES: list[ContractCase] = [
    ("bibles.list", lambda c: c.bibles.list(language="eng")),
    ("bibles.get", lambda c: c.bibles.get(BSB)),
    ("books.list", lambda c: c.books.list(BSB)),
    ("books.get", lambda c: c.books.get(BSB, "GEN")),
    ("chapters.list", lambda c: c.chapters.list(BSB, "GEN")),
    ("chapters.get", lambda c: c.chapters.get(BSB, "GEN.1", content_type="text")),
    ("verses.list", lambda c: c.verses.list(BSB, "GEN.1")),
    ("verses.get", lambda c: c.verses.get(BSB, "GEN.1.1", content_type="text")),
    ("verses.get.boundary", _verses_boundary),
    ("passages.get", lambda c: c.passages.get(BSB, "GEN.1.1-GEN.1.3", content_type="text")),
    ("search", lambda c: c.search.search(BSB, "love", limit=3)),
    # /search answers in one of two disjoint shapes. A query the API parses as a
    # scripture reference returns `passages` and omits the paging scalars
    # entirely, so the keyword case above cannot cover it.
    ("search.reference", lambda c: c.search.search(BSB, "John 3:16-19")),
    ("sections", _sections),
    ("audio", _audio),
]
