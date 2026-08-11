# TASK-RELEASE-001: Build stable release 0.0.1

- Status: Completed
- Type: Maintenance
- Priority: High
- Module: MOD-CLI
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu team
- Last updated: 2026-08-11

## Result

The repository contains an aligned `0.0.1` version, reproducible portal build,
local checks, release bundle, and GitHub Actions workflow. Creating the tag and
starting publication were deliberately outside this task.

## Scope

- `Makefile`;
- `.github/workflows/`;
- `internal/app/`;
- `docs/`;
- `README.md`;
- `CHANGELOG.md`;
- `project-docs/`;

## Out of scope

- creating a Git tag;
- configuring or reading the remote GitHub repository;
- `push`, starting GitHub Actions, and publishing a GitHub Release;
- changing the command set, public Go API, or JSON schema v1 structure. Only
  the existing `toudocu.Version` constant changed.

## Acceptance criteria

- [x] `AC-01` The CLI and canonical documentation use version `0.0.1`, and the
  release workflow accepts a tag with exactly the same name.
- [x] `AC-02` Identical sources produce the same `assets/search-index.js`
  regardless of metadata map traversal order.
- [x] `AC-03` One local command checks formatting, Go code, race detection,
  modules, and canonical documentation.
- [x] `AC-04` The local release bundle contains six binaries, notices,
  licenses, and a verifiable `checksums.txt`.
- [x] `AC-05` Source documentation and the tracked portal describe the stable
  version and supported installation methods without temporary caveats.

## Plan

1. Fix the version and release contract.
2. Eliminate accidental ordering in the search index.
3. Align local and CI release checks.
4. Update documentation and rebuild portals.
5. Perform a full local release cycle without accessing GitHub.
6. Independently review the meaning of the changed documentation.

## Verification

- `AC-01` → `go run ./cmd/toudocu version && test "$(go run ./cmd/toudocu version)" = "0.0.1"`
- `AC-02` → `go test ./internal/app -run TestSearchIndexMetadataOrderIsDeterministic`
- `AC-03` → `make check`
- `AC-04` → `make release && cd dist && sha256sum -c checksums.txt`
- `AC-05` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Documentation impact

The version, current status, completed Changes entities, root changelog, and
self-contained delivery description were updated. The tracked portal was
rebuilt from Markdown.

## Use-case omission reason

The task concerns release engineering and artifact reproducibility, not a new
user-facing CLI journey.
