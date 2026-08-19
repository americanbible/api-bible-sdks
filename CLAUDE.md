# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working style

### Response style

Keep responses focused, brief, and concise. Keep disclaimers and caveats short, and spend most of the response on the main answer. When asked to explain something, give a high-level summary unless an in-depth explanation is specifically requested.

### Progress updates during a task

Before your first tool call, say in one sentence what you're about to do. While working, give a brief update only when you find something important or change direction. When you finish, lead with the outcome: your first sentence should answer "what happened" or "what did you find," with supporting detail after it for readers who want it.

### Written deliverables

Match the length of written documents to what the task needs: cover the substance, but do not pad with filler sections, redundant summaries, or boilerplate. This applies to files written to disk — READMEs, migration notes, status docs, PR bodies.

### Task scope

Deliver what was asked, at the scope intended. Make routine judgment calls yourself, and check in only when different readings of the request would lead to materially different work. If the request seems mistaken or a better approach exists, say so in a sentence and continue with the task as asked rather than quietly narrowing, widening, or transforming it. Finish the whole task, and stop short of actions that are clearly beyond what was asked.

Don't add verification passes that weren't asked for. Running `npm run typecheck && npm run test` after a change is the expected check here; a separate "final verification step" on top of that is not.

### Self-correction

Only correct an earlier statement when the error would change the user's code, conclusions, or decisions. State corrections plainly and briefly, then continue the task. For slips that change nothing for the user, make the fix and move on without noting it.

### Code review

When reviewing code in this repo, report everything you find and filter in a separate pass — do not pre-filter to "high severity only" or aim to be conservative, which suppresses real findings.

## Commands

All commands below can be run from the repo root (they use npm workspaces) or from inside `packages/typescript/`.

```bash
# Typecheck, test, build
npm run typecheck
npm run test
npm run build

# Run a single test file
npm -w @americanbible/api-bible-sdk run test -- --reporter=verbose path/to/test.ts

# Run examples (requires BIBLE_API_KEY in packages/typescript/.env)
npm -w @americanbible/api-bible-sdk run example
```

The `prepublishOnly` hook runs `typecheck && test && build` automatically before `npm publish`.

### Python SDK (`packages/python`)

The Python package is not part of the npm workspace — run its tooling from `packages/python` (Python 3.10+):

```bash
cd packages/python
pip install -e ".[dev]" -c requirements-dev.txt   # pinned dev toolchain (matches CI)
ruff check . && mypy && pytest --cov=api_bible
```

## Architecture

This is an npm workspaces monorepo with three active SDKs: `packages/typescript` (`@americanbible/api-bible-sdk`) and `packages/react` (`@americanbible/api-bible-sdk-react`) share the root npm workspace, while `packages/python` (`americanbible-api-bible-sdk`) sits alongside with its own `pyproject.toml` and toolchain (pytest/ruff/mypy) and is not part of the npm workspace. The notes below focus on the TypeScript core; see each package's README for React and Python specifics.

### `packages/typescript` — `@americanbible/api-bible-sdk`

**Dual ESM + CJS** — authored as ESM (`"type": "module"`, NodeNext resolution), built with tsdown to ship both `dist/index.js` (ESM) and `dist/index.cjs` (CJS) with types for each. Requires Node 20+. Runtime dependency: only `zod`.

#### Request lifecycle

```
createBibleClient(config) → BibleClient
  ↓ each property is a resource class instance
BiblesResource / BooksResource / ChaptersResource / VersesResource /
PassagesResource / SectionsResource / AudioBiblesResource / SearchResource
  ↓ each method calls
Fetcher.request(path, params)
  ↓ builds URL, sets headers, calls fetch with AbortController timeout
  ↓ on 429 / 5xx: exponential backoff + full jitter, respects Retry-After header
  ↓ parses JSON, validates with Zod schema
caller receives typed, validated response or throws typed error
```

#### Key files

- `src/client.ts` — `createBibleClient` factory; validates `apiKey`, constructs all 8 resources, returns `BibleClient` interface
- `src/http/fetcher.ts` — all network logic: timeout (AbortController), retry with backoff, Retry-After header parsing, request cancellation via caller-supplied AbortSignal
- `src/http/errors.ts` — error hierarchy: `ApiError` → `AuthError`, `NotFoundError`, `BadRequestError`, `RateLimitError`, `ServerError`; plus `ValidationError` for Zod failures
- `src/schemas/common.ts` — `apiResponseSchema<T>(dataSchema)` envelope used by all resources; optional `meta` field carries FUMS analytics data
- `src/resources/*.ts` — one file per resource; each implements `toQueryParams()` (camelCase → kebab-case, omits `undefined`, arrays → comma-joined)

#### Schema conventions

- All Zod schemas use `.passthrough()` so unknown API fields are preserved rather than stripped.
- The content field on Chapter/Verse/Passage/Section is polymorphic: `string` for `html`/`text` content types, `object[]` for `json`.
- `apiResponseSchema<T>` wraps every response with `{ data: T, meta?: FumsMetadata }`.

#### Error handling

`RateLimitError` (429) and `ServerError` (5xx) are automatically retried by `Fetcher`; all others propagate immediately. After `maxAttempts` the last error is re-thrown.

#### Testing

Tests live in `packages/typescript/tests/`. All HTTP calls use a mocked `fetch` — no live API requests are made. Vitest with Node environment.

## Reminder

<tone_preference>
Keep outputs reasonably concise.
</tone_preference>
