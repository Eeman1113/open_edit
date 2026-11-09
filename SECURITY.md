# Security policy

## Supported versions

Security fixes go into the latest release on the `main` branch.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through the repository host's private vulnerability
reporting ("Report a vulnerability" under the Security tab on GitHub). Include steps to reproduce, the affected
version or commit, and the impact you expect.

We aim to acknowledge reports within 3 working days and to ship a fix or mitigation within 30 days, and we will
credit you in the release notes unless you prefer otherwise.

## Scope and design notes

- Open_Edit has no accounts and stores photos, settings and history only in the visitor's browser. The server
  never receives photos.
- The server exposes read-only content catalogue endpoints under `/api/*`. Provider URLs and keys are server-only
  environment variables; provider responses are validated and stripped before they reach the browser.
- An optional anonymous session cookie (`oe_sid`, signed, httpOnly) exists only for rate limiting.
- See [docs/platform.md](docs/platform.md) for the privacy model, headers and limits.

Issues in third-party components (model runtimes, npm packages) should also be reported upstream; we will update
the dependency once a fix is available.
