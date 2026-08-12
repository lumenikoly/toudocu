# UC-AGENT-01: Install the Toudocu AI skill

- Identifier: UC-AGENT-01
- Status: Completed
- Actor: Toudocu user
- Module: MOD-CLI
- Priority: High
- Last updated: 2026-08-12

The user installs the embedded offline `toudocu` skill package in project or
user scope for a supported AI host and can safely inspect, update, or remove the
managed copy.

## Inputs

- operation `install`, `status`, `update`, or `uninstall`;
- AI host or `auto`/`all` mode;
- `project` or `user` scope;
- optional repository root for project scope.

## Preconditions

- the target boundary is accessible to the current user;
- a conflicting unmanaged or locally modified copy is resolved manually;
- the skill is installed from the current binary's bundle without network or shell.

## Main scenario

1. The user first runs `toudocu skill status` or directly selects a mutating operation.
2. The CLI determines the host, scope, and boundary and prints the absolute target.
3. The planner classifies the existing copy and completes read-only planning for all selected targets.
4. `install` publishes a missing bundle or updates an unchanged outdated managed copy; `update` updates only an existing managed copy.
5. `uninstall` removes only an unchanged managed copy, while `status` writes nothing.
6. The command reports the final state of every target and returns `0` when all operations succeed or are allowed no-ops.

## Error scenarios

- ambiguous `auto` in a non-TTY returns `SKILL_AGENT_REQUIRED`;
- a symlink/reparse point, boundary escape, or equality with the root returns `SKILL_PATH_UNSAFE` without replacing the target;
- an unmanaged, modified, damaged, or newer copy is not overwritten;
- a target change after planning blocks publication;
- a publication failure restores the previous copy, while impossible rollback preserves the backup and returns `SKILL_RESTORE_FAILED`.

## Postconditions

After a successful `install`, `update`, or `uninstall`, the target is absent or
contains the exact managed copy of the embedded bundle and manifest schema v1.
`status` only reports state. User files are preserved on conflict.

## Acceptance criteria

- [x] After a successful `install`, `update`, or `uninstall`, the target is
  absent or contains the exact managed copy of the embedded bundle and manifest
  schema v1.
- [x] User files are preserved on conflict.

## Business rules

- [BR-CLI-008](../modules/cli.md#br-cli-008-a-managed-skill-does-not-overwrite-user-changes) — the lifecycle needs no `--force` and does not replace conflicting copies.
- [BR-CLI-009](../modules/cli.md#br-cli-009-the-skill-lifecycle-works-offline) — the package is read only from the current binary.

## Implementation

- [CLI and workflow tasks](../modules/cli.md)
- [Installing the AI skill](../guides/skill-installation.md)
- [CLI contract](../contracts/cli.md)

## Verification

- bundle, registry, version, and manifest unit tests;
- project/user lifecycle and multi-target CLI tests;
- negative checks for boundary, symlink, hostile manifest, and target swap;
- race tests and CGO-disabled cross-builds for supported targets.
