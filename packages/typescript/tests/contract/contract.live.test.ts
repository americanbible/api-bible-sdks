import { describe, it } from 'vitest';
import { createBibleClient } from '../../src/client.js';
import { CASES } from './cases.js';

// Key-gated live tier of the contract test. This is the real schema-drift
// detector: it hits api.bible directly and fails if any response no longer
// matches the SDK's schema. It self-skips when BIBLE_API_KEY is unset, so it is
// inert in PR CI and in local runs without a key — it is wired to run on a
// nightly schedule (see .github/workflows/contract.yml) instead.

const apiKey = process.env.BIBLE_API_KEY;

describe.skipIf(!apiKey)('contract (live api.bible)', () => {
  for (const testCase of CASES) {
    it(
      `${testCase.name}: live response satisfies the schema`,
      async () => {
        const client = createBibleClient({
          apiKey: apiKey!,
          timeout: 20_000,
          retry: { maxAttempts: 3, baseDelayMs: 500 },
        });
        // Throws ValidationError on schema drift, or an ApiError on a real failure.
        await testCase.run(client);
      },
      30_000,
    );
  }
});
