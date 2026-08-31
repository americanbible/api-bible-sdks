import { describe, it, expect } from 'vitest';
import * as reactSdk from '../src/index.js';
import {
  ApiBibleProvider,
  useApiBible,
  useBibles,
  useBible,
  useBooks,
  useChapters,
  useChapter,
  usePassages,
  useSearch,
  useSectionsForBook,
  useSectionsForChapter,
  useSection,
  useVerses,
  useVerse,
  useAudioBibles,
  useAudioBible,
  useAudioBooks,
  useAudioBook,
  useAudioChapters,
  useAudioChapter,
  // re-exported from @americanbible/api-bible-sdk:
  createBibleClient,
  BibleError,
  NotFoundError,
} from '../src/index.js';

// Smoke test for the published barrel: the React surface must be reachable, the
// core's values must be re-exported (so `instanceof` works from one package),
// and the internal fetch primitive must stay unexported.

describe('public entrypoint (src/index.ts)', () => {
  it('exports the provider and hooks', () => {
    expect(typeof ApiBibleProvider).toBe('function');
    expect(typeof useApiBible).toBe('function');
    expect(typeof useBibles).toBe('function');
    expect(typeof useBible).toBe('function');
    expect(typeof useBooks).toBe('function');
    expect(typeof useChapters).toBe('function');
    expect(typeof useChapter).toBe('function');
    expect(typeof usePassages).toBe('function');
    expect(typeof useSearch).toBe('function');
    expect(typeof useSectionsForBook).toBe('function');
    expect(typeof useSectionsForChapter).toBe('function');
    expect(typeof useSection).toBe('function');
    expect(typeof useVerses).toBe('function');
    expect(typeof useVerse).toBe('function');
    expect(typeof useAudioBibles).toBe('function');
    expect(typeof useAudioBible).toBe('function');
    expect(typeof useAudioBooks).toBe('function');
    expect(typeof useAudioBook).toBe('function');
    expect(typeof useAudioChapters).toBe('function');
    expect(typeof useAudioChapter).toBe('function');
  });

  it('re-exports the core client factory and error hierarchy', () => {
    expect(typeof createBibleClient).toBe('function');
    expect(NotFoundError.prototype).toBeInstanceOf(BibleError);
  });

  it('does not export the internal useAsyncResource primitive', () => {
    expect('useAsyncResource' in reactSdk).toBe(false);
  });

  it('exposes exactly the expected public runtime surface (guards `export *` drift)', () => {
    // The React package's own value exports — provider, client accessor, hooks.
    const ownExports = [
      'ApiBibleProvider',
      'useApiBible',
      'useBibles',
      'useBible',
      'useBooks',
      'useChapters',
      'useChapter',
      'usePassages',
      'useSearch',
      'useSectionsForBook',
      'useSectionsForChapter',
      'useSection',
      'useVerses',
      'useVerse',
      'useAudioBibles',
      'useAudioBible',
      'useAudioBooks',
      'useAudioBook',
      'useAudioChapters',
      'useAudioChapter',
    ];

    // Core runtime *values* that arrive via `export * from '@americanbible/api-bible-sdk'`
    // (type-only core exports don't exist at runtime). This is the coupling point:
    // if the core adds, removes, or renames a value export, this test fails here —
    // loudly, in this package — instead of silently in a consumer's build. Update
    // it deliberately when the core surface changes.
    const reExportedCoreValues = [
      'createBibleClient',
      'ApiError',
      'AuthError',
      'BadRequestError',
      'BibleError',
      'InvalidInputError',
      'NetworkError',
      'NotFoundError',
      'RateLimitError',
      'ServerError',
      'ValidationError',
      'MAX_ERROR_BODY_BYTES',
      // /search answers in one of two disjoint shapes; these narrow a
      // SearchResult to whichever came back. Useful straight from useSearch,
      // so they are worth having re-exported here.
      'isKeywordSearchResult',
      'isReferenceSearchResult',
    ];

    const expected = [...ownExports, ...reExportedCoreValues].sort();
    expect(Object.keys(reactSdk).sort()).toEqual(expected);
  });
});
