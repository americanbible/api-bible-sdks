import { describe, it } from 'vitest';
import { createBibleClient } from '../../src/client.js';
import { CASES } from './cases.js';
import { loadRecordings, makeReplayFetch } from './replay.js';

// Deterministic, offline tier of the contract test. Each recorded api.bible
// response is replayed through the real client, so the SDK's own Zod schemas
// validate it exactly as they would in production. This guards against schema
// edits that no longer accept a real-shaped response (drift in the other
// direction is caught by the key-gated live tier; see contract.live.test.ts).
//
// Fixtures are seeded with realistic shapes and regenerated from the live API
// with `npm run record-fixtures`. If the fixtures file is somehow empty, the
// suite skips rather than passing vacuously.

const recordings = loadRecordings();
const hasFixtures = Object.keys(recordings.requests).length > 0;

describe.skipIf(!hasFixtures)('contract (recorded fixtures)', () => {
  const fetch = makeReplayFetch(recordings);

  for (const testCase of CASES) {
    it(`${testCase.name}: recorded response satisfies the schema`, async () => {
      const client = createBibleClient({ apiKey: 'fixture-key', fetch, retry: { maxAttempts: 1 } });
      // Throws ValidationError if any response in the case fails its schema.
      await testCase.run(client);
    });
  }
});
