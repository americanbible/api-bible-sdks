import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Recorded api.bible responses, keyed by `pathname + search` of the request URL
// (origin and the api-key header are irrelevant to the response shape, so they
// are not part of the key). Shared by the recorder (writes) and the fixtures
// test (reads).

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_PATH = join(here, 'fixtures', 'recordings.json');

export interface Recording {
  status: number;
  /** The parsed JSON body, stored as an object for human-readable fixtures. */
  body: unknown;
}

export interface RecordingsFile {
  requests: Record<string, Recording>;
}

/** Normalizes any fetch input into the recordings key: `pathname + search`. */
export function requestKey(input: string | URL | Request): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw);
  return url.pathname + url.search;
}

// Recorded bodies are not automatically safe to publish. The audio-bible
// `resourceUrl` is a presigned S3 URL whose query string carries an STS access
// key id, signature, and session token — committing it grants real access to
// the audio for the signature's lifetime — and `meta.fumsToken` is a live
// api.bible analytics token. Both are stripped at record time so the monthly
// refresh-fixtures workflow cannot re-publish them.

const PLACEHOLDER_ORIGIN = 'https://invalid.example.com';

/** Substrings that mark a string value as credential-bearing, whatever its key. */
export const CREDENTIAL_MARKERS = ['AWSAccessKeyId', 'X-Amz-Signature', 'x-amz-security-token', 'Signature='];

/** Everything the committed fixtures must never contain. Asserted by fixtures-clean.test.ts. */
export const FIXTURE_LEAK_MARKERS = [...CREDENTIAL_MARKERS, 'fumsToken', 'amazonaws.com'];

/** Keys dropped outright — the field is optional in the schema, so replay is unaffected. */
const DROPPED_KEYS = new Set(['fumsToken']);

/** Keys always rewritten, marker or not, because the API may re-sign them at any time. */
const URL_KEYS = new Set(['resourceUrl']);

/** Rewrites a URL to a non-resolvable placeholder, keeping the path (and extension). */
function redactUrl(value: string): string {
  try {
    return PLACEHOLDER_ORIGIN + new URL(value).pathname;
  } catch {
    return '[redacted]';
  }
}

/**
 * Strips credentials from a recorded response body. Applied at capture time by
 * scripts/record-fixtures.ts, so both the committed fixtures and every future
 * re-recording are clean. `resourceUrl` is rewritten rather than deleted
 * because AudioChapterSchema requires it.
 */
export function sanitizeBody(body: unknown): unknown {
  if (Array.isArray(body)) return body.map((item) => sanitizeBody(item));
  if (body === null || typeof body !== 'object') {
    if (typeof body === 'string' && CREDENTIAL_MARKERS.some((marker) => body.includes(marker))) {
      return redactUrl(body);
    }
    return body;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (DROPPED_KEYS.has(key)) continue;
    out[key] = URL_KEYS.has(key) && typeof value === 'string' ? redactUrl(value) : sanitizeBody(value);
  }
  return out;
}

export function loadRecordings(): RecordingsFile {
  if (!existsSync(FIXTURES_PATH)) return { requests: {} };
  return JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as RecordingsFile;
}

/**
 * Builds a `fetch` stand-in that serves recorded bodies by request key. An
 * unrecorded request throws rather than silently 404-ing, so a case that grows
 * a new call fails loudly until its fixture is recorded.
 */
export function makeReplayFetch(recordings: RecordingsFile): typeof globalThis.fetch {
  const fn = async (input: string | URL | Request): Promise<Response> => {
    const key = requestKey(input);
    const rec = recordings.requests[key];
    if (!rec) {
      throw new Error(`No recorded fixture for "${key}". Run "npm run record-fixtures" to capture it.`);
    }
    const bodyText = JSON.stringify(rec.body);
    return {
      ok: rec.status >= 200 && rec.status < 300,
      status: rec.status,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(bodyText),
    } as unknown as Response;
  };
  return fn as unknown as typeof globalThis.fetch;
}
