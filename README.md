# des-web Playwright E2E

Independent Playwright browser contracts for [`discrete-event-systems/des-web.rs`](https://github.com/discrete-event-systems/des-web.rs).

## Runner lanes

- **GitHub Actions** starts the immutable deployed `des-web` image locally, runs Chromium contracts, and retains traces, screenshots, video, HTML reports, and server logs on failure.
- **gha-indie-worker** consumes `.github/workflows/gha-indie-worker.yml` at an exact merged commit SHA and maps it to the fixed `playwright` profile. The suite defaults to the cluster-local `dd-des-web` service.

The suite verifies health/readiness, canonical pages, `/des` path rewriting, direct htmx partials, degraded-mode catalog behavior, browser hardening headers, and the application 404.

## Tracking

- Product project: https://github.com/orgs/discrete-event-systems/projects/2
- Test project: https://github.com/orgs/discrete-event-systems-test/projects/1
- Linear project: https://linear.app/denman/project/githubcomdiscrete-event-systems-4a3086ae0c45

`gha-indie-worker` execution is intentionally disabled at the platform level until its repository/profile allowlist and runtime network access are certified; planning remains available.
