# DES web Playwright end-to-end tests

Primary cross-repository Chromium contracts for [`discrete-event-systems/des-web.rs`](https://github.com/discrete-event-systems/des-web.rs).

**Automation contract:** `des-browser-fleet.v1`

This repository combines two complementary Playwright suites:

- `tests/des-web.spec.mjs` retains the first-party health/readiness, shared-layout, routing-dashboard, htmx partial, mounted-link, hardening-header, and application-404 contracts.
- `tests/des-route-contract.spec.mjs` adds canonical public `/des` routes, catalog ownership, mounted-prefix navigation, bounded public errors, fixture provenance, and gateway-boundary coverage.

Execution lanes:

- **GitHub Actions** runs both suites against a public, checksum-pinned executable fixture reproduced by the production Dockerfile from source revision `77741ec8b5331617f71416748ef5f06846e43a5d`.
- **`gha-indie-worker`** executes the exact bounded `.gha/workflows/playwright.yml` at an immutable merged SHA. The worker uses the same verified fixture, while a separately labeled Kubernetes canary owns live Service and compatibility-alias verification without weakening gateway-only ingress.

The fixture release is [`des-browser-fixture-77741ec8`](https://github.com/discrete-event-systems/des-web.rs/releases/tag/des-browser-fixture-77741ec8), pinned to archive SHA-256:

```text
1d8fe97fc285055558fd2e723789a82118d998a595b57a6e8581562bfd18befa
```

```bash
npm ci
npx playwright install chromium
DES_FORCE_FIXTURE=1 npm test
```

The repository retains HTML, JUnit XML, traces, screenshots, videos, target resolution, fixture provenance, and application logs for 14 days. A trusted GitOps dispatcher submits merged immutable revisions to `gha-indie-worker`.

Ownership and rollout policy are documented in the `discrete-event-systems-test/.github` repository and the Linear project `github.com/discrete-event-systems-test`.
