import { describe, it, expect, vi } from "vitest";
import { createBibleClient } from "../src/client.js";
import { NotFoundError } from "../src/http/errors.js";

const BIBLE_ID = "bba9f40183526463-01";
const PASSAGE_ID = "GEN.1.1-GEN.1.5";

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockPassage = {
  id: PASSAGE_ID,
  bibleId: BIBLE_ID,
  orgId: "GEN.1.1-GEN.1.5",
  reference: "Genesis 1:1-5",
  verseCount: 5,
  content: "<p>In the beginning...</p>",
  copyright: "Public Domain",
};

function makeClient(fetchFn: typeof globalThis.fetch) {
  return createBibleClient({
    apiKey: "test-key",
    fetch: fetchFn,
    retry: { maxAttempts: 1 },
  });
}

describe("PassagesResource", () => {
  describe("get", () => {
    it("returns a typed Passage", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockPassage, meta: { fumsId: "fums-123" } }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).passages.get(BIBLE_ID, PASSAGE_ID);

      expect(data.id).toBe(PASSAGE_ID);
      expect(data.reference).toBe("Genesis 1:1-5");
      expect(data.verseCount).toBe(5);
      expect(data.copyright).toBe("Public Domain");
      expect(data.orgId).toBe("GEN.1.1-GEN.1.5");
      expect(meta?.fumsId).toBe("fums-123");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockPassage, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).passages.get(
        BIBLE_ID,
        PASSAGE_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/passages/${encodeURIComponent(PASSAGE_ID)}`,
      );
    });

    it("sends content-type query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockPassage, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).passages.get(
        BIBLE_ID,
        PASSAGE_ID,
        { contentType: "text" },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("content-type=text");
    });

    it("sends boolean include-* query params", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockPassage, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).passages.get(
        BIBLE_ID,
        PASSAGE_ID,
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
        .mockResolvedValue(mockResponse(200, { data: mockPassage, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).passages.get(
        BIBLE_ID,
        PASSAGE_ID,
        { parallels: ["bible-id-1", "bible-id-2"] },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("parallels=bible-id-1%2Cbible-id-2");
    });

    it("does not append query params when called with no options", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockPassage, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).passages.get(
        BIBLE_ID,
        PASSAGE_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });

    it("propagates NotFoundError for unknown passageId", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(404, { message: "Resource not found." }),
        );
      await expect(
        makeClient(fetchFn as unknown as typeof fetch).passages.get(
          BIBLE_ID,
          "GEN.99.99-GEN.99.99",
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
