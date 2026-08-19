## What and why

<!-- What changes, and what problem it solves. Link the issue if there is one. -->

## Packages touched

- [ ] `packages/typescript` (`@americanbible/api-bible-sdk`)
- [ ] `packages/react` (`@americanbible/api-bible-sdk-react`)
- [ ] `packages/python` (`americanbible-api-bible-sdk`)
- [ ] Repo tooling / docs / CI

## Checks

- [ ] `npm run typecheck && npm run test` pass (JS/TS packages)
- [ ] `ruff check . && ruff format --check . && mypy && pytest` pass (Python package)
- [ ] Public API changes are reflected in the package README and `CHANGELOG.md`
- [ ] No credentials, API keys, or live tokens are added to the diff — including
      in test fixtures (see [CONTRIBUTING.md](https://github.com/americanbible/api-bible-sdks/blob/main/CONTRIBUTING.md#contract-fixtures))

## Breaking changes

<!-- None, or describe the migration path. -->
