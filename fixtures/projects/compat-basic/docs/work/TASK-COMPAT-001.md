<!-- toudocu
id: TASK-COMPAT-001
status: ready
taskType: feature
priority: high
module: MOD-COMPAT
useCase: UC-COMPAT
updated: 2026-09-01
-->

# TASK-COMPAT-001: Implement the compatibility path

<!-- toudocu:section result -->
## Result

The compatibility path is available.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The path was unavailable.

<!-- toudocu:section after -->
### After

The path is available.

<!-- toudocu:section scope -->
## Scope

- `docs`

<!-- toudocu:section out-of-scope -->
## Out of scope

New product features.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [ ] `AC-01` The path returns the expected report.

<!-- toudocu:section plan -->
## Plan

1. Implement the path.
2. Verify it.

<!-- toudocu:section verification -->
## Verification

- `AC-01` -> `go version`
- `ALL` -> `go version`
- `DOCS` -> `go version`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update the compatibility corpus when the contract changes.
