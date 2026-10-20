# Endpoints

Each section gives the SDK call first and the raw HTTP equivalent second. The examples assume
this client and a `bibleId` resolved as `SKILL.md` describes:

```ts
import { createBibleClient } from '@americanbible/api-bible-sdk';

const client = createBibleClient({ apiKey: process.env.BIBLE_API_KEY! });
const bibleId = 'de4e12af7f28f599-01';
```

Raw HTTP: `GET https://rest.api.bible/v1<path>` with the header `api-key: <key>`. The `content`,
search and audio query parameters are covered in `content-and-search.md`.

Every SDK method takes an optional `AbortSignal` as its last argument.

## Bibles

```ts
const { data: english } = await client.bibles.list({ language: 'eng' });
const { data: withDetails } = await client.bibles.list({ ids: [bibleId], includeFullDetails: true });
const { data: bible } = await client.bibles.get(bibleId);
console.log(english.length, withDetails[0]?.copyright, bible.name, bible.copyright, bible.info);
```

```bash
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles?language=eng"
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01"
```

`bibles.list` takes `language`, `abbreviation`, `name`, `ids` and `includeFullDetails`.
`copyright` and `info` are left out of the plain listing. Get them from `bibles.get` or from
`includeFullDetails: true`.

## Books

```ts
const { data: books } = await client.books.list(bibleId, { includeChapters: true });
const { data: john } = await client.books.get(bibleId, 'JHN');
console.log(books.map((book) => book.id), john.name);
```

```bash
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01/books?include-chapters=true"
```

## Chapters

```ts
const { data: chapters } = await client.chapters.list(bibleId, 'JHN');
const { data: chapter, meta } = await client.chapters.get(bibleId, 'JHN.3', { contentType: 'text' });
console.log(chapters.length, chapter.content, chapter.copyright, meta?.fumsToken);
```

```bash
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01/chapters/JHN.3?content-type=text"
```

## Verses

```ts
const { data: verses } = await client.verses.list(bibleId, 'JHN.3');
const { data: verse, meta } = await client.verses.get(bibleId, 'JHN.3.16', { contentType: 'text' });
console.log(verses.length, verse.content, verse.copyright, meta?.fumsToken);
```

```bash
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01/verses/JHN.3.16?content-type=text"
```

## Passages

Use a passage for any range of verses: one call instead of a loop.

```ts
const { data: passage, meta } = await client.passages.get(bibleId, 'JHN.3.16-JHN.3.21', {
  contentType: 'text',
});
console.log(passage.id, passage.reference, passage.content, passage.copyright, meta?.fumsToken);
```

```bash
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01/passages/JHN.3.16-JHN.3.21?content-type=text"
```

At most 200 verses come back. Check `passage.id` to see the range actually returned.

## Sections

Sections are the headed units a translation divides its text into, such as "The Creation".

```ts
const { data: inBook } = await client.sections.listForBook(bibleId, 'GEN');
const { data: inChapter } = await client.sections.listForChapter(bibleId, 'GEN.1');
const { data: section } = await client.sections.get(bibleId, 'GEN.S1', { contentType: 'text' });
console.log(inBook.length, inChapter.length, section.title);
```

```bash
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01/books/GEN/sections"
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01/sections/GEN.S1"
```

## Search

```ts
import { isKeywordSearchResult } from '@americanbible/api-bible-sdk';

const { data: result } = await client.search.search(bibleId, { query: 'faith hope love', limit: 10 });
if (isKeywordSearchResult(result)) {
  for (const hit of result.verses) console.log(hit.reference, hit.text);
}
```

```bash
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01/search?query=faith%20hope%20love&limit=10"
```

Parameters, result shapes and pagination are covered in `content-and-search.md`.

## Audio Bibles

Audio has its own IDs, separate from text Bibles, and its own licensing. A text `Bible` lists any
related audio Bibles in `audioBibles`. Audio is fetched **one chapter at a time**, never by verse.

```ts
const { data: audioBibles } = await client.audioBibles.list({ language: 'eng' });
const audioBibleId = audioBibles[0]?.id;
if (audioBibleId) {
  const { data: chapter, meta } = await client.audioBibles.getChapter(audioBibleId, 'JHN.3');
  const expiresAt = new Date(chapter.expiresAt * 1000);
  console.log(chapter.resourceUrl, expiresAt, chapter.timecodes?.length, meta?.fumsToken);
}
```

```bash
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/audio-bibles?language=eng"
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/audio-bibles/<audioBibleId>/chapters/JHN.3"
```

Other audio methods: `audioBibles.get`, `listBooks`, `getBook` and `listChapters`.

- `resourceUrl` is a **signed URL that expires**, by default about an hour after the request.
  `expiresAt` says exactly when. Request the chapter when the user is about to play it, and don't
  store the URL or put it in a long-lived cache.
- `timecodes`, which map verse IDs to start and end times, appear only when API.Bible has them for
  that chapter.
- Report audio playback with `fums('trackListen', token)`, not `trackView`.

## Versification across translations (`use-org-id`)

Translations divide verses differently. Psalms are the usual case: the standard versification
counts a psalm's superscription as verse 1, and many translations don't, so their `PSA.3.1` is the
standard `PSA.3.2`. Every verse carries two references:

- `id` is the verse as this translation numbers it;
- `orgId` is the verse in the standard versification that API.Bible normalizes every translation to.

To attach your own content (notes, highlights, cross-references) to a verse, or to line up
translations, store and compare `orgId`, not `id`. To fetch a verse or passage by its `orgId`,
add `use-org-id=true`. The SDK has no option for it, so pass it with raw HTTP:

```bash
curl -s -H "api-key: $BIBLE_API_KEY" "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01/verses/PSA.3.2?use-org-id=true"
```

A verse span can map to more than one standard verse (`verseOrgIds`). In that case relate your
content to all of them.
