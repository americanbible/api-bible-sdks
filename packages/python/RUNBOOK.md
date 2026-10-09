# Incident runbook — `americanbible-api-bible-sdk` (Python)

Maintainer-facing. The normal release flow is in the README's
[Releasing](README.md#releasing) section. This file covers what to do when
something goes wrong. PyPI releases are **immutable**: never try to re-publish a
version. Yank the bad one and fix forward.

## Who gets alerted

| Signal | Who is notified today | Where to look |
| --- | --- | --- |
| Nightly live contract test ([`contract.yml`](../../.github/workflows/contract.yml), 07:00 UTC) | GitHub's default email only, sent to the user who last edited the workflow's `cron` line (currently **@mjvinti**), and only if their Actions notification settings include failed workflows | Actions → Contract (live api.bible) |
| Release workflow ([`python-release.yml`](../../.github/workflows/python-release.yml)) | The user who pushed the `py-v*` tag | Actions → Python Release |
| Release approval (`pypi` environment) | Required reviewers: **@mjvinti** only | The pending run's "Review deployments" button |
| Vulnerability report | Repository admins, via GitHub Private Vulnerability Reporting | Security → Advisories |
| Dependency vulnerability | Dependabot alerts and the `audit-pip` CI job | Security → Dependabot |

Two single points of failure to fix:

- **Contract failures** reach one inbox. If that person is away, schema drift
  goes unnoticed until users report it. Either have the job open an issue on
  failure, or add a second maintainer who watches the Actions tab.
- **Release approval** needs one person. Add a second required reviewer to the
  `pypi` environment (Settings → Environments → `pypi`) so a fix can still ship
  when they're out.

## Nightly contract test failed

The job checks live api.bible responses against the SDK models. Models accept
unknown fields (`extra="allow"`), so a failure means a field the SDK relies on
was removed, renamed or changed type, or the job itself broke.

1. **Open the failed run** and check which step failed (TypeScript, Python or both).
2. **Rule out the job itself.**
   - A `401`/`403` means the `BIBLE_API_KEY` repository secret expired or was
     revoked. Rotate it under Settings → Secrets and variables → Actions.
   - A timeout or connection error is probably a network blip. Re-run the job.
     If it fails again, check api.bible's status before assuming drift.
3. **Reproduce locally** from `packages/python`:

   ```bash
   API_BIBLE_KEY=... pytest -m live tests/contract/test_contract_live.py
   ```

4. **Fix forward.**
   - Update the model in `src/api_bible/models.py`, e.g. make a field optional
     that the API now omits.
   - Re-record the fixtures, by running `refresh-fixtures.yml` (Actions → Run
     workflow) or locally with
     `API_BIBLE_KEY=... python tests/contract/record_fixtures.py`.
   - Release a **patch** version.
   - If the TypeScript job failed too, its schema needs the same fix.

## A bad release reached PyPI

Symptoms: install or import failures, a regression, or a security issue in a
published version. The README's [Rollback](README.md#releasing) note has the
short version: yank, then fix forward. In more detail:

1. **Triage.** Identify the bad version and the last good one. If it's a
   security issue, also follow [the security advisory flow](#security-advisory-flow).
2. **Yank the bad version.** On pypi.org: Manage project → Releases → the
   version → Options → **Yank**, with a reason such as "Broken: use X.Y.Z+1".
   - A yanked release stays installable for anyone who pins it exactly
     (`==X.Y.Z`), but resolvers skip it otherwise. Existing lockfiles keep
     working while new installs move off it.
   - Yanking can be undone.
   - Don't **delete** the release. Deleting doesn't free the version number,
     and it breaks every pinned install.
3. **Fix forward.**
   - Land the fix on `main` with a regression test.
   - Bump the **patch** version and add a CHANGELOG entry that names the bad
     version.
   - Release through the normal flow with a new `py-v*` tag. Never retag or
     reuse a version.
4. **Follow up.**
   - Make sure the CHANGELOG describes both the regression and the fix.
   - If the bad release got past the release gate, add whatever check would
     have caught it to `python-release.yml`.

## Security advisory flow

[SECURITY.md](../../SECURITY.md) defines the reporting channel, response times
and supported versions. The maintainer side:

1. A report arrives as a **draft advisory** (Security → Advisories). Acknowledge
   it within 3 business days and assess severity within 10.
2. Develop the fix in the advisory's **temporary private fork**, so the
   vulnerability isn't public before a release. Request a CVE from the advisory
   if the issue warrants one.
3. Merge the fix to `main` and release a patched version through the normal
   flow. SECURITY.md commits to fixing the latest minor only.
4. **Publish the advisory**, listing the affected and patched versions, and
   credit the reporter unless they asked not to be named.
5. Yank the affected versions if using them stays dangerous after the fix ships.

## PyPI ownership and publishing credentials

Publishing uses PyPI Trusted Publishing: PyPI accepts uploads only from
`python-release.yml`, running in the `pypi` environment of
`americanbible/api-bible-sdks`. No API token is stored anywhere.

**Before the first release.** The PyPI project doesn't exist yet, so register a
**pending publisher**. On pypi.org: Account settings → Publishing → Add a
pending publisher, with:

| Field | Value |
| --- | --- |
| Project | `americanbible-api-bible-sdk` |
| Owner | `americanbible` |
| Repository | `api-bible-sdks` |
| Workflow | `python-release.yml` |
| Environment | `pypi` |

The first tagged release then creates the project.

**Keep at least two owners.** After the first release, add a second maintainer
as **Owner** (Manage project → Collaborators). That way losing one account
doesn't lock the project. Both accounts need 2FA, which PyPI requires. Moving
the project into a PyPI organization for American Bible Society also makes
ownership independent of any one person.

**If publishing is compromised**, act on whichever of these applies:

- **A malicious or unexpected version appears on PyPI.**
  - Yank it immediately.
  - Email security@pypi.org to have the files removed.
  - Publish a security advisory.
- **The Trusted Publisher config was changed** (an unexpected repository,
  workflow or environment is listed).
  - Remove it under Manage project → Publishing.
  - Review the project's security history on PyPI.
  - Re-add the correct publisher.
- **A maintainer's GitHub account or the release workflow is compromised.**
  - Remove that account's repository access.
  - Delete any `py-v*` tags you didn't push.
  - Review recent changes to `.github/workflows/` and the `pypi` environment's
    reviewers and deployment rules (only `py-v*` tags may deploy).
  - Rotate the `BIBLE_API_KEY` secret.
  - A publish still needs both a `py-v*` tag on `main` and an environment
    approval, so check the Actions history for any approved runs you don't
    recognize.
- **A PyPI owner account is compromised.** Another owner removes it from the
  project. The affected maintainer then recovers their account and revokes any
  API tokens it holds.
