# TASK-DOCS-003: Add explicit skill initialization

- Status: Completed
- Type: Documentation
- Priority: High
- Module: MOD-MODEL
- Standards: STD-GO-001, STD-DOCS-001
- Last updated: 2026-08-10

## Result

The user connects Toudocu to a project only through explicit `$toudocu init`.
When needed, the skill creates minimal documentation and adds a constrained
managed guidance block to `AGENTS.md`.

## Behavior change

### Before

The skill had no separate first-run workflow, and the previous process proposed
a `TASK-*` for almost every request.

### After

Only `$toudocu init` performs a read-only preflight, creates a missing
`docs/index.md`, installs the managed `AGENTS.md` block, and runs the structural
check. Ordinary calls do not change project instructions. A new `TASK-*` is
created only for substantial work.

## Scope

- `skills/toudocu/`;
- `skill_templates_test.go`;
- `README.md`;
- `CHANGELOG.md`;
- `docs/guides/work-items.md`;
- `docs/work/TASK-DOCS-003.md`.

## Out of scope

- new Go CLI command `toudocu init`;
- automatic change of `AGENTS.md` when skill is implicitly triggered;
- external runtime or dependency for Markdown merging;
- creation of complete starter pack documentation.

## Acceptance criteria

- [x] `AC-01` Skill treats `$toudocu init` as the only explicit
  onboarding call with read-only preflight, minimal `index.md`,
  controlled by the `AGENTS.md` block and the final check.
- [x] `AC-02` Russian and English blocks use the same stable
  tokens, limit skill triggers and disable `TASK-*` for each prompt.
- [x] `AC-03` Task workflow creates a new work item only for essential
  work or at the explicit request of the user or project.
- [x] `AC-04` Metadata skill describes an explicit init and remains valid.

## Plan

- [x] Add init reference and RU/EN project-guidance assets.
- [x] Synchronize SKILL.md, workflow and metadata.
- [x] Fix the contract with tests and user documentation.
- [x] Perform semantic review and full verification cycle.

## Verification

- `AC-01` → `go test ./... -run TestUseToudocuInitContract`
- `AC-02` → `go test ./... -run TestUseToudocuProjectGuidanceTemplates`
- `AC-03` → `go test ./... -run TestUseToudocuTaskCreationThreshold`
- `AC-04` → `go test ./... -run TestUseToudocuMetadata`
- `ALL` → `go test ./...`
- `DOCS` → `go run ./cmd/toudocu check ./docs --strict --stale-days 0`
- `QUALITY` → `go test ./... -run 'TestUseToudocu'`

## Documentation impact

Updated `skills/toudocu/`, `README.md`, `CHANGELOG.md`,
`docs/guides/work-items.md` and `skill_templates_test.go`. Public Go API, CLI
and JSON schema do not change; generated portals cannot be edited.

## Use-case omission reason

The change determines the behavior of the installed AI-skill and does not change
observable Go CLI or static-portal behavior.
