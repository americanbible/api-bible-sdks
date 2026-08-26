import { describe, it, expect, vi } from "vitest";
import { createBibleClient } from "../src/client.js";
import { InvalidInputError, NotFoundError } from "../src/http/errors.js";

const AUDIO_BIBLE_ID = "105a06b6146d11e7-01";
const BOOK_ID = "GEN";
const CHAPTER_ID = "GEN.1";

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const mockLanguage = {
  id: "eng",
  name: "English",
  nameLocal: "English",
  script: "Latin",
  scriptDirection: "LTR",
};

const mockAudioBibleSummary = {
  id: AUDIO_BIBLE_ID,
  abbreviation: "WEB",
  language: mockLanguage,
  countries: [{ id: "US", name: "United States" }],
  name: "World English Bible",
  type: "audio",
  updatedAt: "2021-01-01T00:00:00.000Z",
};

const mockAudioBible = {
  ...mockAudioBibleSummary,
  copyright: "Public Domain",
  info: "<p>Additional info</p>",
};

const mockChapterSummary = {
  id: CHAPTER_ID,
  bibleId: AUDIO_BIBLE_ID,
  number: "1",
  bookId: BOOK_ID,
  reference: "Genesis 1",
};

const mockAudioChapter = {
  ...mockChapterSummary,
  resourceUrl: "https://cdn.example.com/audio/GEN.1.mp3?sig=abc123",
  timecodes: [
    { start: "0:00", end: "0:05", verseId: "GEN.1.1" },
    { start: "0:05", end: "0:12", verseId: "GEN.1.2" },
  ],
  expiresAt: 1700000000,
  next: { id: "GEN.2", bookId: BOOK_ID, number: "2" },
  previous: { id: "intro.GEN", bookId: BOOK_ID, number: "intro" },
};

const mockBookSummary = {
  id: BOOK_ID,
  bibleId: AUDIO_BIBLE_ID,
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

describe("AudioBiblesResource", () => {
  describe("list", () => {
    it("returns a typed AudioBibleSummary array", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: [mockAudioBibleSummary], meta: {} }),
        );
      const { data } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).audioBibles.list();

      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(AUDIO_BIBLE_ID);
      expect(data[0].name).toBe("World English Bible");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.list();

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe("https://rest.api.bible/v1/audio-bibles");
    });

    it("sends language query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.list({
        language: "eng",
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("language=eng");
    });

    it("sends abbreviation and name query params", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.list({
        abbreviation: "WEB",
        name: "World English Bible",
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("abbreviation=WEB");
      expect(calledUrl).toContain("name=World+English+Bible");
    });

    it("joins ids array into a comma-separated query param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.list({
        ids: ["id-one", "id-two"],
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("ids=id-one%2Cid-two");
    });

    it("throws synchronously when an ids[] element contains a comma", () => {
      const fetchFn = vi.fn();
      const client = makeClient(fetchFn as unknown as typeof fetch);
      expect(() => client.audioBibles.list({ ids: ["ok-id", "bad,id"] })).toThrow(/contains a comma/);
      expect(() => client.audioBibles.list({ ids: ["ok-id", "bad,id"] })).toThrow(InvalidInputError);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("sends include-full-details boolean param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.list({
        includeFullDetails: true,
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-full-details=true");
    });

    it("does not append query params when called with no options", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.list();

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).not.toContain("?");
    });

    it("serializes includeFullDetails=false (not omitted)", async () => {
      // Regression for the per-method-builder refactor: a `false` is meaningful
      // and must be transmitted; only `undefined` should be omitted.
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.list({
        includeFullDetails: false,
      });

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-full-details=false");
    });
  });

  describe("get", () => {
    it("returns a typed AudioBible with copyright and info", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockAudioBible, meta: {} }),
        );
      const { data } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).audioBibles.get(AUDIO_BIBLE_ID);

      expect(data.id).toBe(AUDIO_BIBLE_ID);
      expect(data.copyright).toBe("Public Domain");
      expect(data.info).toBe("<p>Additional info</p>");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockAudioBible, meta: {} }),
        );
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.get(
        AUDIO_BIBLE_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/audio-bibles/${AUDIO_BIBLE_ID}`,
      );
    });

    it("propagates NotFoundError for unknown audio bible ID", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(404, { message: "Resource not found." }),
        );
      await expect(
        makeClient(fetchFn as unknown as typeof fetch).audioBibles.get(
          "unknown-id",
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("listBooks", () => {
    it("returns a typed AudioBookSummary array", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: [mockBookSummary], meta: {} }),
        );
      const { data } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).audioBibles.listBooks(AUDIO_BIBLE_ID);

      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(BOOK_ID);
      expect(data[0].name).toBe("Genesis");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.listBooks(
        AUDIO_BIBLE_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/audio-bibles/${AUDIO_BIBLE_ID}/books`,
      );
    });

    it("sends include-chapters boolean param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.listBooks(
        AUDIO_BIBLE_ID,
        { includeChapters: true },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-chapters=true");
    });

    // Embedded chapters omit `reference` and add `position`, unlike the ones
    // the chapters endpoints return. The include-chapters tests above assert
    // only on the URL and mock an empty data array, so nothing exercised the
    // embedded shape until now.
    it("parses embedded chapters, which carry no reference", async () => {
      const bookWithChapters = {
        ...mockBookSummary,
        chapters: [
          { id: "GEN.1", bibleId: AUDIO_BIBLE_ID, bookId: BOOK_ID, number: "1", position: 0 },
          { id: "GEN.2", bibleId: AUDIO_BIBLE_ID, bookId: BOOK_ID, number: "2", position: 1 },
        ],
      };
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [bookWithChapters], meta: {} }));
      const { data } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).audioBibles.listBooks(AUDIO_BIBLE_ID, { includeChapters: true });

      expect(data[0].chapters).toHaveLength(2);
      expect(data[0].chapters![0].id).toBe("GEN.1");
      expect(data[0].chapters![0].reference).toBeUndefined();
    });

    it("sends include-chapters-and-sections boolean param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.listBooks(
        AUDIO_BIBLE_ID,
        { includeChaptersAndSections: true },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-chapters-and-sections=true");
    });

    it("serializes includeChapters=false (not omitted)", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.listBooks(
        AUDIO_BIBLE_ID,
        { includeChapters: false },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-chapters=false");
    });
  });

  describe("getBook", () => {
    it("returns a typed AudioBookSummary", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockBookSummary, meta: {} }),
        );
      const { data } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).audioBibles.getBook(AUDIO_BIBLE_ID, BOOK_ID);

      expect(data.id).toBe(BOOK_ID);
      expect(data.nameLong).toBe(
        "The First Book of Moses, called Genesis",
      );
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockBookSummary, meta: {} }),
        );
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.getBook(
        AUDIO_BIBLE_ID,
        BOOK_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/audio-bibles/${AUDIO_BIBLE_ID}/books/${BOOK_ID}`,
      );
    });

    it("sends include-chapters boolean param", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockBookSummary, meta: {} }),
        );
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.getBook(
        AUDIO_BIBLE_ID,
        BOOK_ID,
        { includeChapters: true },
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toContain("include-chapters=true");
    });
  });

  describe("listChapters", () => {
    it("returns a typed AudioChapterSummary array", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: [mockChapterSummary], meta: {} }),
        );
      const { data } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).audioBibles.listChapters(AUDIO_BIBLE_ID, BOOK_ID);

      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(CHAPTER_ID);
      expect(data[0].reference).toBe("Genesis 1");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(mockResponse(200, { data: [], meta: {} }));
      await makeClient(
        fetchFn as unknown as typeof fetch,
      ).audioBibles.listChapters(AUDIO_BIBLE_ID, BOOK_ID);

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/audio-bibles/${AUDIO_BIBLE_ID}/books/${BOOK_ID}/chapters`,
      );
    });
  });

  describe("getChapter", () => {
    it("returns a typed AudioChapter with resourceUrl, timecodes, and expiresAt", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, {
            data: mockAudioChapter,
            meta: { fumsId: "fums-456" },
          }),
        );
      const { data, meta } = await makeClient(
        fetchFn as unknown as typeof fetch,
      ).audioBibles.getChapter(AUDIO_BIBLE_ID, CHAPTER_ID);

      expect(data.id).toBe(CHAPTER_ID);
      expect(data.resourceUrl).toBe(
        "https://cdn.example.com/audio/GEN.1.mp3?sig=abc123",
      );
      expect(data.timecodes).toHaveLength(2);
      expect(data.timecodes![0].verseId).toBe("GEN.1.1");
      expect(data.expiresAt).toBe(1700000000);
      expect(data.next?.id).toBe("GEN.2");
      expect(data.previous?.id).toBe("intro.GEN");
      expect(meta?.fumsId).toBe("fums-456");
    });

    it("calls the correct URL path", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(200, { data: mockAudioChapter, meta: {} }),
        );
      await makeClient(fetchFn as unknown as typeof fetch).audioBibles.getChapter(
        AUDIO_BIBLE_ID,
        CHAPTER_ID,
      );

      const calledUrl = (fetchFn.mock.calls[0] as [string])[0];
      expect(calledUrl).toBe(
        `https://rest.api.bible/v1/audio-bibles/${AUDIO_BIBLE_ID}/chapters/${CHAPTER_ID}`,
      );
    });

    it("propagates NotFoundError for unknown chapter ID", async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          mockResponse(404, { message: "Resource not found." }),
        );
      await expect(
        makeClient(fetchFn as unknown as typeof fetch).audioBibles.getChapter(
          AUDIO_BIBLE_ID,
          "GEN.999",
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
