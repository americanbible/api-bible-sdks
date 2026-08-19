import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createBibleClient } from '../src/index.js';
import { CASES } from '../tests/contract/cases.js';
import { FIXTURES_PATH, requestKey, sanitizeBody, type RecordingsFile } from '../tests/contract/replay.js';

// Regenerates tests/contract/fixtures/recordings.json from live api.bible.
// Run with a real key whenever a schema changes or the API does:
//
//   BIBLE_API_KEY=... npm run record-fixtures
//
// Every request the contract cases make is captured (URL key -> status + body)
// so the offline fixtures tier replays exactly what the live API returned.
//
// Bodies are sanitized before they are written: the audio-bible `resourceUrl`
// is a presigned S3 URL (STS key id + signature + session token) and
// `meta.fumsToken` is a live analytics token. See sanitizeBody in
// tests/contract/replay.ts — the fixtures are committed to a public repo and
// refreshed monthly by CI, so this has to happen here, not by hand.

const apiKey = process.env.BIBLE_API_KEY;
if (!apiKey) {
  console.error('Set BIBLE_API_KEY in your environment (or packages/typescript/.env) to record fixtures.');
  process.exit(1);
}

const requests: RecordingsFile['requests'] = {};

const recordingFetch: typeof globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const response = await globalThis.fetch(input as Parameters<typeof globalThis.fetch>[0], init);
  const text = await response.clone().text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  requests[requestKey(input)] = { status: response.status, body: sanitizeBody(body) };
  return response;
}) as typeof globalThis.fetch;

const client = createBibleClient({ apiKey, fetch: recordingFetch, timeout: 20_000 });

for (const testCase of CASES) {
  try {
    await testCase.run(client);
    console.log(`  ✓ recorded ${testCase.name}`);
  } catch (err) {
    console.error(`  ✗ FAILED ${testCase.name}:`, err);
  }
}

mkdirSync(dirname(FIXTURES_PATH), { recursive: true });
const file: RecordingsFile & { _comment: string } = {
  _comment:
    'Captured from live api.bible via `npm run record-fixtures`, then sanitized (see sanitizeBody in tests/contract/replay.ts). Do not edit by hand. Scripture text is the Berean Standard Bible (public domain, CC0). Audio-bible entries are third-party licensed metadata only — presigned URLs are rewritten to invalid.example.com and FUMS tokens are dropped.',
  requests,
};
writeFileSync(FIXTURES_PATH, JSON.stringify(file, null, 2) + '\n');
console.log(`\nWrote ${Object.keys(requests).length} requests to ${FIXTURES_PATH}`);
