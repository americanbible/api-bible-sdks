# Releasing & incident runbook — `@americanbible/api-bible-sdk`

Maintainer-facing. Covers the normal release flow and what to do when a bad
release reaches npm. Releases are **immutable**: never try to overwrite a
published version — fix forward and deprecate the bad one (see
[SECURITY.md](../../SECURITY.md)).

## Prerequisites

- **Automated publish** uses npm Trusted Publishing (OIDC) from
  [`.github/workflows/typescript-release.yml`](../../.github/workflows/typescript-release.yml) —
  no token is stored in the repo. One-time setup: a trusted publisher for this
  package must be configured on npmjs.com pointing at this repo + that workflow.
- **Manual recovery** commands below (`npm deprecate`, `npm dist-tag`,
  `npm unpublish`) are run by a human, not CI. You need publish rights to the
  `@americanbible` scope and an authenticated session: `npm login`. Verify with
  `npm whoami`.

## Cutting a release

1. **Changelog.** Move items from `[Unreleased]` into a new
   `## [x.y.z]` section in [CHANGELOG.md](CHANGELOG.md) and update the link
   refs at the bottom.
2. **Version bump.** Set the new version in [package.json](package.json), then
   `npm run sync-version` so `src/version.ts` (the `User-Agent`) matches. (The
   `prebuild`/`prepublishOnly` hooks also run this; doing it now keeps the diff
   honest.)
3. **Sanity-check locally.** `npm run typecheck && npm run test:coverage && npm run build`,
   then `npm publish --dry-run -w @americanbible/api-bible-sdk` to confirm the
   tarball contents.
4. **Commit** the version + changelog change to `main`.
5. **Tag and push.** `git tag ts-v<x.y.z> && git push origin ts-v<x.y.z>`.
   The tag triggers the release workflow, which re-verifies the tag matches
   `package.json`, runs the full gate via `prepublishOnly`, and publishes with
   `--provenance`.
6. **Verify.** On npmjs.com confirm the new version is `latest`, the provenance
   badge is present, and `npm view @americanbible/api-bible-sdk version` returns
   the expected version.

## Incident: a bad release reached npm

Symptoms: broken build for consumers, a regression, or a security issue in a
published version. Do **not** unpublish-and-republish the same version number —
npm forbids reusing a version, and consumers may have cached it.

### 1. Triage

- Confirm the bad version and which dist-tag points at it:
  `npm dist-tag ls @americanbible/api-bible-sdk`.
- Decide severity: broken/regression (roll forward) vs. security
  (also follow the [SECURITY.md](../../SECURITY.md) disclosure process and open
  a GitHub Security Advisory).

### 2. Stop the bleeding — repoint `latest`

If `latest` points at the bad version and a fix isn't ready this minute, move
`latest` back to the last-good version so fresh `npm install`s stop picking it
up:

```bash
npm dist-tag add @americanbible/api-bible-sdk@<last-good> latest
```

This is reversible and does not delete anything.

### 3. Roll forward — publish a patched version

The primary remedy. Bump the **patch** version, land the fix, and release via
the normal flow above (new `ts-v<x.y.z+1>` tag). This becomes the new `latest`.

### 4. Deprecate the bad version

Leave a breadcrumb so anyone who pinned the bad version sees a warning on
install:

```bash
npm deprecate @americanbible/api-bible-sdk@<bad-version> \
  "Broken release — upgrade to <fixed-version>. See CHANGELOG."
```

Deprecate a range if several versions are affected (e.g. `">=1.2.0 <1.2.4"`).
To clear a deprecation later, run the same command with an empty message `""`.

### 5. Unpublish (last resort, narrow window)

`npm unpublish` is restricted: only within **72 hours** of publish, and npm may
block it if the version has dependents. Prefer deprecate + roll-forward. Only
unpublish a version that is actively harmful and freshly published:

```bash
npm unpublish @americanbible/api-bible-sdk@<bad-version>
```

After unpublishing you **cannot** reuse that version number; ship the fix under
a new version.

### 6. Post-incident

- Ensure the CHANGELOG documents the regression and the fix.
- Add a regression test so the same break can't recur.
- For security incidents, finalize and publish the GitHub Security Advisory per
  [SECURITY.md](../../SECURITY.md).
