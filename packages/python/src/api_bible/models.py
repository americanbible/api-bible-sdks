"""Pydantic v2 response models.

Grouped in one module by design (not one file per entity). Every model allows
unknown fields (``extra="allow"``) so additive API changes never break
consumers, and accepts both the API's camelCase keys and the snake_case
attribute names (``populate_by_name``).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "ApiResponse",
    "Result",
    "Meta",
    "Language",
    "Country",
    "ContentNode",
    "Bible",
    "Book",
    "ChapterSummary",
    "Chapter",
    "VerseSummary",
    "Verse",
    "Passage",
    "SectionSummary",
    "Section",
    "AudioBible",
    "AudioBibleSummary",
    "AudioBook",
    "AudioChapter",
    "SearchResult",
    "SearchVerse",
    "SearchPassage",
]

DataT = TypeVar("DataT")


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


# Polymorphic content: a string for `html`/`text` content types, or a list of
# nodes for the `json` content type.
class ContentNode(_Model):
    """A node of structured (`json` content-type) scripture content."""


ContentField = str | list[ContentNode]


class Meta(_Model):
    """FUMS (Fair Use Management System) analytics metadata.

    api.bible returns this alongside responses so usage can be reported back for
    fair-use tracking. Current responses populate ``fums_token`` (the value you
    submit when reporting usage); the remaining fields belong to the older
    JavaScript-embed flow and are frequently absent. Any field not listed here is
    still preserved, since the model allows unknown fields (``extra="allow"``).
    """

    fums_token: str | None = Field(default=None, alias="fumsToken")
    fums_id: str | None = Field(default=None, alias="fumsId")
    fums: str | None = None
    fums_js: str | None = Field(default=None, alias="fumsJs")
    fums_js_include: str | None = Field(default=None, alias="fumsJsInclude")
    fums_no_script: str | None = Field(default=None, alias="fumsNoScript")


class Language(_Model):
    id: str
    name: str
    name_local: str | None = Field(default=None, alias="nameLocal")
    script: str | None = None
    script_code: str | None = Field(default=None, alias="scriptCode")
    script_direction: str | None = Field(default=None, alias="scriptDirection")


class Country(_Model):
    id: str
    name: str
    name_local: str | None = Field(default=None, alias="nameLocal")


class _Nav(_Model):
    """A next/previous navigation pointer."""

    id: str
    number: str | None = None
    book_id: str | None = Field(default=None, alias="bookId")


class Bible(_Model):
    id: str
    name: str
    dbl_id: str | None = Field(default=None, alias="dblId")
    abbreviation: str | None = None
    abbreviation_local: str | None = Field(default=None, alias="abbreviationLocal")
    description: str | None = None
    description_local: str | None = Field(default=None, alias="descriptionLocal")
    language: Language | None = None
    countries: list[Country] = Field(default_factory=list)
    type: str | None = None
    updated_at: str | None = Field(default=None, alias="updatedAt")


class Book(_Model):
    id: str
    bible_id: str = Field(alias="bibleId")
    abbreviation: str | None = None
    name: str | None = None
    name_long: str | None = Field(default=None, alias="nameLong")
    chapters: list[ChapterSummary] | None = None


class ChapterSummary(_Model):
    id: str
    bible_id: str = Field(alias="bibleId")
    book_id: str = Field(alias="bookId")
    number: str
    position: int | None = None


class Chapter(ChapterSummary):
    reference: str | None = None
    verse_count: int | None = Field(default=None, alias="verseCount")
    content: ContentField | None = None
    copyright: str | None = None
    next: _Nav | None = None
    previous: _Nav | None = None


class VerseSummary(_Model):
    id: str
    org_id: str | None = Field(default=None, alias="orgId")
    bible_id: str = Field(alias="bibleId")
    book_id: str = Field(alias="bookId")
    chapter_id: str = Field(alias="chapterId")
    reference: str | None = None


class Verse(VerseSummary):
    content: ContentField | None = None
    verse_count: int | None = Field(default=None, alias="verseCount")
    copyright: str | None = None
    next: _Nav | None = None
    previous: _Nav | None = None


class Passage(_Model):
    id: str
    bible_id: str = Field(alias="bibleId")
    org_id: str | None = Field(default=None, alias="orgId")
    book_id: str | None = Field(default=None, alias="bookId")
    chapter_ids: list[str] | None = Field(default=None, alias="chapterIds")
    reference: str | None = None
    content: ContentField | None = None
    verse_count: int | None = Field(default=None, alias="verseCount")
    copyright: str | None = None


class SectionSummary(_Model):
    id: str
    bible_id: str = Field(alias="bibleId")
    book_id: str = Field(alias="bookId")
    title: str | None = None
    first_verse_id: str | None = Field(default=None, alias="firstVerseId")
    last_verse_id: str | None = Field(default=None, alias="lastVerseId")
    first_verse_org_id: str | None = Field(default=None, alias="firstVerseOrgId")
    last_verse_org_id: str | None = Field(default=None, alias="lastVerseOrgId")


class Section(SectionSummary):
    content: ContentField | None = None
    verse_count: int | None = Field(default=None, alias="verseCount")
    copyright: str | None = None
    next: _Nav | None = None
    previous: _Nav | None = None


class AudioBibleSummary(_Model):
    id: str
    name: str
    name_local: str | None = Field(default=None, alias="nameLocal")
    description: str | None = None
    abbreviation: str | None = None
    language: Language | None = None
    countries: list[Country] = Field(default_factory=list)


class AudioBible(AudioBibleSummary):
    dbl_id: str | None = Field(default=None, alias="dblId")
    relations: list[Bible] | None = None
    updated_at: str | None = Field(default=None, alias="updatedAt")


class AudioBook(_Model):
    id: str
    bible_id: str = Field(alias="bibleId")
    abbreviation: str | None = None
    name: str | None = None
    name_long: str | None = Field(default=None, alias="nameLong")
    audio: str | None = None


class AudioChapter(_Model):
    id: str
    bible_id: str = Field(alias="bibleId")
    book_id: str = Field(alias="bookId")
    number: str | None = None
    resource_url: str | None = Field(default=None, alias="resourceUrl")
    timecodes: list[ContentNode] | None = None


class SearchVerse(_Model):
    id: str
    org_id: str | None = Field(default=None, alias="orgId")
    bible_id: str | None = Field(default=None, alias="bibleId")
    book_id: str | None = Field(default=None, alias="bookId")
    chapter_id: str | None = Field(default=None, alias="chapterId")
    reference: str | None = None
    text: str | None = None


class SearchPassage(_Model):
    id: str
    bible_id: str | None = Field(default=None, alias="bibleId")
    org_id: str | None = Field(default=None, alias="orgId")
    book_id: str | None = Field(default=None, alias="bookId")
    chapter_ids: list[str] | None = Field(default=None, alias="chapterIds")
    reference: str | None = None
    text: str | None = None


class SearchResult(_Model):
    query: str | None = None
    limit: int | None = None
    offset: int | None = None
    total: int | None = None
    verse_count: int | None = Field(default=None, alias="verseCount")
    verses: list[SearchVerse] = Field(default_factory=list)
    passages: list[SearchPassage] = Field(default_factory=list)


class ApiResponse(_Model, Generic[DataT]):
    """The ``{ data, meta }`` envelope every endpoint returns."""

    data: DataT
    meta: Meta | None = None


@dataclass(frozen=True)
class Result(Generic[DataT]):
    """A response payload paired with its FUMS ``meta``.

    Returned by the ``*_with_meta`` resource methods for callers that need the
    per-response FUMS analytics metadata tied reliably to *this* response. Prefer
    it over :attr:`BibleClient.last_meta` when correlation matters: ``last_meta``
    only reflects the calling thread's most recent completed call and is
    overwritten by the next one.
    """

    data: DataT
    meta: Meta | None = None
