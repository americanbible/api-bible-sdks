# Releasing & incident runbook — `@americanbible/api-bible-sdk-react`

Maintainer-facing. Covers the normal release flow and what to do when a bad
release reaches npm. Releases are **immutable**: never try to overwrite a
published version — fix forward and deprecate the bad one (see
[SECURITY.md](../../SECURITY.md)).

This package depends on the core SDK (`@americanbible/api-bible-sdk`) as a
**peer** dependency (`^1.1.0`), ships no runtime dependencies of its own, and is
versioned and released **independently** of the core.

## Prerequisites

- **Automated publish** uses npm Trusted Publishing (OIDC) from
  [`.github/workflows/react-release.yml`](../../.github/workflows/react-release.yml) —
  no token is stored in the repo. One-time setup: a trusted publisher for this
  package must be configured on npmjs.com pointing at this repo + that workflow.
- **Manual recovery** commands below (`npm deprecate`, `npm dist-tag`,
  `npm unpublish`) are run by a human, not CI. You need publish rights to the
  `@americanbible` scope and an authenticated session: `npm login`. Verify with
  `npm whoami`.

## Cutting a release

1. **Changelog.** Move items from `[Unreleased]` into a new dated
   `## [x.y.z] - YYYY-MM-DD` section in [CHANGELOG.md](CHANGELOG.md).
2. **Version bump.** Set the new version in [package.json](package.json). Unlike
   the core, the React package embeds no version string (no `User-Agent`), so
   there is nothing else to sync — update the README "Status" marker if the
   preview line changed.
3. **Sanity-check locally.** The React SDK resolves the core from its gitignored
   `dist/`, so build the core first, then run the full gate and inspect the
   tarball:
   ```bash
   npm run build -w @americanbible/api-bible-sdk
   npm run lint -w @americanbible/api-bible-sdk-react
   npm run typecheck -w @americanbible/api-bible-sdk-react
   npm run test:coverage -w @americanbible/api-bible-sdk-react
   npm run build -w @americanbible/api-bible-sdk-react
   npm publish --dry-run -w @americanbible/api-bible-sdk-react
   ```
4. **Commit** the version + changelog change to `main` (via PR).
5. **Tag and push.** `git tag react-v<x.y.z> && git push origin react-v<x.y.z>`.
   The tag triggers the release workflow, which re-verifies the tag matches
   `package.json`, runs the full gate via `prepublishOnly`, and publishes with
   `--provenance`. A **prerelease** version (a hyphen, e.g. `1.0.0-beta.1`) is
   published under the `next` dist-tag; a stable version goes to `latest`.
6. **Verify.** On npmjs.com confirm the provenance badge is present, then check
   the version and dist-tag:
   ```bash
   npm view @americanbible/api-bible-sdk-react version
   npm dist-tag ls @americanbible/api-bible-sdk-react
   ```
   For a prerelease, confirm it landed on `next` (not `latest`).

## Incident: a bad release reached npm

Symptoms: broken build for consumers, a regression, or a security issue in a
published version. Do **not** unpublish-and-republish the same version number —
npm forbids reusing a version, and consumers may have cached it.

### 1. Triage

- Confirm the bad version and which dist-tag points at it:
  `npm dist-tag ls @americanbible/api-bible-sdk-react`.
- If the break is a peer mismatch (the SDK requires a core version consumers do
  not have), check the `peerDependencies["@americanbible/api-bible-sdk"]` range
  in the bad version against the core versions published on npm.
- Decide severity: broken/regression (roll forward) vs. security (also follow the
  [SECURITY.md](../../SECURITY.md) disclosure process and open a GitHub Security
  Advisory).

### 2. Stop the bleeding — repoint `latest`

If `latest` points at the bad version and a fix isn't ready this minute, move
`latest` back to the last-good version so fresh `npm install`s stop picking it up:

```bash
npm dist-tag add @americanbible/api-bible-sdk-react@<last-good> latest
```

This is reversible and deletes nothing. (If the bad version was a prerelease on
`next`, repoint `next` at the last-good prerelease instead.)

### 3. Roll forward — publish a patched version

The primary remedy. Bump the **patch** version, land the fix, and release via the
normal flow above (new `react-v<x.y.z+1>` tag). This becomes the new `latest`.

### 4. Deprecate the bad version

Leave a breadcrumb so anyone who pinned the bad version sees a warning on install:

```bash
npm deprecate @americanbible/api-bible-sdk-react@<bad-version> \
  "Broken release — upgrade to <fixed-version>. See CHANGELOG."
```

Deprecate a range if several versions are affected (e.g. `">=0.2.0 <0.2.3"`). To
clear a deprecation later, run the same command with an empty message `""`.

### 5. Unpublish (last resort, narrow window)

`npm unpublish` is restricted: only within **72 hours** of publish, and npm may
block it if the version has dependents. Prefer deprecate + roll-forward. Only
unpublish a version that is actively harmful and freshly published:

```bash
npm unpublish @americanbible/api-bible-sdk-react@<bad-version>
```

After unpublishing you **cannot** reuse that version number; ship the fix under a
new version.

### 6. Post-incident

- Ensure the CHANGELOG documents the regression and the fix.
- Add a regression test so the same break can't recur.
- For security incidents, finalize and publish the GitHub Security Advisory per
  [SECURITY.md](../../SECURITY.md).
