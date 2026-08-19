import { describe, it, expect } from 'vitest';
import { createBibleClient } from '../src/client.js';
import { InvalidInputError } from '../src/http/errors.js';

describe('createBibleClient', () => {
  describe('apiKey validation', () => {
    it('throws when apiKey is missing', () => {
      expect(() => createBibleClient({ apiKey: '' })).toThrow('apiKey is required');
    });

    it('throws when apiKey is whitespace', () => {
      expect(() => createBibleClient({ apiKey: '   ' })).toThrow('apiKey is required');
    });

    it('constructs successfully with a valid apiKey and default baseUrl', () => {
      const client = createBibleClient({ apiKey: 'k' });
      expect(client.bibles).toBeDefined();
      expect(client.search).toBeDefined();
    });
  });

  describe('baseUrl scheme guard', () => {
    it('accepts https://', () => {
      expect(() =>
        createBibleClient({ apiKey: 'k', baseUrl: 'https://example.com/v1' }),
      ).not.toThrow();
    });

    it('rejects http:// for non-loopback hosts', () => {
      expect(() =>
        createBibleClient({ apiKey: 'k', baseUrl: 'http://api.scripture.api.bible' }),
      ).toThrow(/must use https/);
    });

    it('allows http://localhost for local proxies', () => {
      expect(() =>
        createBibleClient({ apiKey: 'k', baseUrl: 'http://localhost:3000/v1' }),
      ).not.toThrow();
    });

    it('allows http://127.0.0.1', () => {
      expect(() =>
        createBibleClient({ apiKey: 'k', baseUrl: 'http://127.0.0.1:8080' }),
      ).not.toThrow();
    });

    it('allows http://[::1] (IPv6 loopback)', () => {
      expect(() =>
        createBibleClient({ apiKey: 'k', baseUrl: 'http://[::1]:8080' }),
      ).not.toThrow();
    });

    it('rejects non-http(s) schemes', () => {
      expect(() =>
        createBibleClient({ apiKey: 'k', baseUrl: 'ftp://example.com/' }),
      ).toThrow(/must use https/);
    });

    it('rejects unparseable baseUrl with a clear message', () => {
      expect(() =>
        createBibleClient({ apiKey: 'k', baseUrl: 'not a url' }),
      ).toThrow(/not a valid URL/);
    });
  });

  describe('error type', () => {
    it('throws InvalidInputError (not a bare Error) on missing apiKey', () => {
      expect(() => createBibleClient({ apiKey: '' })).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError on a plaintext non-loopback baseUrl', () => {
      expect(() =>
        createBibleClient({ apiKey: 'k', baseUrl: 'http://api.scripture.api.bible' }),
      ).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError on an unparseable baseUrl', () => {
      expect(() =>
        createBibleClient({ apiKey: 'k', baseUrl: 'not a url' }),
      ).toThrow(InvalidInputError);
    });
  });
});
