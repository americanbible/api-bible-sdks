import { describe, it, expect, vi } from "vitest";
import { createBibleClient } from "../src/client.js";
import { InvalidInputError, NotFoundError } from "../src/http/errors.js";
import {
  isKeywordSearchResult,
  isReferenceSearchResult,
} from "../src/schemas/search.schema.js";

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

// The two shapes the live API actually returns, verbatim in structure. A query
// the API can parse as a scripture reference comes back as `passages` and
// nothing else — no query, limit, offset, total or verseCount. Anything else is
// a keyword search and never carries a `passages` key.
const mockReferenceSearchResult = {
  passages: [
    {
      id: "JHN.3.16-JHN.3.19",
      orgId: "JHN.3.16-JHN.3.19",
      bibleId: BIBLE_ID,
      bookId: "JHN",
      chapterIds: ["JHN.3"],
      reference: "John 3:16-19",
      content: '<p class="m"><span data-number="16" class="v">16</span>For God so loved…</p>',
      verseCount: 4,
      copyright: "Public Domain",
    },
  ],
};

const mockKeywordSearchResult = {
  query: "love",
  limit: 10,
  offset: 0,
  total: 712,
  verseCount: 1,
  verses: [mockVerse],
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

  describe("response shapes", () => {
    async function search(body: unknown, query = "John 3:16-19") {
      const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, { data: body, meta: {} }));
      const { data } = await makeClient(fetchFn as unknown as typeof fetch).search.search(
        BIBLE_ID,
        { query },
      );
      return data;
    }

    it("parses a reference search, which returns passages and omits every other field", async () => {
      const data = await search(mockReferenceSearchResult);

      expect(data.passages).toHaveLength(1);
      expect(data.passages![0].reference).toBe("John 3:16-19");
      expect(data.query).toBeUndefined();
      expect(data.limit).toBeUndefined();
      expect(data.offset).toBeUndefined();
      expect(data.total).toBeUndefined();
      expect(data.verseCount).toBeUndefined();
      expect(data.verses).toBeUndefined();
    });

    it("types bookId and chapterIds on a search passage", async () => {
      const data = await search(mockReferenceSearchResult);
      const passage = data.passages![0];

      expect(passage.bookId).toBe("JHN");
      expect(passage.chapterIds).toEqual(["JHN.3"]);
    });

    it("parses a reference search whose passages carry only the required fields", async () => {
      const data = await search({ passages: [{ id: "JHN.3", bibleId: BIBLE_ID }] });

      expect(data.passages![0].content).toBeUndefined();
      expect(data.passages![0].copyright).toBeUndefined();
    });

    it("parses a keyword search, which returns paging metadata and verses", async () => {
      const data = await search(mockKeywordSearchResult, "love");

      expect(data.query).toBe("love");
      expect(data.total).toBe(712);
      expect(data.verses).toHaveLength(1);
      expect(data.passages).toBeUndefined();
    });

    it("parses a keyword search with no matches", async () => {
      const data = await search(
        { query: "zzqxwvj", limit: 10, offset: 0, total: 0, verseCount: 0, verses: [] },
        "zzqxwvj",
      );

      expect(data.total).toBe(0);
      expect(data.verses).toEqual([]);
    });

    it("narrows a reference result with isReferenceSearchResult", async () => {
      const data = await search(mockReferenceSearchResult);

      expect(isReferenceSearchResult(data)).toBe(true);
      expect(isKeywordSearchResult(data)).toBe(false);
      if (!isReferenceSearchResult(data)) throw new Error("expected the reference shape");
      // No `!` or `?? []` — the guard makes `passages` non-optional.
      expect(data.passages[0].verseCount).toBe(4);
    });

    it("narrows a keyword result with isKeywordSearchResult", async () => {
      const data = await search(mockKeywordSearchResult, "love");

      expect(isKeywordSearchResult(data)).toBe(true);
      expect(isReferenceSearchResult(data)).toBe(false);
      if (!isKeywordSearchResult(data)) throw new Error("expected the keyword shape");
      expect(data.total).toBe(712);
      expect(data.verses[0].text).toBe("Sample verse text for testing.");
    });

    it("does not treat a verses-only response with no total as the keyword shape", async () => {
      const data = await search({ verses: [mockVerse] }, "love");

      expect(isKeywordSearchResult(data)).toBe(false);
      expect(isReferenceSearchResult(data)).toBe(false);
    });
  });
});
