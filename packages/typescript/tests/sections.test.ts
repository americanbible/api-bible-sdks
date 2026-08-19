import { describe, it, expect, vi } from "vitest";
import { createBibleClient } from "../src/client.js";
import { NotFoundError } from "../src/http/errors.js";

const BIBLE_ID = "bba9f40183526463-01";
const BOOK_ID = "GEN";
const CHAPTER_ID = "GEN.1";
const SECTION_ID = "GEN.1.1";

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockSectionSummary = {
  id: SECTION_ID,
  bibleId: BIBLE_ID,
  bookId: BOOK_ID,
  chapterId: CHAPTER_ID,
  title: "The Creation",
  position: 1,
};

const mockSection = {
  ...mockSectionSummary,
  content: "<p>In the beginning...</p>",
  verseCount: 5,
  copyright: "Public Domain",
  next: { id: "GEN.1.2", title: "Day Two", bookId: BOOK_ID },
};

function makeClient(fetchFn: typeof globalThis.fetch) {
  return createBibleClient({
    apiKey: "test-key",
    fetch: fetchFn,
    retry: { maxAttempts: 1 },
  });
}

describe("SectionsResource", () => {
  describe("listForBook", () => {
    it("returns a typed SectionSummary array", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: [mockSectionSummary], meta: {} }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).sections.listForBook(BIBLE_ID, BOOK_ID);

      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(SECTION_ID);
      expect(data[0].title).toBe("The Creation");
      expect(meta).toBeDefined();
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).sections.listForBook(
        BIBLE_ID,
        BOOK_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/books/${BOOK_ID}/sections`,
      );
    });

    it("does not append query params", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).sections.listForBook(
        BIBLE_ID,
        BOOK_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });
  });

  describe("listForChapter", () => {
    it("returns a typed SectionSummary array", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: [mockSectionSummary], meta: {} }),
        );
      const { data } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).sections.listForChapter(BIBLE_ID, CHAPTER_ID);

      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(SECTION_ID);
      expect(data[0].chapterId).toBe(CHAPTER_ID);
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(
        fetchFn as unknown as typeof fetch,
      ).sections.listForChapter(BIBLE_ID, CHAPTER_ID);

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/chapters/${CHAPTER_ID}/sections`,
      );
    });

    it("does not append query params", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(
        fetchFn as unknown as typeof fetch,
      ).sections.listForChapter(BIBLE_ID, CHAPTER_ID);

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });
  });

  describe("get", () => {
    it("returns a typed Section", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockSection, meta: { fumsId: "fums-123" } }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).sections.get(BIBLE_ID, SECTION_ID);

      expect(data.id).toBe(SECTION_ID);
      expect(data.title).toBe("The Creation");
      expect(data.verseCount).toBe(5);
      expect(data.next?.id).toBe("GEN.1.2");
      expect(meta?.fumsId).toBe("fums-123");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSection, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).sections.get(
        BIBLE_ID,
        SECTION_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/sections/${SECTION_ID}`,
      );
    });

    it("sends content-type query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSection, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).sections.get(
        BIBLE_ID,
        SECTION_ID,
        { contentType: "text" },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("content-type=text");
    });

    it("sends boolean include-* query params", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSection, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).sections.get(
        BIBLE_ID,
        SECTION_ID,
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
        .mockResolvedValue(mockResponse(200, { data: mockSection, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).sections.get(
        BIBLE_ID,
        SECTION_ID,
        { parallels: ["bible-id-1", "bible-id-2"] },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("parallels=bible-id-1%2Cbible-id-2");
    });

    it("does not append query params when called with no options", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockSection, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).sections.get(
        BIBLE_ID,
        SECTION_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });

    it("propagates NotFoundError for an unknown section ID", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(404, { message: "Resource not found." }),
        );
      await expect(
        makeClient(fetchFn as unknown as typeof fetch).sections.get(
          BIBLE_ID,
          "GEN.999.0",
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
