import { describe, it, expect, vi } from 'vitest';
import { createBibleClient } from '../src/client.js';
import { InvalidInputError, NotFoundError } from '../src/http/errors.js';

const BIBLE_ID = 'bba9f40183526463-01';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockBible = {
  id: BIBLE_ID,
  dblId: 'f72b840c31437236',
  abbreviation: 'BSB',
  abbreviationLocal: 'BSB',
  name: 'Berean Standard Bible',
  nameLocal: 'Berean Standard Bible',
  description: 'The Berean Standard Bible',
  descriptionLocal: 'The Berean Standard Bible',
  relatedDbl: null,
  type: 'text',
  updatedAt: '2024-01-01T00:00:00.000Z',
  language: {
    id: 'eng',
    name: 'English',
    nameLocal: 'English',
    script: 'Latin',
    scriptCode: 'Latn',
    scriptDirection: 'LTR',
    ldml: 'en',
    rod: 1,
    iso6393: 'eng',
  },
  countries: [{ id: 'US', name: 'United States', nameLocal: 'United States' }],
  audioBibles: [],
};

function makeClient(fetchFn: typeof globalThis.fetch) {
  return createBibleClient({
    apiKey: 'test-key',
    fetch: fetchFn,
    retry: { maxAttempts: 1 },
  });
}

describe('BiblesResource', () => {
  describe('list', () => {
    it('returns typed Bible array', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [mockBible], meta: {} }));
      const { data, meta } = await makeClient(fetchFn as unknown as typeof fetch).bibles.list();

      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(BIBLE_ID);
      expect(data[0].name).toBe('Berean Standard Bible');
      expect(data[0].language.id).toBe('eng');
      expect(data[0].countries).toHaveLength(1);
      expect(meta).toBeDefined();
    });

    it('calls the correct URL path', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).bibles.list();

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe('https://rest.api.bible/v1/bibles');
    });

    it('sends language query param', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).bibles.list({ language: 'eng' });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain('language=eng');
    });

    it('joins ids array with comma', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).bibles.list({
        ids: ['bba9f40183526463-01', 'bba9a179b0f51521-01'],
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain('ids=bba9f40183526463-01%2Cbba9a179b0f51521-01');
    });

    it('throws synchronously when an ids[] element contains a comma', () => {
      const fetchFn = vi.fn();
      const client = makeClient(fetchFn as unknown as typeof fetch);
      // No await — error should surface before any network call.
      expect(() => client.bibles.list({ ids: ['ok-id', 'bad,id'] })).toThrow(/contains a comma/);
      expect(() => client.bibles.list({ ids: ['ok-id', 'bad,id'] })).toThrow(InvalidInputError);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('sends include-full-details query param', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).bibles.list({
        includeFullDetails: true,
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain('include-full-details=true');
    });

    it('does not append query params when called with no options', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).bibles.list();

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain('?');
    });
  });

  describe('get', () => {
    it('returns a typed Bible', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockBible, meta: { fumsId: 'fums-456' } }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).bibles.get(BIBLE_ID);

      expect(data.id).toBe(BIBLE_ID);
      expect(data.abbreviation).toBe('BSB');
      expect(meta?.fumsId).toBe('fums-456');
    });

    it('calls the correct URL path', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockBible, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).bibles.get(BIBLE_ID);

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(`https://rest.api.bible/v1/bibles/${BIBLE_ID}`);
    });

    it('propagates NotFoundError for unknown bible ID', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(404, { message: 'Resource not found.' }));
      await expect(
        makeClient(fetchFn as unknown as typeof fetch).bibles.get('not-a-real-id'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
