import { describe, it, expect } from 'vitest';
import { contentRenderingToQuery } from '../src/schemas/content-params.js';
import { InvalidInputError } from '../src/http/errors.js';

// Stand-in call-site label; assertions only care that it surfaces in the
// thrown message, not which resource it names.
const CTX = 'chapters.get';

describe('contentRenderingToQuery', () => {
  it('returns undefined when no params are set', () => {
    expect(contentRenderingToQuery({}, CTX)).toBeUndefined();
  });

  it('returns undefined when only undefined-valued keys are set', () => {
    expect(
      contentRenderingToQuery(
        {
          contentType: undefined,
          includeNotes: undefined,
          parallels: undefined,
        },
        CTX,
      ),
    ).toBeUndefined();
  });

  it('serializes contentType alone', () => {
    expect(contentRenderingToQuery({ contentType: 'json' }, CTX)).toEqual({
      'content-type': 'json',
    });
  });

  it('serializes all booleans (true and false)', () => {
    expect(
      contentRenderingToQuery(
        {
          includeNotes: true,
          includeTitles: false,
          includeChapterNumbers: true,
          includeVerseNumbers: false,
          includeVerseSpans: true,
        },
        CTX,
      ),
    ).toEqual({
      'include-notes': 'true',
      'include-titles': 'false',
      'include-chapter-numbers': 'true',
      'include-verse-numbers': 'false',
      'include-verse-spans': 'true',
    });
  });

  it('joins parallels with comma', () => {
    expect(
      contentRenderingToQuery({ parallels: ['ENGKJV', 'ENGWEB', 'ENGBSB'] }, CTX),
    ).toEqual({ parallels: 'ENGKJV,ENGWEB,ENGBSB' });
  });

  it('omits parallels when array is empty', () => {
    expect(contentRenderingToQuery({ parallels: [] }, CTX)).toBeUndefined();
  });

  it('rejects a parallels element containing a comma (would corrupt CSV)', () => {
    expect(() => contentRenderingToQuery({ parallels: ['ENGWEB,ENGKJV'] }, CTX)).toThrow(
      InvalidInputError,
    );
  });

  it('names the call site in the comma-guard error', () => {
    expect(() => contentRenderingToQuery({ parallels: ['ENGWEB,ENGKJV'] }, CTX)).toThrow(
      /chapters\.get/,
    );
  });

  it('serializes a mixed set of params', () => {
    expect(
      contentRenderingToQuery(
        {
          contentType: 'html',
          includeNotes: true,
          parallels: ['ENGWEB'],
        },
        CTX,
      ),
    ).toEqual({
      'content-type': 'html',
      'include-notes': 'true',
      parallels: 'ENGWEB',
    });
  });
});
