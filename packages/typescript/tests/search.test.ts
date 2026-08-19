import { describe, it, expect, vi } from "vitest";
import { createBibleClient } from "../src/client.js";
import { InvalidInputError, NotFoundError } from "../src/http/errors.js";

const BIBLE_ID = "bba9f40183526463-01";

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockVerse = {
  id: "GEN.1.1",
  orgId: "GEN.1.1",
  bibleId: BIBLE_ID,
  bookId: "GEN",
  chapterId: "GEN.1",
  reference: "Genesis 1:1",
  text: "Sample verse text for testing.",
};

const mockSearchPassage = {
  id: "GEN.1.1",
  bibleId: BIBLE_ID,
  orgId: "GEN.1.1",
  content: "<p>In the beginning...</p>",
  reference: "Genesis 1:1",
  verseCount: 1,
  copyright: "Public Domain",
};

const mockSearchResult = {
  query: "beginning",
  limit: 10,
  offset: 0,
  total: 1,
  verseCount: 1,
  verses: [mockVerse],
  passages: [mockSearchPassage],
};

function makeClient(fetchFn: typeof globalThis.fetch) {
  return createBibleClient({
    apiKey: "test-key",
    fetch: fetchFn,
    retry: { maxAttempts: 1 },
  });
}

describe("SearchResource", () => {
  describe("search", () => {
    it("returns a typed SearchResult", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockSearchResult, meta: { fumsToken: "tok-123" } }),
        );
      const { data, meta } = await makeClient(fetchFn as unknown as typeof fetch).search.search(
        BIBLE_ID,
        { query: "beginning" },
      );

      expect(data.query).toBe("beginning");
      expect(data.total).toBe(1);
      expect(data.verseCount).toBe(1);
      expect(data.verses).toHaveLength(1);
      expect(data.verses![0].text).toBe(
        "Sample verse text for testing.",
      );
      expect(data.passages).toHaveLength(1);
      expect(data.passages![0].reference).toBe("Genesis 1:1");
      expect(meta).toBeDefined();
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSearchResult, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).search.search(BIBLE_ID, {
        query: "beginning",
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/search`,
      );
    });

    it("serializes the query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSearchResult, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).search.search(BIBLE_ID, {
        query: "love,world",
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("query=");
      expect(calledUrl).toContain("love");
    });

    it("serializes limit and offset as strings", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSearchResult, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).search.search(BIBLE_ID, {
        query: "beginning",
        limit: 25,
        offset: 50,
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("limit=25");
      expect(calledUrl).toContain("offset=50");
    });

    it("serializes the sort param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSearchResult, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).search.search(BIBLE_ID, {
        query: "beginning",
        sort: "canonical",
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("sort=canonical");
    });

    it("serializes the range param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSearchResult, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).search.search(BIBLE_ID, {
        query: "beginning",
        range: "GEN.1.1-EXO.1.1",
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("range=");
      expect(calledUrl).toContain("GEN");
    });

    it("serializes the fuzziness param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSearchResult, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).search.search(BIBLE_ID, {
        query: "beginning",
        fuzziness: "1",
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("fuzziness=1");
    });

    it("omits optional params, sending only the required query", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSearchResult, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).search.search(BIBLE_ID, {
        query: "beginning",
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("query=beginning");
      expect(calledUrl).not.toContain("limit=");
      expect(calledUrl).not.toContain("offset=");
      expect(calledUrl).not.toContain("sort=");
    });

    it("throws synchronously on an empty or whitespace-only query, before any request", () => {
      const fetchFn = vi.fn();
      const client = makeClient(fetchFn as unknown as typeof fetch);
      expect(() => client.search.search(BIBLE_ID, { query: "" })).toThrow(
        /query must not be empty/,
      );
      expect(() => client.search.search(BIBLE_ID, { query: "" })).toThrow(InvalidInputError);
      expect(() => client.search.search(BIBLE_ID, { query: "   " })).toThrow(
        /query must not be empty/,
      );
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("throws synchronously on a non-integer or negative limit/offset, before any request", () => {
      const fetchFn = vi.fn();
      const client = makeClient(fetchFn as unknown as typeof fetch);
      expect(() => client.search.search(BIBLE_ID, { query: "love", limit: 10.5 })).toThrow(
        /limit must be a non-negative integer/,
      );
      expect(() => client.search.search(BIBLE_ID, { query: "love", limit: NaN })).toThrow(
        /limit must be a non-negative integer/,
      );
      expect(() => client.search.search(BIBLE_ID, { query: "love", offset: -1 })).toThrow(
        /offset must be a non-negative integer/,
      );
      expect(() => client.search.search(BIBLE_ID, { query: "love", offset: Infinity })).toThrow(
        /offset must be a non-negative integer/,
      );
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("propagates NotFoundError for unknown bibleId", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(404, { message: "Resource not found." }));
      await expect(
        makeClient(fetchFn as unknown as typeof fetch).search.search("invalid-bible-id", {
          query: "beginning",
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
