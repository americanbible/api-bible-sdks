"""Python SDK for the api.bible REST API."""

from __future__ import annotations

import logging

from ._http import RequestEvent, RequestObserver, RetryConfig, RetryEvent, RetryObserver
from ._version import __version__
from .client import BibleClient
from .errors import (
    ApiError,
    AuthError,
    BadRequestError,
    BibleError,
    ConflictError,
    InvalidInputError,
    NetworkError,
    NotFoundError,
    RateLimitError,
    ServerError,
    UnprocessableEntityError,
    ValidationError,
)
from .models import (
    ApiResponse,
    AudioBible,
    AudioBibleSummary,
    AudioBook,
    AudioChapter,
    Bible,
    Book,
    Chapter,
    ChapterSummary,
    ContentNode,
    Country,
    Language,
    Meta,
    Passage,
    Result,
    SearchPassage,
    SearchResult,
    SearchVerse,
    Section,
    SectionSummary,
    Verse,
    VerseSummary,
)

# Keep the library silent by default; the application configures handlers.
logging.getLogger("api_bible").addHandler(logging.NullHandler())

__all__ = [
    "__version__",
    "BibleClient",
    "RetryConfig",
    "RequestEvent",
    "RequestObserver",
    "RetryEvent",
    "RetryObserver",
    # models
    "ApiResponse",
    "Result",
    "Meta",
    "Language",
    "Country",
    "ContentNode",
    "Bible",
    "Book",
    "Chapter",
    "ChapterSummary",
    "Verse",
    "VerseSummary",
    "Passage",
    "Section",
    "SectionSummary",
    "AudioBible",
    "AudioBibleSummary",
    "AudioBook",
    "AudioChapter",
    "SearchResult",
    "SearchVerse",
    "SearchPassage",
    # errors
    "BibleError",
    "ApiError",
    "AuthError",
    "BadRequestError",
    "NotFoundError",
    "ConflictError",
    "UnprocessableEntityError",
    "RateLimitError",
    "ServerError",
    "NetworkError",
    "InvalidInputError",
    "ValidationError",
]
