import type { BibleClient } from '../../src/index.js';

// The Bible used for every case. The Berean Standard Bible (BSB) is public
// domain (CC0), stable on api.bible, and the same id the README quickstart and
// examples use — so recorded fixtures carry no copyrighted scripture.
export const BSB = 'bba9f40183526463-01';

/**
 * One contract case = one logical exercise of a resource. `run` drives the real
 * client; every method it calls validates its response against the SDK's Zod
 * schema, so a `run` that resolves means every response it touched matched the
 * schema. Both tiers share this table:
 *
 *   - contract.fixtures.test.ts replays recorded JSON through an injected fetch
 *     (deterministic, offline, runs in PR CI + coverage).
 *   - contract.live.test.ts hits real api.bible (key-gated, nightly).
 *
 * Cases that need an id the API does not guarantee (a section id, an audio
 * Bible id) discover it from a list call first and bail out quietly when there
 * is nothing to fetch — so the live tier never flakes on data availability,
 * while the fixtures tier always exercises the full chain because the recorded
 * list responses always contain an element.
 */
export interface ContractCase {
  name: string;
  run(client: BibleClient): Promise<void>;
}

export const CASES: ContractCase[] = [
  { name: 'bibles.list', run: async (c) => { await c.bibles.list({ language: 'eng' }); } },
  { name: 'bibles.get', run: async (c) => { await c.bibles.get(BSB); } },

  { name: 'books.list', run: async (c) => { await c.books.list(BSB); } },
  { name: 'books.get', run: async (c) => { await c.books.get(BSB, 'GEN'); } },

  { name: 'chapters.list', run: async (c) => { await c.chapters.list(BSB, 'GEN'); } },
  { name: 'chapters.get', run: async (c) => { await c.chapters.get(BSB, 'GEN.1', { contentType: 'text' }); } },

  { name: 'verses.list', run: async (c) => { await c.verses.list(BSB, 'GEN.1'); } },
  { name: 'verses.get', run: async (c) => { await c.verses.get(BSB, 'GEN.1.1', { contentType: 'text' }); } },
  // The edges of the Bible, where the API sends `next: {}` / `previous: {}`
  // instead of omitting the key. GEN.1.1 above never reaches either edge, which
  // is why the required `id` on the nav pointer went unnoticed until a consumer
  // hit it.
  { name: 'verses.get.boundary', run: async (c) => {
    await c.verses.get(BSB, 'REV.22.21', { contentType: 'text' });
    await c.verses.get(BSB, 'GEN.intro.0', { contentType: 'text' });
  } },

  { name: 'passages.get', run: async (c) => { await c.passages.get(BSB, 'GEN.1.1-GEN.1.3', { contentType: 'text' }); } },

  { name: 'search', run: async (c) => { await c.search.search(BSB, { query: 'love', limit: 3 }); } },
  // /search answers in one of two disjoint shapes. A query the API parses as a
  // scripture reference returns `passages` and omits the paging scalars
  // entirely, so the keyword case above cannot cover it.
  { name: 'search.reference', run: async (c) => { await c.search.search(BSB, { query: 'John 3:16-19' }); } },

  {
    name: 'sections',
    run: async (c) => {
      // If BSB exposes no /sections data on api.bible, listForBook returns an
      // empty array and get() below is skipped — the case still validates the
      // (empty) list responses, so the offline fixtures carry no section text.
      const forBook = await c.sections.listForBook(BSB, 'GEN');
      await c.sections.listForChapter(BSB, 'GEN.1');
      const first = forBook.data[0];
      if (first) await c.sections.get(BSB, first.id);
    },
  },

  {
    name: 'audio',
    // Unlike every other case, this one does not run against the BSB — it takes
    // whichever audio Bible api.bible lists first for `eng`, so the recording is
    // third-party licensed content (at time of writing, Faith Comes By Hearing,
    // ℗ 2013 Hosanna) and can change between refreshes.
    //
    // The recorded fixture is deliberately metadata-only. `getChapter` returns a
    // presigned S3 `resourceUrl` that grants real access to the audio until its
    // signature expires, so the recorder rewrites it to invalid.example.com —
    // the metadata is fine to publish, the URL is not. See sanitizeBody in
    // replay.ts.
    run: async (c) => {
      const list = await c.audioBibles.list({ language: 'eng' });
      const audioBible = list.data[0];
      if (!audioBible) return;
      await c.audioBibles.get(audioBible.id);

      const books = await c.audioBibles.listBooks(audioBible.id);
      const book = books.data[0];
      if (!book) return;

      // Embedded chapters are a different shape from the ones the chapters
      // endpoints return — they omit `reference` — so nothing above covers
      // them. Scoped to getBook rather than listBooks({ includeChapters }):
      // identical shape, one book's chapters instead of every book's, which
      // keeps the recording from growing by ~9k lines.
      await c.audioBibles.getBook(audioBible.id, book.id, { includeChapters: true });

      const chapters = await c.audioBibles.listChapters(audioBible.id, book.id);
      const chapter = chapters.data[0];
      if (!chapter) return;

      await c.audioBibles.getChapter(audioBible.id, chapter.id);
    },
  },
];
