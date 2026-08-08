# TASK-RELEASE-001: Prepare stable release 0.0.1

- Status: Completed
- Type: Maintenance
- Priority: High
- Module: MOD-CLI
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Docu-docu Team
- Last updated: 2026-08-07

## Result

The repository is locally ready to publish a stable release `0.0.1`: version,
deterministic portals, reviews, release bundle and GitHub workflow
are consistent, but the tag and post fail.

## Scope

- `Makefile`;
- `.github/workflows/`;
- `internal/app/`;
- `docs/`;
- `README.md`;
- `CHANGELOG.md`;
- `project-docs/`;
- `example/project-docs/`.

## Out of scope

- creating a Git tag;
- setting up or reading GitHub remote;
- push, GitHub Actions and GitHub Release publication;
- changing the set or signatures of CLI commands, Go API exports and JSON structure
  schema v1; only the value of the existing `docu-docu.Version` constant changes.

## Acceptance criteria

- [x] `AC-01` The CLI and canonical documentation use the `0.0.1` version, and
  release workflow accepts a tag with exactly the same name.
- [x] `AC-02` Identical sources give the same byte-by-byte
  `assets/search-index.js` regardless of the order in which the metadata map is traversed.
- [x] `AC-03` Single local command checks formatting, Go code,
  race detector, modules and both documentation root.
- [x] `AC-04` The local release bundle contains six target binaries,
  notices, licenses and verifiable `checksums.txt`.
- [x] `AC-05` The original documentation and both monitored portals are consistent with
  behavior of the release without prematurely marking the publication.

## Plan

1. Fix the version and release contract.
2. Eliminate non-deterministic ordering of the search index.
3. Unify local and CI release gates.
4. Update documentation and rebuild portals.
5. Perform a full local release cycle without accessing GitHub.
6. Get an independent semantic review of the changed release documentation.

## Verification

- `AC-01` → `go run ./cmd/docu-docu version && test "$(go run ./cmd/docu-docu version)" = "0.0.1"`
- `AC-02` → `go test ./internal/app -run TestSearchIndexMetadataOrderIsDeterministic`
- `AC-03` → `make check`
- `AC-04` → `make release && cd dist && sha256sum -c checksums.txt`
- `AC-05` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/docu-docu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Documentation impact

Version, current state, completed Changes entities, canonical are updated
changelog and description of dependency-free delivery. Both monitored portals
rebuilt from the original Markdown.

## Use-case omission reason

The task changes release engineering and artifact reproducibility without adding
new custom CLI script.
