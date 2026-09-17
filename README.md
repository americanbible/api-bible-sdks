# api-bible-sdks

Official SDKs for [api.bible](https://api.bible/), maintained by the [American Bible Society](https://americanbible.org/).

## Packages

| Package                                                 | Path                  | Status                        |
| ------------------------------------------------------- | --------------------- | ----------------------------- |
| [`@americanbible/api-bible-sdk`](./packages/typescript) | `packages/typescript` | Active (TypeScript / Node.js) |
| [`@americanbible/api-bible-sdk-react`](./packages/react) | `packages/react`      | Active (React 18+)            |
| [`americanbible-api-bible-sdk`](./packages/python) (Python) | `packages/python`  | Coming soon (Python 3.10+)    |

See each package's README for installation and usage.

The Python SDK is complete and tested but not yet on PyPI — install it from
source in the meantime. See [its README](./packages/python#install).

## Repository layout

This is an [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces) monorepo. JavaScript/TypeScript packages live under `packages/*` and share a single root lockfile. The Python package lives alongside them with its own `pyproject.toml` — npm ignores it.

```
packages/
├── typescript/   # @americanbible/api-bible-sdk
├── react/        # @americanbible/api-bible-sdk-react
└── python/       # americanbible-api-bible-sdk (Python)
```

## Development

Requirements: Node.js 20+ and npm 10+.

```bash
# Install all workspace dependencies (single root lockfile)
npm install

# Run across all workspaces that define each script
npm run typecheck
npm test
npm run build

# Or target a single package
npm run -w @americanbible/api-bible-sdk test
```

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup,
the per-package check commands, commit conventions, and the release process.
By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
Report security issues privately per [SECURITY.md](./SECURITY.md).

## License and terms

These SDKs are licensed under the **Apache License 2.0** — Copyright 2026
American Bible Society. See [LICENSE](./LICENSE). That covers the SDK source in
this repository, and nothing else.

Two things it does not cover:

- **Your use of the API.** Every SDK here calls [api.bible](https://api.bible/),
  which requires your own API key and is governed by api.bible's
  [Terms & Conditions](https://api.bible/terms-and-conditions) — including its
  [acceptable use](https://api.bible/terms-and-conditions#acceptable_use) rules and
  the separate [commercial](https://api.bible/terms-and-conditions#commercial_agreement)
  and [non-commercial](https://api.bible/terms-and-conditions#non_commercial_agreement)
  agreements. Read them before you ship.
- **The content the API returns.** Scripture text and audio are licensed by their
  publishers and rights holders, not by this repository. Most translations carry
  attribution, usage, and reporting obligations of their own. Responses include a
  FUMS token (`meta.fumsToken`) that api.bible's terms expect you to report — see
  each package's README for how to read it.
