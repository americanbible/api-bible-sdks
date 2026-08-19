# Contributing

Thanks for your interest in improving the api.bible SDKs. This is an
[npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) monorepo
with three published packages:

| Package | Path | Toolchain |
| --- | --- | --- |
| `@americanbible/api-bible-sdk` | `packages/typescript` | Node 20+, npm |
| `@americanbible/api-bible-sdk-react` | `packages/react` | Node 20+, npm |
| `americanbible-api-bible-sdk` (Python) | `packages/python` | Python 3.10+ |

The JavaScript/TypeScript packages share a single root lockfile; the Python
package stands alone with its own `pyproject.toml`.

## Prerequisites

- **Node.js 20+** and **npm 10+** for the TS and React packages. A `.nvmrc` /
  `.node-version` pins the major — `nvm use` (or `fnm use` / `nodenv`) picks it up.
- **Python 3.10+** for the Python package.

## Setup

```bash
# From the repo root — installs every JS/TS workspace from the single lockfile.
npm install
```

For the Python package (separate toolchain, matches CI):

```bash
cd packages/python
pip install -e ".[dev]" -c requirements-dev.txt
```

## Everyday commands

Run across all JS/TS workspaces from the root, or target one with `-w`:

```bash
npm run typecheck          # all workspaces
npm test                   # all workspaces
npm run build              # all workspaces

npm run -w @americanbible/api-bible-sdk-react test           # one package
npm run -w @americanbible/api-bible-sdk-react lint
npm run -w @americanbible/api-bible-sdk-react test:coverage
```

**React depends on the _built_ core.** The React SDK resolves
`@americanbible/api-bible-sdk` from its `dist/` (gitignored), so build the core
before you typecheck/test/build React:

```bash
npm run build -w @americanbible/api-bible-sdk
```

Python:

```bash
cd packages/python
ruff check . && mypy && pytest --cov=api_bible
```

## Before you open a PR

- **Green gate.** `typecheck`, `lint` (zero warnings — `eslint --max-warnings 0`),
  tests, and `build` must all pass. Coverage is threshold-gated (see each
  package's `vitest.config.ts`); keep it at or above the ratchet.
- **Tests.** Add or update tests for behavior changes. New React hooks follow the
  thin-wrapper + per-hook test template already in `packages/react`.
- **Changelog.** Note user-facing changes under `[Unreleased]` in the affected
  package's `CHANGELOG.md`.
- **Commits.** Use [Conventional Commits](https://www.conventionalcommits.org/)
  with a package scope, e.g. `feat(react): …`, `fix(python): …`, `ci: …`,
  `docs(react): …`.

CI runs on every PR (`.github/workflows/ci.yml`): the full gate on Node 20 and 22,
the React SDK against React 18 and 19, and `npm audit` on production deps. The
Python package runs its own lint / type / test workflow.

## Releasing

Maintainers only, and per package — each has its own tag prefix, release
workflow, and runbook:

- TypeScript core: [`packages/typescript/RELEASING.md`](./packages/typescript/RELEASING.md) (`ts-v*` tags)
- React: [`packages/react/RELEASING.md`](./packages/react/RELEASING.md) (`react-v*` tags)

Both publish via npm Trusted Publishing (OIDC) with provenance — no tokens are
stored in the repo.

## Code of Conduct

By participating in this project you agree to abide by the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

Please report vulnerabilities privately per [SECURITY.md](./SECURITY.md) rather
than opening a public issue.

## Contract fixtures

`tests/contract/fixtures/recordings.json` in the TypeScript and Python packages
is recorded from the live API and refreshed monthly by CI. Recorded bodies are
sanitized at capture time — the audio-bible `resourceUrl` is a presigned S3 URL
and `meta.fumsToken` is a live analytics token, neither of which belongs in a
public repo. If you add a fixture case, do not hand-edit the recordings: extend
`sanitizeBody` / `sanitize_body` in `tests/contract/replay.{ts,py}` instead, and
keep the leak-guard tests passing.
