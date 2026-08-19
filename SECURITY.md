# Security Policy

This policy covers the SDKs published from this repository, including the Python
package `americanbible-api-bible-sdk` and the JavaScript/TypeScript packages.

## Reporting a Vulnerability

**Please do not open a public issue or pull request for a security
vulnerability.** Public reports expose users before a fix is available.

Report privately through **GitHub Private Vulnerability Reporting**:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Fill in the advisory form with the details below.

This routes the report into a private advisory visible only to the maintainers.

### What to include

- The affected package and version (e.g. `americanbible-api-bible-sdk` 1.0.0).
- A description of the issue and its impact.
- Steps to reproduce, or a minimal proof of concept.
- Any known mitigations or workarounds.

## What to Expect

- **Acknowledgement** within **3 business days**.
- An initial assessment (severity and whether we can reproduce it) within
  **10 business days**.
- We follow **coordinated disclosure**: we will agree a disclosure timeline with
  you, publish a GitHub Security Advisory once a fix is released, and credit you
  unless you prefer to remain anonymous.

## Supported Versions

Security fixes are released for the **latest published minor release** of each
package. Older lines do not receive backported fixes — upgrade to the latest
release to stay covered.

| Package | Supported |
| --- | --- |
| `americanbible-api-bible-sdk` (Python) | latest minor (`1.x`) |
| JavaScript / TypeScript packages | latest minor |

Releases are immutable on their registries (PyPI, npm). A bad release is
**yanked/deprecated** and superseded by a patched version rather than
overwritten.

## Scope

In scope: vulnerabilities in this repository's SDK source — for example, leaking
the API key, sending credentials in cleartext, request/response injection, or
unsafe handling of untrusted API responses.

Out of scope: vulnerabilities in the upstream api.bible service itself (report
those to api.bible), and issues in third-party dependencies that already have a
published advisory — those are tracked via Dependabot and CI dependency scans
(`pip-audit` for Python, `npm audit` for the JavaScript/TypeScript packages).
