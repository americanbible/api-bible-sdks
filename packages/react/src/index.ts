'use client';

// Public entry point — the only surface consumers import from.

// Provider + context accessor
export { ApiBibleProvider, type ApiBibleProviderProps } from './provider.js';
export { useApiBible } from './use-api-bible.js';

// Resource hooks
export { useBibles } from './use-bibles.js';
export { useBible } from './use-bible.js';
export { useBooks } from './use-books.js';
export { useChapters } from './use-chapters.js';
export { useChapter } from './use-chapter.js';
export { usePassages } from './use-passages.js';
export { useSearch, type UseSearchOptions } from './use-search.js';
export { useSectionsForBook } from './use-sections-for-book.js';
export { useSectionsForChapter } from './use-sections-for-chapter.js';
export { useSection } from './use-section.js';
export { useVerses } from './use-verses.js';
export { useVerse } from './use-verse.js';
export { useAudioBibles } from './use-audio-bibles.js';
export { useAudioBible } from './use-audio-bible.js';
export { useAudioBooks } from './use-audio-books.js';
export { useAudioBook } from './use-audio-book.js';
export { useAudioChapters } from './use-audio-chapters.js';
export { useAudioChapter } from './use-audio-chapter.js';

// Shared types
export type { AsyncResource, ApiBibleConfig } from './types.js';

// Re-export the core SDK's types AND error classes so consumers import from a
// single package and `instanceof NotFoundError` works (one copy of the core).
export * from '@americanbible/api-bible-sdk';
