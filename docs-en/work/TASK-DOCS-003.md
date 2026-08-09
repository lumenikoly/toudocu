# TASK-DOCS-003: Add explicit skill initialization

- Status: Completed
- Type: Documentation
- Priority: High
- Module: MOD-MODEL
- Standards: STD-GO-001, STD-DOCS-001
- Owner: Toudocu Team
- Last updated: 2026-07-31

## Result

The user explicitly connects Toudocu to the project via `$toudocu init`;
skill creates minimal documentation when necessary and safely
sets limited usage rules for `AGENTS.md`.

## Behavior change

### Before

Skill did not have a separate onboarding call, but workflow certainly offered
create `TASK-*` for each new request.

### After

Only explicit `$toudocu init` performs preflight, creates the missing one
`docs/index.md`, sets the `AGENTS.md` managed block and runs
structural check. Regular calls do not change project instructions, but new ones
`TASK-*` are created only for essential work.

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
Observable Go CLI or static portal user script.