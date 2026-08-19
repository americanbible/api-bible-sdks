import { describe, it, expect, vi } from "vitest";
import { createBibleClient } from "../src/client.js";
import { NotFoundError } from "../src/http/errors.js";

const BIBLE_ID = "bba9f40183526463-01";
const BOOK_ID = "GEN";
const CHAPTER_ID = "GEN.1";

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockChapterSummary = {
  id: CHAPTER_ID,
  bibleId: BIBLE_ID,
  bookId: BOOK_ID,
  number: "1",
  position: 1,
};

const mockChapter = {
  ...mockChapterSummary,
  reference: "Genesis 1",
  verseCount: 31,
  content: "<p>In the beginning...</p>",
  next: { id: "GEN.2", number: "2", bookId: BOOK_ID },
};

function makeClient(fetchFn: typeof globalThis.fetch) {
  return createBibleClient({
    apiKey: "test-key",
    fetch: fetchFn,
    retry: { maxAttempts: 1 },
  });
}

describe("ChaptersResource", () => {
  describe("list", () => {
    it("returns typed ChapterSummary array", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: [mockChapterSummary], meta: {} }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).chapters.list(BIBLE_ID, BOOK_ID);

      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(CHAPTER_ID);
      expect(data[0].number).toBe("1");
      expect(meta).toBeDefined();
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).chapters.list(
        BIBLE_ID,
        BOOK_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/books/${BOOK_ID}/chapters`,
      );
    });

    it("does not append query params", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).chapters.list(
        BIBLE_ID,
        BOOK_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });
  });

  describe("get", () => {
    it("returns a typed Chapter", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockChapter, meta: { fumsId: "fums-123" } }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).chapters.get(BIBLE_ID, CHAPTER_ID);

      expect(data.id).toBe(CHAPTER_ID);
      expect(data.reference).toBe("Genesis 1");
      expect(data.verseCount).toBe(31);
      expect(data.next?.id).toBe("GEN.2");
      expect(meta?.fumsId).toBe("fums-123");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockChapter, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).chapters.get(
        BIBLE_ID,
        CHAPTER_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/chapters/${CHAPTER_ID}`,
      );
    });

    it("sends content-type query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockChapter, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).chapters.get(
        BIBLE_ID,
        CHAPTER_ID,
        { contentType: "html" },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("content-type=html");
    });

    it("sends boolean include-* query params", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockChapter, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).chapters.get(
        BIBLE_ID,
        CHAPTER_ID,
        {
          includeNotes: true,
          includeTitles: false,
          includeChapterNumbers: true,
          includeVerseNumbers: true,
          includeVerseSpans: false,
        },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-notes=true");
      expect(calledUrl).toContain("include-titles=false");
      expect(calledUrl).toContain("include-chapter-numbers=true");
      expect(calledUrl).toContain("include-verse-numbers=true");
      expect(calledUrl).toContain("include-verse-spans=false");
    });

    it("joins parallels array into a comma-separated query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockChapter, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).chapters.get(
        BIBLE_ID,
        CHAPTER_ID,
        { parallels: ["bible-id-1", "bible-id-2"] },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("parallels=bible-id-1%2Cbible-id-2");
    });

    it("does not append query params when called with no options", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockChapter, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).chapters.get(
        BIBLE_ID,
        CHAPTER_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });

    it("propagates NotFoundError for unknown chapter ID", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(404, { message: "Resource not found." }),
        );
      await expect(
        makeClient(fetchFn as unknown as typeof fetch).chapters.get(
          BIBLE_ID,
          "GEN.999",
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
