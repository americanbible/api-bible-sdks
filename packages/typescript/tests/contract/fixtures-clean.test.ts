import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREDENTIAL_MARKERS, FIXTURE_LEAK_MARKERS, FIXTURES_PATH, sanitizeBody } from './replay.js';

// The fixtures ship in a public repo and are regenerated monthly by
// .github/workflows/refresh-fixtures.yml, which opens a PR with whatever the
// live API returned. sanitizeBody strips credentials at record time; this test
// is the backstop that makes that guarantee enforceable — if api.bible starts
// returning a secret under a field the sanitizer does not know about, the
// refresh PR fails here instead of publishing it.

describe('recorded fixtures carry no credentials', () => {
  it('contains none of the known leak markers', () => {
    expect(existsSync(FIXTURES_PATH)).toBe(true);
    const raw = readFileSync(FIXTURES_PATH, 'utf8');
    const found = FIXTURE_LEAK_MARKERS.filter((marker) => raw.includes(marker));
    expect(found, `recordings.json contains credential markers: ${found.join(', ')}`).toEqual([]);
  });

  it('rewrites every resourceUrl to a non-resolvable placeholder with no query string', () => {
    const raw = readFileSync(FIXTURES_PATH, 'utf8');
    const urls = [...raw.matchAll(/"resourceUrl": "([^"]*)"/g)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/invalid\.example\.com\/\S+\.\w+$/);
      expect(url).not.toContain('?');
    }
  });
});

describe('sanitizeBody', () => {
  it('drops fumsToken and leaves the rest of meta intact', () => {
    const result = sanitizeBody({ data: { id: 'GEN.1' }, meta: { fumsToken: 'secret', fumsId: 'keep' } });
    expect(result).toEqual({ data: { id: 'GEN.1' }, meta: { fumsId: 'keep' } });
  });

  it('rewrites a presigned resourceUrl to the placeholder origin, keeping the path', () => {
    const body = {
      data: {
        resourceUrl:
          'https://api-bible-audio-assets-prod.s3.amazonaws.com/abc-01/release/audio/1CO/1CO_001.mp3?AWSAccessKeyId=ASIA0&Expires=1&Signature=xyz%3D',
      },
    };
    expect(sanitizeBody(body)).toEqual({
      data: { resourceUrl: 'https://invalid.example.com/abc-01/release/audio/1CO/1CO_001.mp3' },
    });
  });

  it('redacts a credential-bearing string under an unknown key', () => {
    // The case the marker scan exists for: a future API field the key list misses.
    const result = sanitizeBody({ data: { downloadUrl: 'https://s3.example/a.mp3?AWSAccessKeyId=ASIA0&Signature=x' } });
    expect(result).toEqual({ data: { downloadUrl: 'https://invalid.example.com/a.mp3' } });
  });

  it('drops a credential string that is not a URL', () => {
    // No path worth keeping — echoing part of it back would defeat the point.
    expect(sanitizeBody({ data: { token: 'AWSAccessKeyId=ASIA0' } })).toEqual({
      data: { token: '[redacted]' },
    });
  });

  it('leaves ordinary content untouched', () => {
    const body = { data: { id: 'GEN.1', content: 'In the beginning', verseCount: 31, next: null }, meta: {} };
    expect(sanitizeBody(body)).toEqual(body);
  });

  it('recurses into arrays', () => {
    const body = { data: [{ meta: { fumsToken: 'a' } }, { meta: { fumsToken: 'b' } }] };
    expect(sanitizeBody(body)).toEqual({ data: [{ meta: {} }, { meta: {} }] });
  });

  it('marks every credential substring it screens for', () => {
    // Guards against a marker being dropped from the list by accident.
    expect(CREDENTIAL_MARKERS).toContain('x-amz-security-token');
    expect(FIXTURE_LEAK_MARKERS).toContain('fumsToken');
  });
});
