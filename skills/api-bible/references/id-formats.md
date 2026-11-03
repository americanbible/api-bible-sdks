# ID formats

Every content call takes a `bibleId` plus one dotted resource ID. The API answers a malformed
resource ID with **404**, so most 404s come from building the ID wrong. An unknown `bibleId`
returns **403** ("You are not authorized to access that bible") instead.

| ID | Format | Valid example | Wrong forms |
| --- | --- | --- | --- |
| `bibleId` | 16 hex characters, then `-01`, `-02`, … (19 characters) | `de4e12af7f28f599-01` | `KJV`, `NIV`, `kjv-en`, any made-up hex |
| `bookId` | 3-character USFM code | `GEN`, `MRK`, `1JN` | `Genesis`, `Mark`, `1JHN`, `1John`, `1 John` |
| `chapterId` | `BOOK.chapter`, or `BOOK.intro` | `JHN.3`, `GEN.intro` | `John 3`, `JHN3`, `JHN.03` |
| `verseId` | `BOOK.chapter.verse` | `JHN.3.16` | `John 3:16`, `JHN 3:16`, `43003016`, `JHN.3:16` |
| `passageId` | `startId-endId` | `GEN.1.1-GEN.2.3`, `JHN.3` | `GEN.1.1-2.3`, `Genesis 1:1-2:3`, `GEN.1.1–GEN.2.3` (en dash) |
| `sectionId` | `BOOK.S<n>` | `GEN.S1` | `GEN.1.S1`, `GEN-S1` |

## bibleId

A `bibleId` is opaque. You can't derive it from a translation's name, so always resolve it with
`client.bibles.list({ abbreviation, language, name })` or take it from the known-IDs table in
`SKILL.md`. Match the `bibles.list` results exactly:

- The `abbreviation` and `name` filters match substrings: `abbreviation=KJV` also returns `NKJV`
  and `KJVCPB`.
- The `abbreviation` field can carry a language prefix (`engKJV`), and the plain form is in
  `abbreviationLocal`. Compare against both.
- Several Bibles can share an abbreviation. `de4e12af7f28f599-01` and `-02` are both "KJV", and
  BSB has two entries. Filter by `language`, prefer a known ID, and when you're still left with
  more than one, let the user choose instead of picking silently.

## Passages

- Both ends are full IDs: `GEN.1.1-GEN.2.3`. The end is never shortened to `2.3`.
- Join them with a plain hyphen (`-`), not an en dash.
- A passage may span books (`MAT.28.16-MRK.1.8`), and it may be a whole chapter (`JHN.3`).
- A passage returns **at most 200 verses**. A longer range is truncated, and the response's `id`
  shows the range actually returned. Compare it with what you asked for.
- In `range` for search and in `parallels`, separate several IDs with commas.

## Book codes (USFM)

Watch the ones that don't follow the obvious abbreviation: `SNG` (Song of Songs), `EZK`, `JOL`,
`NAM`, `PHP`, `JAS`, `JUD` (Jude; Judges is `JDG`), `MRK`, `JHN`. Numbered books start with the
digit: `1SA`, `2KI`, `1CO`, `3JN`.

| Old Testament | | | | |
| --- | --- | --- | --- | --- |
| `GEN` Genesis | `EXO` Exodus | `LEV` Leviticus | `NUM` Numbers | `DEU` Deuteronomy |
| `JOS` Joshua | `JDG` Judges | `RUT` Ruth | `1SA` 1 Samuel | `2SA` 2 Samuel |
| `1KI` 1 Kings | `2KI` 2 Kings | `1CH` 1 Chronicles | `2CH` 2 Chronicles | `EZR` Ezra |
| `NEH` Nehemiah | `EST` Esther | `JOB` Job | `PSA` Psalms | `PRO` Proverbs |
| `ECC` Ecclesiastes | `SNG` Song of Songs | `ISA` Isaiah | `JER` Jeremiah | `LAM` Lamentations |
| `EZK` Ezekiel | `DAN` Daniel | `HOS` Hosea | `JOL` Joel | `AMO` Amos |
| `OBA` Obadiah | `JON` Jonah | `MIC` Micah | `NAM` Nahum | `HAB` Habakkuk |
| `ZEP` Zephaniah | `HAG` Haggai | `ZEC` Zechariah | `MAL` Malachi | |

| New Testament | | | | |
| --- | --- | --- | --- | --- |
| `MAT` Matthew | `MRK` Mark | `LUK` Luke | `JHN` John | `ACT` Acts |
| `ROM` Romans | `1CO` 1 Corinthians | `2CO` 2 Corinthians | `GAL` Galatians | `EPH` Ephesians |
| `PHP` Philippians | `COL` Colossians | `1TH` 1 Thessalonians | `2TH` 2 Thessalonians | `1TI` 1 Timothy |
| `2TI` 2 Timothy | `TIT` Titus | `PHM` Philemon | `HEB` Hebrews | `JAS` James |
| `1PE` 1 Peter | `2PE` 2 Peter | `1JN` 1 John | `2JN` 2 John | `3JN` 3 John |
| `JUD` Jude | `REV` Revelation | | | |

Deuterocanonical books, and the books a given translation actually contains, vary by Bible. Get
the authoritative list with `client.books.list(bibleId)`.

## Turning a human reference into an ID

```ts
const BOOK_CODES: Record<string, string> = { john: 'JHN', '1 john': '1JN', genesis: 'GEN' };

export function toVerseId(book: string, chapter: number, verse: number): string {
  const code = BOOK_CODES[book.trim().toLowerCase()];
  if (!code) throw new Error(`Unknown book: ${book}`);
  return `${code}.${chapter}.${verse}`;
}
```

If the input is free text such as "John 3:16-19", the search endpoint parses references for you:
`client.search.search(bibleId, { query: 'John 3:16-19' })` returns the matching passage. See
`content-and-search.md`.
