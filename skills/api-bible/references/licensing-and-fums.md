# Licensing, copyright and FUMS

## Why this matters

Publishers license their translations to API.Bible on two conditions: that usage is reported back
to them, and that their copyright is shown. Those conditions keep licensed translations available
on the platform. An integration that skips either one breaks API.Bible's Terms, so treat both as
required work, not as optional analytics.

## FUMS (Fair Use Management System)

Every Scripture content response, from `verses`, `chapters`, `passages`, `sections`, `search` and
audio chapters, includes a token:

```json
{ "data": { "...": "..." }, "meta": { "fumsToken": "G0wBgBwHbqxly..." } }
```

In the SDK it is `meta?.fumsToken`. Responses without Scripture content, such as `bibles.list`,
`bibles.get` and `books.list`, have no `meta`, so check before you read it.

**Who must report.** Every app with a web interface. A mobile-only app, downloaded from an app store
and with no user-facing web pages, is exempt.

**When.** Report each token once, when the content is shown to the user: `trackView` for text,
`trackListen` for audio. Several tokens can go in one call.

`meta` also declares `fumsId`, `fums`, `fumsJs` and `fumsJsInclude`. They belong to an older embed
flow and are normally absent, so ignore them.

### Web apps: the JavaScript tracker (recommended)

Add the tracker once per page, near the end of `<body>`:

```html
<script src="https://pkg.api.bible/fumsV3.min.js"></script>
<script>
  window.fumsData = window.fumsData || [];
  window.fums = window.fums || function () { window.fumsData.push(arguments); };
</script>
```

The shim queues calls made before the script has loaded. The tracker generates and manages the
anonymous device and session IDs itself.

Then report tokens from the browser:

```ts
type Fums = (command: 'config' | 'trackView' | 'trackListen', arg: unknown) => void;
const fums = (window as unknown as { fums: Fums }).fums;

export function reportView(fumsToken: string | undefined): void {
  if (fumsToken) fums('trackView', fumsToken);
}

export function reportViews(fumsTokens: string[]): void {
  if (fumsTokens.length > 0) fums('trackView', fumsTokens);
}

export function reportListen(fumsToken: string | undefined): void {
  if (fumsToken) fums('trackListen', fumsToken);
}

export function identifyUser(appUserId: string): void {
  fums('config', { userId: appUserId });
}
```

`identifyUser` is optional, for apps with logged-in users. Pass your own internal user ID, never an
email or other personal data. The tracker hashes it with SHA-256 before sending it.

The API key stays on the server, so the usual shape is: the server fetches the content, then passes
both the text and `meta.fumsToken` to the page, and the page calls `reportView` once the text is on
screen.

```ts
import { createBibleClient } from '@americanbible/api-bible-sdk';

const client = createBibleClient({ apiKey: process.env.BIBLE_API_KEY! });

export async function loadPassageForPage(bibleId: string, passageId: string) {
  const { data, meta } = await client.passages.get(bibleId, passageId, { contentType: 'html' });
  return {
    reference: data.reference,
    html: data.content,
    copyright: data.copyright,
    fumsToken: meta?.fumsToken,
  };
}
```

### Apps that don't run in a browser: the manual call

Servers rendering for non-browser clients, desktop apps, kiosks and the like call the endpoint
directly:

```
GET https://fums.api.bible/f3?t=<fumsToken>&dId=<deviceId>&sId=<sessionId>&uId=<userId>
```

- `t`: the token. Repeat it for several tokens (`&t=a&t=b`).
- `dId`: a random, anonymous ID for the device, created once and kept for the device's lifetime.
- `sId`: a random ID created at the start of each session.
- `uId`: optional. Your internal user ID, never personal data.

```ts
export async function reportFums(
  fumsTokens: string[],
  ids: { deviceId: string; sessionId: string; userId?: string },
): Promise<void> {
  if (fumsTokens.length === 0) return;
  const params = new URLSearchParams();
  for (const token of fumsTokens) params.append('t', token);
  params.set('dId', ids.deviceId);
  params.set('sId', ids.sessionId);
  if (ids.userId) params.set('uId', ids.userId);
  await fetch(`https://fums.api.bible/f3?${params.toString()}`);
}
```

The FUMS endpoint takes no API key.

## Copyright display

Show the copyright wherever Scripture appears:

- Content responses (`verse.copyright`, `chapter.copyright`, `passage.copyright`, …) carry the
  notice for that text. Show it next to the text, for example in a footer line below the passage.
- `Bible.copyright` and `Bible.info` are the translation-level notices the Terms require you to
  display. They come from `client.bibles.get(bibleId)` or from
  `client.bibles.list({ includeFullDetails: true })`, and the plain listing omits them. Show them
  on an "about this translation" view, or wherever the translation is selected.
- `copyright` and `info` may contain HTML. Sanitize them before you render them.

## What a plan lets you use

- The free **Starter** plan covers every public-domain and open-access Bible, plus up to **3
  licensed Bibles** that you choose in the API.Bible dashboard.
- Licensed (copyrighted) translations work only once they're licensed to your key. Until then their
  `bibleId` returns 403 with "You are not authorized to access that bible".
- Commercial use of copyrighted translations needs the right licensing. Check the Terms at
  https://api.bible/terms-and-conditions and each translation's `info`.
- Audio Bibles are licensed separately from text.
- Each translation's publisher can attach its own attribution and usage terms. Read `info`.
