import { describe, it, expect, vi } from "vitest";
import { createBibleClient } from "../src/client.js";
import { NotFoundError } from "../src/http/errors.js";

const BIBLE_ID = "bba9f40183526463-01";
const CHAPTER_ID = "GEN.1";
const VERSE_ID = "GEN.1.1";

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockVerseSummary = {
  id: VERSE_ID,
  orgId: "GEN.1.1",
  bibleId: BIBLE_ID,
  bookId: "GEN",
  chapterId: CHAPTER_ID,
  reference: "Genesis 1:1",
  position: 1,
};

const mockVerse = {
  ...mockVerseSummary,
  content: "<p>Sample verse text for testing.</p>",
  verseCount: 1,
  copyright: "Public Domain",
  next: { id: "GEN.1.2", number: "2", bookId: "GEN" },
  previous: { id: "intro.GEN", number: "intro", bookId: "GEN" },
};

function makeClient(fetchFn: typeof globalThis.fetch) {
  return createBibleClient({
    apiKey: "test-key",
    fetch: fetchFn,
    retry: { maxAttempts: 1 },
  });
}

describe("VersesResource", () => {
  describe("list", () => {
    it("returns a typed VerseSummary array", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: [mockVerseSummary], meta: {} }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).verses.list(BIBLE_ID, CHAPTER_ID);

      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(VERSE_ID);
      expect(data[0].reference).toBe("Genesis 1:1");
      expect(meta).toBeDefined();
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).verses.list(
        BIBLE_ID,
        CHAPTER_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/chapters/${CHAPTER_ID}/verses`,
      );
    });

    it("does not append query params", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).verses.list(
        BIBLE_ID,
        CHAPTER_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });
  });

  describe("get", () => {
    it("returns a typed Verse with nav fields", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockVerse, meta: { fumsId: "fums-123" } }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).verses.get(BIBLE_ID, VERSE_ID);

      expect(data.id).toBe(VERSE_ID);
      expect(data.reference).toBe("Genesis 1:1");
      expect(data.verseCount).toBe(1);
      expect(data.next?.id).toBe("GEN.1.2");
      expect(data.previous?.id).toBe("intro.GEN");
      expect(meta?.fumsId).toBe("fums-123");
    });

    // At the edges of a Bible the API sends an empty nav object rather than
    // omitting the key, so the inner schema still runs and every field in it
    // has to be optional. Both cases are reachable: GEN.intro.0 is the first
    // verse and REV.22.21 the last.
    it("parses the last verse of a Bible, whose next is an empty object", async () => {
      const lastVerse = { ...mockVerse, id: "REV.22.21", next: {} };
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: lastVerse, meta: {} }));
      const { data } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).verses.get(BIBLE_ID, "REV.22.21");

      expect(data.next).toEqual({});
      expect(data.next?.id).toBeUndefined();
      expect(data.previous?.id).toBe("intro.GEN");
    });

    it("parses the first verse of a Bible, whose previous is an empty object", async () => {
      const firstVerse = { ...mockVerse, id: "GEN.intro.0", previous: {} };
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: firstVerse, meta: {} }));
      const { data } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).verses.get(BIBLE_ID, "GEN.intro.0");

      expect(data.previous).toEqual({});
      expect(data.previous?.id).toBeUndefined();
      expect(data.next?.id).toBe("GEN.1.2");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockVerse, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).verses.get(
        BIBLE_ID,
        VERSE_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/verses/${VERSE_ID}`,
      );
    });

    it("sends content-type query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockVerse, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).verses.get(
        BIBLE_ID,
        VERSE_ID,
        { contentType: "text" },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("content-type=text");
    });

    it("sends boolean include-* query params", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockVerse, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).verses.get(
        BIBLE_ID,
        VERSE_ID,
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
        .mockResolvedValue(mockResponse(200, { data: mockVerse, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).verses.get(
        BIBLE_ID,
        VERSE_ID,
        { parallels: ["bible-id-1", "bible-id-2"] },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("parallels=bible-id-1%2Cbible-id-2");
    });

    it("does not append query params when called with no options", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockVerse, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).verses.get(
        BIBLE_ID,
        VERSE_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });

    it("propagates NotFoundError for an unknown verse ID", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(404, { message: "Resource not found." }),
        );
      await expect(
        makeClient(fetchFn as unknown as typeof fetch).verses.get(
          BIBLE_ID,
          "GEN.999.0",
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
