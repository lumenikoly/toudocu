# TASK-SKILL-001: Add embedded Toudocu skill installation

- Status: Done
- Type: Feature
- Priority: High
- Module: MOD-CLI
- Use case: UC-AGENT-01
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu Team
- Last updated: 2026-08-06

## Result

The version `0.0.1` binary contains the canonical `toudocu` skill and provides
a safe offline lifecycle for Codex, Claude Code, and Copilot in project/user scope.

## Behavior change

### Before

The CLI is installed separately, and users manually place the skill in the
chosen AI host directory without verifiable ownership or an update lifecycle.

### After

The `toudocu skill install|status|update|uninstall` commands resolve the
target, classify the existing copy using the manifest/checksums, and change
only an unchanged managed package through atomic publication and rollback.

## Scope

- `skills/`
- `internal/skillinstall/`
- `internal/app/`
- `README.md`
- `docs/`
- `project-docs/`

## Out of scope

- `--force`, `--dry-run`, JSON output, or a new public Go API;
- marketplace support or downloading the skill from the network;
- changing translation root `docs-en`;
- executing scripts from the embedded bundle.

## Acceptance criteria

- [x] `AC-01` The binary embeds the full current `skills/toudocu` package as
  skill `toudocu` version `0.0.1`, validating metadata, paths, collisions, and
  2 MiB/10 MiB limits.
- [x] `AC-02` Registry, detection, target resolution, semver, manifest,
  checksums, and planner cover all eight public states.
- [x] `AC-03` Project/user install, no-op, update, status, uninstall,
  interactive choice, non-TTY ambiguity, and `--agent all` have behavioral tests
  for text output and exit codes.
- [x] `AC-04` Unmanaged/modified/newer/unsafe targets, traversal, symlinks,
  hostile manifests, target swaps, and publish/restore failures cannot overwrite
  user data or launch a shell/network operation.
- [x] `AC-05` README, CLI contract, MOD-CLI, system/runtime/trust boundaries,
  and the guide describe the implemented lifecycle without duplicating sources.
- [x] `AC-06` gofmt, vet, ordinary/race tests, module verification, strict
  canonical docs check, and five CGO-disabled cross-build targets pass.

## Plan

- [x] Embed and validate the canonical skill package.
- [x] Implement the registry, planner, manifest, and safe executor.
- [x] Connect the commands to the CLI without expanding the public facade.
- [x] Add unit, lifecycle, CLI, and security tests.
- [x] Update canonical documentation sources.
- [x] Complete semantic review and the full verification cycle.

## Verification

- `AC-01` → `go test ./skills`
- `AC-02` → `go test ./internal/skillinstall`
- `AC-03` → `go test ./internal/app -run TestSkillCLI`
- `AC-04` → `go test ./internal/skillinstall -run 'Test(Unsafe|Boundary|Modified|Symlink|Mode|Publish|Atomic|InstallDoesNotExecute|StageRejectsTraversal)'`
- `AC-05` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `AC-06` → `make check && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build ./cmd/toudocu && CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go test -c -o /tmp/toudocu-skillinstall-darwin.test ./internal/skillinstall && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go test -c -o /tmp/toudocu-skillinstall-windows.test.exe ./internal/skillinstall`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --repository-root . --strict --stale-days 0`
- `QUALITY` → `make check`

## Documentation impact

The UC and guide are added; README, roadmap, CLI contract, MOD-CLI, feature
reference, and existing architecture answers are updated. After semantic and
structural gates, only the canonical part of the tracked portal is rebuilt.
