import { describe, it, expect, vi } from 'vitest';
import { createBibleClient } from '../src/client.js';

// MetaSchema is shared by every endpoint's envelope, so it is tested once here
// rather than per resource. The contract tier cannot cover fumsToken: the
// fixture recorder strips the key as a live-credential leak guard (see
// tests/contract/replay.ts), so every recorded `meta` is `{}`. The token values
// below are synthetic.

const BIBLE_ID = 'bba9f40183526463-01';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockChapter = {
  id: 'GEN.1',
  bibleId: BIBLE_ID,
  bookId: 'GEN',
  number: '1',
  reference: 'Genesis 1',
};

function getChapterWithMeta(meta: unknown) {
  const fetchFn = vi
    .fn()
    .mockResolvedValue(mockResponse(200, { data: mockChapter, meta }));
  const client = createBibleClient({
    apiKey: 'test-key',
    fetch: fetchFn as unknown as typeof fetch,
    retry: { maxAttempts: 1 },
  });
  return client.chapters.get(BIBLE_ID, 'GEN.1');
}

describe('MetaSchema', () => {
  // The only field live responses actually populate, and the one FUMS reporting
  // needs — so it has to be typed, not left to passthrough.
  it('types fumsToken', async () => {
    const { meta } = await getChapterWithMeta({ fumsToken: 'fums-token-test' });

    expect(meta?.fumsToken).toBe('fums-token-test');
  });

  it('still accepts the older JavaScript-embed fields', async () => {
    const { meta } = await getChapterWithMeta({
      fumsId: 'fums-123',
      fums: '<script></script>',
      fumsJsInclude: 'https://example.invalid/fums.js',
      fumsJs: 'sm(...)',
    });

    expect(meta?.fumsId).toBe('fums-123');
    expect(meta?.fums).toBe('<script></script>');
    expect(meta?.fumsJsInclude).toBe('https://example.invalid/fums.js');
    expect(meta?.fumsJs).toBe('sm(...)');
    expect(meta?.fumsToken).toBeUndefined();
  });

  it('accepts an empty meta object', async () => {
    const { meta } = await getChapterWithMeta({});

    expect(meta).toEqual({});
  });

  it('accepts a response with no meta at all, as /bibles/{id} returns', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(mockResponse(200, { data: mockChapter }));
    const client = createBibleClient({
      apiKey: 'test-key',
      fetch: fetchFn as unknown as typeof fetch,
      retry: { maxAttempts: 1 },
    });
    const { meta } = await client.chapters.get(BIBLE_ID, 'GEN.1');

    expect(meta).toBeUndefined();
  });
});
