# Errors and quotas

## Error responses

Error bodies are JSON:

```json
{ "statusCode": 403, "error": "Forbidden", "message": "You are not authorized to access that bible" }
```

| Status | Meaning | Messages you'll see |
| --- | --- | --- |
| 400 | Malformed request | e.g. a search with no `query` |
| 401 | No `api-key` header was sent | `Missing API key` |
| 403 | The request was refused. The key may be wrong, the application inactive, the quota used up or the Bible unavailable. **Read `message`** (see below) | `Invalid API key`, `You are not authorized to access that bible`, `Daily limit exceeded`, `Monthly limit exceeded…`, `Application is suspended…` |
| 404 | The resource doesn't exist: usually a malformed book, chapter, verse or passage ID, or a wrong path. An unknown `bibleId` gives 403 instead | `The requested verse does not exist` |

## Read the message on a 403

Almost every failure arrives as a 403, so the status code alone tells you nothing. Only a missing
header gets 401. Branch on `message`:

- **"Invalid API key"**: the key is wrong. It was mistyped, revoked, or belongs to another
  environment. Check the value in your configuration. This is the only 403 caused by the key
  itself.
- **"You are not authorized to access that bible"**: the key works, but either the `bibleId`
  doesn't exist (a guessed or mistyped ID ends up here, not at 404) or the key isn't licensed for
  it. Other Bibles keep working. Check the ID against `bibles.list`, then use a public-domain Bible
  or license this one for your app in the API.Bible dashboard.
- **"Daily limit exceeded"**, **"Monthly limit exceeded…"** or **"Monthly overage limit
  exceeded…"**: the quota is used up, and every call fails until it resets or the plan changes.
- **"Application is canceled / unpaid / suspended / deleted…"**: the application behind the key
  isn't active. Fix it in the API.Bible developer portal or contact support@api.bible.

None of these succeeds on retry, so don't retry a 403. Show the message to whoever can act on it.

## SDK error classes

The SDK turns error responses into typed errors. Each one's `message` is the API's `message`, and
`statusCode` and `body` hold the raw response.

| Error | When | Retried by the SDK |
| --- | --- | --- |
| `AuthError` | **401 and 403**: check `message` to tell the causes apart | No |
| `NotFoundError` | 404 | No |
| `BadRequestError` | 400 | No |
| `RateLimitError` | 429 | Yes, with backoff that honours `Retry-After` |
| `ServerError` | 5xx | Yes |
| `NetworkError` | DNS, TLS or timeout, before any response (`statusCode` 0) | Yes |
| `InvalidInputError` | You called the SDK wrong; no request was sent | No |
| `ValidationError` | The response didn't match the SDK's schema | No |

All of them extend `BibleError`, and every error except the last two extends `ApiError`.

```ts
import { AuthError, NotFoundError, createBibleClient } from '@americanbible/api-bible-sdk';

const client = createBibleClient({ apiKey: process.env.BIBLE_API_KEY! });

export async function getVerseText(bibleId: string, verseId: string): Promise<string | null> {
  try {
    const { data } = await client.verses.get(bibleId, verseId, { contentType: 'text' });
    return typeof data.content === 'string' ? data.content : null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    if (err instanceof AuthError) {
      if (/not authorized to access that bible/i.test(err.message)) {
        throw new Error(`Bible ${bibleId} doesn't exist or isn't licensed for this key`, { cause: err });
      }
      if (/limit exceeded/i.test(err.message)) throw new Error('API.Bible quota used up', { cause: err });
      throw new Error(`API.Bible refused the request: ${err.message}`, { cause: err });
    }
    throw err;
  }
}
```

## Quotas

| Plan | API calls | Bibles |
| --- | --- | --- |
| Starter (free) | 5,000 per month | Every public-domain and open-access Bible, plus up to 3 licensed Bibles |
| Pro | 150,000 per month | See https://api.bible |

- Every request counts as one call, whatever its size, so fewer, larger calls stretch a quota:
  - one `passages.get` for a range, not a loop of `verses.get`;
  - a whole chapter with `chapters.get`, not its verses one at a time;
  - one call to `bibles.list` at startup, with the result cached. Don't call it per request.
- Running out of quota returns **403**, not 429. The API doesn't currently send 429. The SDK still
  retries a 429 if it ever arrives, and an `onResponse` hook can read `X-RateLimit-Remaining`
  when the header is present.
- Overage on paid plans is billed per 1,000 calls. See https://api.bible for current pricing.

## Caching

You may cache Scripture content to save calls, within limits: cache fewer than 500 consecutive
verses of a translation, and clear the cache at least every 14 days. Lists of Bibles and books
change rarely and are safe to cache longer.
