<!-- toudocu
id: TASK-SITE-005
status: done
taskType: feature
priority: normal
module: MOD-SITE
useCase: UC-DOCS-03
flow: FLOW-DOCS-SERVE
screens: SC-SITE-HOME
standards: STD-GO-001, STD-DOCS-001
updated: 2026-08-10
-->

# TASK-SITE-005: Show an available update in the serve portal


<!-- toudocu:section result -->
## Result

Canonical `toudocu serve` can check the latest stable GitHub release without
blocking the portal. If it is newer than the running binary, the portal shows
a small prompt that opens the official release page. Static builds, translated
portals, and the binary itself remain self-contained.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The user learns about a new release only outside Toudocu or by opening GitHub
Releases manually.

<!-- toudocu:section after -->
### After

When the canonical serve portal is opened for the first time, the browser
asynchronously requests a same-origin version endpoint. Go compares the stable
release once per process and returns a safe typed state. The banner can be
dismissed for the specific latest version; `--no-update-check` disables the
outbound request completely.

<!-- toudocu:section scope -->
## Scope

- `internal/app/`, `internal/site/`, and `api.go` — CLI option, checker,
  endpoint, and bootstrap.
- `web/src/`, `web/tests/`, and `internal/site/assets/generated/` — serve-only
  banner, styles, localization, build, and browser tests.
- `docs/` — work item, ADR, CLI/HTTP contracts, architecture, module, use case,
  flow, screen, and references.

<!-- toudocu:section out-of-scope -->
## Out of scope

- Self-update, running an installer, or replacing the binary from the browser.
- Checking release candidates, plugins, or other repositories.
- Outbound requests from static builds, locale portals, or direct translation
  serves.
- Changing the `docs-en` translation root.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] `AC-01` `serve --no-update-check` disables the update capability,
  endpoint, and outbound request; other commands reject the flag.
- [x] `AC-02` `GET|HEAD /_toudocu/api/version` returns schema v1,
  `no-store`/`nosniff`, the current version, and `up-to-date`,
  `update-available`, or `unavailable`; other methods receive `405`.
- [x] `AC-03` The checker limits timeout and response size, accepts only stable
  `X.Y.Z`, constructs a link only for the official repository, and caches one
  result per process without blocking the main server mutex.
- [x] `AC-04` The serve-only banner shows current/latest versions, opens the
  official release, is keyboard- and mobile-accessible, preserves dismissal
  for the latest version, and is hidden for errors or an up-to-date version.
- [x] `AC-05` Static output, locale portals, and direct translation serves have
  no update endpoint/capability or server-only UI; bootstrap remains schema v1.
- [x] `AC-06` The ADR, contracts, architecture, module, use case, flow, screen,
  and reference agree with the behavior.

<!-- toudocu:section plan -->
## Plan

- [x] Add the CLI option, update checker, HTTP route, and bootstrap capability.
- [x] Add an accessible serve-only banner and dismissal lifecycle.
- [x] Cover backend, frontend, static isolation, and browser behavior.
- [x] Update the canonical documentation sources.

<!-- toudocu:section verification -->
## Verification

- `AC-01` → `go test ./internal/app -run 'TestParseUpdateCheckFlag|TestVersionEndpointDisabled'`
- `AC-02` → `go test ./internal/app -run TestVersionEndpoint`
- `AC-03` → `go test ./internal/app -run TestUpdateChecker`
- `AC-04` → `npm --prefix web run typecheck && npm --prefix web run test:browser`
- `AC-05` → `go test ./internal/app ./internal/site && npm --prefix web test`
- `AC-06` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `go test ./... && go test -race ./... && npm --prefix web test && npm --prefix web run test:browser`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `go vet ./... && go mod verify && npm --prefix web run typecheck`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Adds an ADR for the narrow opt-out network exception. Updates the Editor
OpenAPI/behavior contract, CLI contract/help, architecture boundaries,
MOD-SITE, UC-DOCS-03, FLOW-DOCS-SERVE, SC-SITE-HOME, and capability reference.
No new screen is created: the banner is a state of the existing portal shell.
