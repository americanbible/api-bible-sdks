---
name: api-bible
description: >-
  Build Scripture integrations with API.Bible (American Bible Society). Use when
  working with Bible verses, passages, chapters, translations, or Scripture search
  in an app or website: covers the api-key header, bibleId/verseId formats, the
  official @americanbible/api-bible-sdk TypeScript SDK and its React hooks, FUMS
  usage reporting, and copyright display. Trigger on mentions of api.bible, Bible
  API, Scripture API, verse lookup, or Bible translation integration.
license: Apache-2.0
metadata:
  author: American Bible Society
  version: "1.0"
  sdk-version: "2.0.1"
---

# API.Bible

API.Bible serves the text and audio of hundreds of Bible translations over a REST API. Use the
official SDK, `@americanbible/api-bible-sdk`, rather than hand-written `fetch` calls. It sets the
auth header, validates responses, retries transient failures and throws typed errors.

## Rules that are easy to get wrong

1. **Auth is one header: `api-key: <your key>`.** It is not `Authorization`, not `Bearer` and not
   HTTP Basic, whatever older docs say.
2. **The base URL is `https://rest.api.bible/v1`.** `api.scripture.api.bible` is a legacy host
   that routes to it. Don't use it in new code.
3. **Keep the key on the server.** Never put it in browser JavaScript or a mobile bundle. Browser
   apps call your own backend, which adds the key (see [references/react.md](references/react.md)).
4. **Translations are addressed by an opaque `bibleId`, never by name or abbreviation.** `"NIV"`
   and `"KJV"` are not IDs. Look the ID up (step 1 below). Never invent one.
5. **References use dotted IDs:** `JHN.3.16`, not `John 3:16` or `43003016`. Numbered books are
   `1JN`, `2CO`, not `1JHN` or `1John`. See [references/id-formats.md](references/id-formats.md).
6. **Web apps must report every `meta.fumsToken` to FUMS** and must show the copyright notice.
   These are licensing obligations, not optional telemetry. See
   [references/licensing-and-fums.md](references/licensing-and-fums.md).

## Install and create a client

```bash
npm install @americanbible/api-bible-sdk
```

Requires Node 20 or later. The package ships both ESM and CommonJS builds. Get a free key at
https://api.bible and keep it in an environment variable.

```ts
import { createBibleClient } from '@americanbible/api-bible-sdk';

export const client = createBibleClient({ apiKey: process.env.BIBLE_API_KEY! });
```

Every method returns `{ data, meta? }`. `meta` is present on Scripture content responses and
carries `fumsToken`.

## The workflow: resolve the bibleId, build the ID, fetch

You can't ask for "John 3:16 in the KJV" in one call. Do it in three steps:

1. **Resolve the `bibleId`.** Use the known-IDs table below, or `client.bibles.list()`
   (`GET /bibles`) filtered by `abbreviation`, `language` (ISO 639-3, e.g. `eng`) or `name`.
   Then match the results exactly:
   - The filters match substrings, so `abbreviation: 'KJV'` also returns NKJV and KJVCPB.
   - `abbreviation` can carry a language prefix (`engKJV`). The plain form is in
     `abbreviationLocal`.
   - Several Bibles can share an abbreviation (KJV has `-01` and `-02`). Prefer the known ID, or
     let the user choose.

   Cache the result, since IDs don't change.
2. **Build the resource ID** in dotted form: `JHN.3.16`, `JHN.3`, `GEN.1.1-GEN.2.3`.
3. **Call the content method** with both.

```ts
import { createBibleClient } from '@americanbible/api-bible-sdk';

const client = createBibleClient({ apiKey: process.env.BIBLE_API_KEY! });

const { data: bibles } = await client.bibles.list({ abbreviation: 'KJV', language: 'eng' });
const matches = bibles.filter((bible) => bible.abbreviationLocal === 'KJV' || bible.abbreviation === 'KJV');
const kjv = matches.find((bible) => bible.id === 'de4e12af7f28f599-01') ?? matches[0];
if (!kjv) throw new Error('KJV is not available to this API key');

const { data: verse, meta } = await client.verses.get(kjv.id, 'JHN.3.16', {
  contentType: 'text',
  includeVerseNumbers: false,
});

console.log(verse.reference, verse.content);
console.log(verse.copyright);
console.log(meta?.fumsToken);
```

The same three steps over raw HTTP, when the SDK isn't an option:

```bash
curl -s -H "api-key: $BIBLE_API_KEY" \
  "https://rest.api.bible/v1/bibles?abbreviation=KJV&language=eng"
curl -s -H "api-key: $BIBLE_API_KEY" \
  "https://rest.api.bible/v1/bibles/de4e12af7f28f599-01/verses/JHN.3.16?content-type=text"
```

For more than one verse, make **one passage call** (`client.passages.get(bibleId, 'JHN.3.16-JHN.3.21')`)
rather than looping over `verses.get`. A passage returns at most 200 verses.

## Known Bible IDs

Use these directly, or resolve any other translation through `bibles.list`.

| Translation | `bibleId` | Licensing |
| --- | --- | --- |
| King James Version (KJV) | `de4e12af7f28f599-01` | Public domain |
| Berean Standard Bible (BSB) | `bba9f40183526463-01` | Public domain |
| Douay-Rheims (DRA) | `179568874c45066f-01` | Public domain |
| American Standard Version (ASV) | `06125adad2d5898a-01` | Public domain |
| World English Bible (WEB) | `9879dbb7cfe39e4d-01` | Public domain |
| New International Version (NIV) | `78a9f6124f344018-01` | Licensed |
| New American Standard Bible (NASB) | `a761ca71e0b3ddcf-01` | Licensed |
| Christian Standard Bible (CSB) | `a556c5305ee15c3f-01` | Licensed |

A licensed Bible works only if it is licensed to your key. Otherwise the API answers **403** with
"You are not authorized to access that bible", as it does for a `bibleId` that doesn't exist (see
[references/errors-and-quotas.md](references/errors-and-quotas.md)).

## Displaying Scripture: copyright and FUMS

Whenever you show Scripture content:

- **Show the copyright.** Content responses carry a `copyright` field. `Bible.copyright` and
  `Bible.info`, from `bibles.get(bibleId)` or `bibles.list({ includeFullDetails: true })`, are
  what the Terms require you to display.
- **Report the view to FUMS.** In a web app, send `meta.fumsToken` from each content response to
  the browser and call `fums('trackView', token)` from API.Bible's tracker script (`trackListen`
  for audio). Apps that don't run in a browser use `GET https://fums.api.bible/f3?t=<token>`.
  Mobile-only apps with no web interface are exempt. The full snippets are in
  [references/licensing-and-fums.md](references/licensing-and-fums.md).

For a clean reading view, request `contentType: 'text'` with notes off. For a study view, request
`html` or `json` with notes and titles on. See
[references/content-and-search.md](references/content-and-search.md).

## Errors at a glance

| Status | SDK error | Usual cause |
| --- | --- | --- |
| 400 | `BadRequestError` | Malformed request, e.g. a search with no `query` |
| 401 | `AuthError` | No `api-key` header sent |
| 403 | `AuthError` | Every other refusal, so **read `message`**: `Invalid API key` (wrong key); `You are not authorized to access that bible` (unknown or unlicensed `bibleId`); `… limit exceeded` (quota); `Application is …` (inactive application) |
| 404 | `NotFoundError` | A malformed or nonexistent book, chapter, verse or passage ID, e.g. `John 3:16` |

## Which reference to read

- [references/id-formats.md](references/id-formats.md): every ID format, the book codes and the
  common wrong forms.
- [references/endpoints.md](references/endpoints.md): each SDK resource with its curl equivalent,
  plus audio Bibles and versification (`use-org-id`).
- [references/content-and-search.md](references/content-and-search.md): content-type and
  `include-*` options, and search parameters, result shapes and pagination.
- [references/errors-and-quotas.md](references/errors-and-quotas.md): error bodies, the three
  causes of a 403, SDK error classes, quotas and caching.
- [references/licensing-and-fums.md](references/licensing-and-fums.md): FUMS reporting code,
  copyright display and plan licensing.
- [references/react.md](references/react.md): `@americanbible/api-bible-sdk-react`, the
  server-side proxy that keeps the key out of the browser, and FUMS with hooks.

The machine-readable API spec is at https://rest.api.bible/v1/swagger.json, and the full docs
are at https://docs.api.bible.
