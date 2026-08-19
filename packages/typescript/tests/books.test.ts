import { describe, it, expect, vi } from "vitest";
import { createBibleClient } from "../src/client.js";
import { NotFoundError } from "../src/http/errors.js";

const BIBLE_ID = "bba9f40183526463-01";

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockBook = {
  id: "GEN",
  bibleId: BIBLE_ID,
  abbreviation: "Gen",
  name: "Genesis",
  nameLong: "The First Book of Moses, called Genesis",
};

function makeClient(fetchFn: typeof globalThis.fetch) {
  return createBibleClient({
    apiKey: "test-key",
    fetch: fetchFn,
    retry: { maxAttempts: 1 },
  });
}

describe("BooksResource", () => {
  describe("list", () => {
    it("returns typed Book array", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [mockBook], meta: {} }));
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).books.list(BIBLE_ID);

      expect(data).toHaveLength(1);
      expect(data[0].id).toBe("GEN");
      expect(data[0].name).toBe("Genesis");
      expect(data[0].nameLong).toBe("The First Book of Moses, called Genesis");
      expect(meta).toBeDefined();
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).books.list(BIBLE_ID);

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/books`,
      );
    });

    it("sends include-chapters query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).books.list(
        BIBLE_ID,
        {
          includeChapters: true,
        },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-chapters=true");
    });

    it("sends include-chapters-and-sections query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).books.list(
        BIBLE_ID,
        {
          includeChaptersAndSections: true,
        },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-chapters-and-sections=true");
    });

    it("does not append query params when called with no options", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).books.list(BIBLE_ID);

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });
  });

  describe("get", () => {
    it("returns a typed Book", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockBook, meta: { fumsId: "fums-123" } }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).books.get(BIBLE_ID, "GEN");

      expect(data.id).toBe("GEN");
      expect(data.abbreviation).toBe("Gen");
      expect(meta?.fumsId).toBe("fums-123");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockBook, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).books.get(
        BIBLE_ID,
        "GEN",
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/bibles/${BIBLE_ID}/books/GEN`,
      );
    });

    it("sends include-chapters query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: mockBook, meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).books.get(
        BIBLE_ID,
        "GEN",
        {
          includeChapters: true,
        },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-chapters=true");
    });

    it("propagates NotFoundError for unknown book ID", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(404, { message: "Resource not found." }),
        );
      await expect(
        makeClient(fetchFn as unknown as typeof fetch).books.get(
          BIBLE_ID,
          "NOTABOOK",
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("createBibleClient", () => {
    it("throws synchronously when apiKey is empty", () => {
      expect(() => createBibleClient({ apiKey: "" })).toThrow(
        "apiKey is required",
      );
    });

    it("throws synchronously when apiKey is whitespace", () => {
      expect(() => createBibleClient({ apiKey: "   " })).toThrow(
        "apiKey is required",
      );
    });
  });
});
